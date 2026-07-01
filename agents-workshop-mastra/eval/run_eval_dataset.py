# Databricks notebook source
# MAGIC %pip install -U "mlflow[databricks]>=3.9" openai
# COMMAND ----------
dbutils.library.restartPython()

# COMMAND ----------
# Canonical offline eval: runs FROM the registered UC dataset, using the REGISTERED
# judges (single source of truth = eval/judges/, registered via register_judges.py).
import os, json, mlflow
import mlflow.genai.datasets
from mlflow.genai.scorers import get_scorer, Correctness, RelevanceToQuery
from databricks.sdk import WorkspaceClient

# ── Configure for your workspace ──────────────────────────────────────────────
EXP   = "<your-mlflow-experiment-id>"
WH    = "<your-sql-warehouse-id>"
MODEL = "databricks-claude-sonnet-4-6"
JUDGE = "databricks:/databricks-claude-sonnet-4-6"
PROMPT = "<catalog>.<schema>.system_prompt"   # registered in the MLflow Prompt Registry
DS    = "<catalog>.<schema>.eval_golden"       # registered UC eval dataset
# ──────────────────────────────────────────────────────────────────────────────

os.environ["MLFLOW_TRACING_SQL_WAREHOUSE_ID"] = WH
mlflow.set_tracking_uri("databricks")
mlflow.set_experiment(experiment_id=EXP)
client = WorkspaceClient().serving_endpoints.get_open_ai_client()
SYS = mlflow.genai.load_prompt(f"prompts:/{PROMPT}@production").template

def agent(message):
    r = client.chat.completions.create(model=MODEL,
        messages=[{"role": "system", "content": SYS}, {"role": "user", "content": message}], max_tokens=512)
    return {"response": r.choices[0].message.content}

records = [
    {"inputs": {"message": "What does MLflow do, briefly?"},
     "expectations": {"expected_facts": ["MLflow is an open-source platform", "it helps manage the machine learning / GenAI lifecycle", "it provides experiment tracking and model/agent evaluation"]}},
    {"inputs": {"message": "What is Unity Catalog?"},
     "expectations": {"expected_facts": ["it is Databricks' governance layer for data and AI", "it organizes data into catalogs, schemas, and tables", "it provides access control and lineage"]}},
    {"inputs": {"message": "What is a skills taxonomy?"},
     "expectations": {"expected_facts": ["a structured, hierarchical classification of skills", "it standardizes how skills are defined", "it maps skills across roles or content"]}},
    {"inputs": {"message": "What is MLflow Tracing used for?"},
     "expectations": {"expected_facts": ["it captures traces/spans of LLM or agent calls", "it records inputs, outputs, latency, and token usage", "it is used for observability and evaluation"]}},
]
try:
    ds = mlflow.genai.datasets.get_dataset(DS)
except Exception:
    ds = mlflow.genai.datasets.create_dataset(uc_table_name=DS)
ds.merge_records(records)

scorers = [
    get_scorer(name="learning_quality", experiment_id=EXP),   # registered custom judge
    get_scorer(name="helpful_on_topic", experiment_id=EXP),   # registered Guidelines judge
    Correctness(model=JUDGE),                                  # accuracy vs expected_facts
    RelevanceToQuery(model=JUDGE),                             # reference-free relevance
]
res = mlflow.genai.evaluate(data=ds, predict_fn=agent, scorers=scorers)
dbutils.notebook.exit(json.dumps({"dataset": DS, "records": len(ds.to_df()), "run_id": res.run_id, "metrics": res.metrics}, default=str)[:2500])
