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
from pydantic import BaseModel

from src.agent.beagle_take import beagle_take
from src.agent.memory_chat import chat_about_memory
from src.agent.profile_chat import chat_about_me
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


class MemoryChatRequest(BaseModel):
    plan_id: str
    question: str
    history: list[dict] = []


@app.post("/api/memory-chat")
async def memory_chat(req: MemoryChatRequest) -> dict:
    reply = await chat_about_memory(
        app.state.orchestrator._llm,
        os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
        plan_id=req.plan_id,
        question=req.question,
        history=req.history,
    )
    return {"reply": reply}


class ProfileChatRequest(BaseModel):
    handle: str
    question: str
    history: list[dict] = []


@app.post("/api/profile-chat")
async def profile_chat(req: ProfileChatRequest) -> dict:
    reply = await chat_about_me(
        app.state.orchestrator._llm,
        os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
        handle=req.handle,
        question=req.question,
        history=req.history,
    )
    return {"reply": reply}


class BeagleTakeRequest(BaseModel):
    handle: str
    refresh: bool = False


@app.post("/api/beagle-take")
async def beagle_take_endpoint(req: BeagleTakeRequest) -> dict:
    take = await beagle_take(
        app.state.orchestrator._llm,
        os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
        handle=req.handle,
        refresh=req.refresh,
    )
    return {"take": take}


@app.get("/health")
async def health() -> dict:
    orch = app.state.orchestrator
    return {
        "status": "ok",
        "active_sessions": len(orch.sessions),
    }
