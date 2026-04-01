"""LangGraph agent with conversation memory via Lakebase checkpointer."""

import asyncio
import logging
import os
import queue
import threading

import mlflow
from databricks_langchain import ChatDatabricks
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage

from tools import TOOLS

logger = logging.getLogger(__name__)

LLM_ENDPOINT = os.environ.get("MODEL_NAME", "databricks-meta-llama-3-3-70b-instruct")
PROMPT_FILE = os.path.join(os.path.dirname(__file__), "system_prompt.md")


def create_graph(checkpointer):
    """Build and compile the agent."""
    llm = ChatDatabricks(endpoint=LLM_ENDPOINT, timeout=60)
    system_prompt = open(PROMPT_FILE).read().strip()
    logger.info("Loaded system prompt from %s", PROMPT_FILE)
    return create_agent(
        model=llm,
        tools=TOOLS,
        system_prompt=system_prompt,
        checkpointer=checkpointer,
    )


def _tag_trace_session(thread_id: str):
    """Tag the most recent MLflow trace with the thread_id as session."""
    try:
        trace_id = mlflow.get_last_active_trace_id()
        if trace_id:
            mlflow.MlflowClient().set_trace_tag(trace_id, "mlflow.trace.session", thread_id)
    except Exception:
        pass


async def run_agent(graph, thread_id: str, message: str) -> str:
    """Run the agent and return the final response."""

    def _invoke():
        result = graph.invoke(
            {"messages": [HumanMessage(content=message)]},
            config={"configurable": {"thread_id": thread_id}},
        )
        _tag_trace_session(thread_id)
        return result["messages"][-1].content

    return await asyncio.to_thread(_invoke)


async def stream_agent(graph, thread_id: str, message: str):
    """Stream token-by-token output and tool call events.

    Uses stream_mode="messages" for real-time token streaming,
    plus stream_mode="updates" for tool results.

    Yields dicts with:
      {"event": "token", "content": "..."}           — incremental LLM token
      {"event": "tool_call", "id": "...", "name": "...", "args": {...}}  — tool invocation
      {"event": "tools", "tool_call_id": "...", "name": "...", "output": "..."}  — tool result
      {"event": "done", "content": "..."}             — final complete response
    """
    q = queue.Queue()

    def _stream():
        try:
            config = {"configurable": {"thread_id": thread_id}}
            full_content = ""
            pending_tool_calls = {}

            for event, metadata in graph.stream(
                {"messages": [HumanMessage(content=message)]},
                config=config,
                stream_mode="messages",
            ):
                # AIMessageChunk — token-level streaming from the LLM
                if hasattr(event, "type") and event.type == "AIMessageChunk":
                    # Check for tool call chunks
                    if event.tool_call_chunks:
                        for tc_chunk in event.tool_call_chunks:
                            tc_id = tc_chunk.get("id") or tc_chunk.get("index", "")
                            if tc_id and tc_id not in pending_tool_calls:
                                pending_tool_calls[tc_id] = {
                                    "name": tc_chunk.get("name", ""),
                                    "args_str": "",
                                }
                                # Emit tool_call event when we first see it
                                if tc_chunk.get("name"):
                                    q.put({
                                        "event": "tool_call",
                                        "id": tc_id,
                                        "name": tc_chunk["name"],
                                        "args": {},
                                    })
                            # Accumulate args
                            if tc_id and tc_chunk.get("args"):
                                pending_tool_calls[tc_id]["args_str"] += tc_chunk["args"]
                    # Regular content tokens
                    elif event.content:
                        full_content += event.content
                        q.put({"event": "token", "content": event.content})

                # ToolMessage — tool execution result
                elif hasattr(event, "type") and event.type == "tool":
                    content = event.content if isinstance(event.content, str) else str(event.content)
                    q.put({
                        "event": "tools",
                        "tool_call_id": getattr(event, "tool_call_id", ""),
                        "name": getattr(event, "name", ""),
                        "output": content,
                    })

            _tag_trace_session(thread_id)
            q.put({"event": "done", "content": full_content})
            q.put(None)
        except Exception as e:
            q.put({"event": "error", "detail": str(e)})
            q.put(None)

    threading.Thread(target=_stream, daemon=True).start()

    while True:
        item = await asyncio.to_thread(q.get)
        if item is None:
            break
        yield item
