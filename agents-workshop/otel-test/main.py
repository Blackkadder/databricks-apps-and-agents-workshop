"""Minimal FastAPI app for testing Apps OTel -> UC tables export."""

import os
from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(title="OTel Test App")


@app.get("/")
def root():
    return {"status": "ok", "service": os.environ.get("OTEL_SERVICE_NAME", "otel-test-app")}


@app.get("/hello/{name}")
def hello(name: str):
    return {"message": f"Hello, {name}!", "version": "2"}


@app.get("/error")
def trigger_error():
    raise ValueError("intentional test error")
