"""Agent Workshop API — FastAPI hosting the LangGraph agent."""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import quote_plus

import psycopg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel

from agent import create_graph, run_agent, stream_agent

logging.basicConfig(level=logging.INFO)

# MLflow tracing setup
try:
    import mlflow
    mlflow.set_tracking_uri("databricks")
    exp_name = os.environ.get("MLFLOW_EXPERIMENT_NAME")
    if exp_name:
        mlflow.set_experiment(exp_name)
        logging.info("MLflow experiment: %s", exp_name)
    mlflow.langchain.autolog()
    logging.info("MLflow tracing enabled (tracking_uri=%s)", mlflow.get_tracking_uri())
except Exception as e:
    logging.info("MLflow tracing not available: %s", e)

_pool: Optional[AsyncConnectionPool] = None
_graph = None


def _get_lakebase_conn_str() -> Optional[str]:
    """Build Lakebase connection string from PG* env vars or LAKEBASE_CONN_STR."""
    pghost = os.environ.get("PGHOST")
    if pghost:
        user = quote_plus(os.environ["PGUSER"])
        password = quote_plus(os.environ["PGPASSWORD"])
        database = os.environ.get("PGDATABASE", "databricks_postgres")
        port = os.environ.get("PGPORT", "5432")
        return f"postgresql://{user}:{password}@{pghost}:{port}/{database}?sslmode=require"
    return os.environ.get("LAKEBASE_CONN_STR")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool, _graph
    conn_str = _get_lakebase_conn_str()

    if conn_str:
        _pool = AsyncConnectionPool(conn_str, open=False, min_size=1, max_size=5)
        await _pool.open()

        # Create thread metadata table for titles
        async with _pool.connection() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS thread_metadata (
                    thread_id TEXT PRIMARY KEY,
                    title TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)

        saver_conn = psycopg.connect(conn_str, autocommit=True)
        saver = PostgresSaver(saver_conn)
        saver.setup()
        _graph = create_graph(saver)
        logging.info("Graph created with Lakebase checkpointer")
    else:
        _graph = create_graph(MemorySaver())
        logging.info("Graph created with in-memory checkpointer (local dev mode)")

    yield

    if _pool:
        await _pool.close()


app = FastAPI(title="Agent Workshop API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class ChatRequest(BaseModel):
    thread_id: str
    message: str


@app.get("/")
async def root():
    return FileResponse("index.html")


@app.get("/config")
async def get_config():
    return {"model": os.environ.get("MODEL_NAME", "databricks-meta-llama-3-3-70b-instruct")}


@app.post("/chat")
async def chat(req: ChatRequest):
    logging.info("POST /chat thread=%s", req.thread_id)
    try:
        response = await asyncio.wait_for(
            run_agent(_graph, req.thread_id, req.message),
            timeout=120,
        )
        # Update thread activity timestamp
        if _pool:
            async with _pool.connection() as conn:
                await conn.execute(
                    """INSERT INTO thread_metadata (thread_id, updated_at)
                       VALUES (%s, NOW())
                       ON CONFLICT (thread_id) DO UPDATE SET updated_at = NOW()""",
                    (req.thread_id,),
                )
        return {"thread_id": req.thread_id, "response": response}
    except asyncio.TimeoutError:
        return JSONResponse(status_code=504, content={"error": "timeout", "detail": "Request timed out after 120s"})
    except Exception as e:
        logging.error("Error for thread %s: %s", req.thread_id, e)
        return JSONResponse(status_code=500, content={"error": "agent_error", "detail": str(e)})


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Stream agent responses as Server-Sent Events."""
    logging.info("POST /chat/stream thread=%s", req.thread_id)

    async def event_generator():
        try:
            async for event in stream_agent(_graph, req.thread_id, req.message):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            logging.error("Stream error for thread %s: %s", req.thread_id, e)
            yield f"data: {json.dumps({'event': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/history/{thread_id}")
async def get_history(thread_id: str):
    if _graph is None:
        return JSONResponse(status_code=503, content={"error": "not_ready"})
    try:
        config = {"configurable": {"thread_id": thread_id}}
        state = await asyncio.to_thread(_graph.get_state, config)
        messages = []
        for msg in state.values.get("messages", []):
            msg_type = getattr(msg, "type", None)
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            if msg_type == "human":
                messages.append({"role": "user", "content": content})
            elif msg_type == "ai":
                tool_calls = [
                    {"id": tc.get("id", ""), "name": tc.get("name", ""), "args": tc.get("args", {})}
                    for tc in (getattr(msg, "tool_calls", None) or [])
                ]
                if tool_calls:
                    messages.append({"role": "assistant", "content": content, "tool_calls": tool_calls})
                elif content.strip():
                    messages.append({"role": "assistant", "content": content})
            elif msg_type == "tool":
                messages.append({
                    "role": "tool",
                    "content": content,
                    "tool_call_id": getattr(msg, "tool_call_id", ""),
                    "name": getattr(msg, "name", ""),
                })
        return {"messages": messages}
    except Exception as e:
        logging.error("Failed to get history for %s: %s", thread_id, e)
        return JSONResponse(status_code=500, content={"error": "db_error", "detail": str(e)})


@app.get("/threads")
async def list_threads():
    if _pool is None:
        return {"threads": []}
    try:
        async with _pool.connection() as conn:
            result = await conn.execute("""
                SELECT c.thread_id, m.title, COALESCE(m.updated_at, m.created_at) as last_active
                FROM (SELECT DISTINCT thread_id FROM checkpoints) c
                LEFT JOIN thread_metadata m ON c.thread_id = m.thread_id
                ORDER BY last_active DESC NULLS LAST, c.thread_id DESC
            """)
            rows = await result.fetchall()
        return {"threads": [
            {"id": r[0], "title": r[1], "last_active": r[2].isoformat() if r[2] else None}
            for r in rows
        ]}
    except Exception as e:
        logging.error("Failed to list threads: %s", e)
        return JSONResponse(status_code=500, content={"error": "db_error", "detail": str(e)})


class ThreadUpdate(BaseModel):
    title: str


@app.patch("/threads/{thread_id}")
async def rename_thread(thread_id: str, req: ThreadUpdate):
    if _pool is None:
        return JSONResponse(status_code=503, content={"error": "not_ready"})
    try:
        async with _pool.connection() as conn:
            await conn.execute(
                """INSERT INTO thread_metadata (thread_id, title, updated_at)
                   VALUES (%s, %s, NOW())
                   ON CONFLICT (thread_id) DO UPDATE SET title = %s, updated_at = NOW()""",
                (thread_id, req.title, req.title),
            )
        return {"thread_id": thread_id, "title": req.title}
    except Exception as e:
        logging.error("Failed to rename thread %s: %s", thread_id, e)
        return JSONResponse(status_code=500, content={"error": "db_error", "detail": str(e)})


@app.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str):
    if _pool is None:
        return JSONResponse(status_code=503, content={"error": "not_ready"})
    try:
        async with _pool.connection() as conn:
            await conn.execute("DELETE FROM checkpoints WHERE thread_id = %s", (thread_id,))
            await conn.execute("DELETE FROM checkpoint_blobs WHERE thread_id = %s", (thread_id,))
            await conn.execute("DELETE FROM checkpoint_writes WHERE thread_id = %s", (thread_id,))
            await conn.execute("DELETE FROM thread_metadata WHERE thread_id = %s", (thread_id,))
        return {"deleted": thread_id}
    except Exception as e:
        logging.error("Failed to delete thread %s: %s", thread_id, e)
        return JSONResponse(status_code=500, content={"error": "db_error", "detail": str(e)})


@app.get("/health")
async def health():
    return {"status": "ok"}
