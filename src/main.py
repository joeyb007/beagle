"""FastAPI entrypoint for the consolidated agent process.

Startup: apply schema, bring up the Photon sidecar (real or fake), wire the
Orchestrator, and start listening for iMessage events.

Run: .venv/bin/uvicorn src.main:app
"""

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from src.agent.sparks import SparkWorker
from src.wiring import REPO_ROOT, build_orchestrator


@asynccontextmanager
async def lifespan(app: FastAPI):
    orchestrator, messaging = build_orchestrator()
    await messaging.ensure_running()
    orchestrator.start()
    sparks = SparkWorker(
        db_path=os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
        messaging=messaging,
        llm=orchestrator._llm,  # consolidation glue: same router, same routing_log
    )
    spark_task = asyncio.create_task(sparks.run_forever())
    app.state.orchestrator = orchestrator
    app.state.messaging = messaging
    print("[beagle] agent listening — say 'Hey Beagle' in the group chat")
    yield
    spark_task.cancel()
    await messaging.close()


app = FastAPI(title="beagle-agent", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    orch = app.state.orchestrator
    return {
        "status": "ok",
        "active_sessions": len(orch.sessions),
    }
