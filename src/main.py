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
from src.agent.group_registrar import GroupRegistrar
from src.agent.intros import IntroWorker
from src.agent.memory_chat import chat_about_memory
from src.agent.outreach import OutreachWorker
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
    intros = IntroWorker(
        db_path=os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
        messaging=messaging,
        llm=orchestrator._llm,
        # demo safety: every warm intro goes to this real allowlisted number,
        # never to the (fake) nearby-pool handles
        demo_target=os.environ.get("BEAGLE_INTRO_TARGET"),
    )
    intro_task = asyncio.create_task(intros.run_forever())
    outreach = OutreachWorker(
        db_path=os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
        messaging=messaging,
        llm=orchestrator._llm,
    )
    outreach_task = asyncio.create_task(outreach.run_forever())
    # added-to-group -> persisted group + provisioned members + one hello;
    # group-thread chatter feeds the per-group voice card
    registrar = GroupRegistrar(
        db_path=os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
        messaging=messaging,
    )
    loop = asyncio.get_event_loop()
    messaging.on_group_joined(
        lambda chat_id, members, name: loop.create_task(
            registrar.on_group_joined(chat_id, members, name=name)
        )
    )
    messaging.on_inbound(
        lambda m: registrar.log_message(m.chat_id, m.handle, m.text)
        if ";+;" in m.chat_id
        else None
    )
    app.state.registrar = registrar
    app.state.outreach = outreach
    app.state.orchestrator = orchestrator
    app.state.messaging = messaging
    print("[beagle] agent listening — say 'Hey Beagle' in the group chat")
    yield
    spark_task.cancel()
    intro_task.cancel()
    outreach_task.cancel()
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


class OutreachRequest(BaseModel):
    group_id: int


@app.post("/api/outreach")
async def trigger_outreach(req: OutreachRequest) -> dict:
    """Demo trigger: make Beagle notice this group is quiet, right now."""
    nudged = await app.state.outreach.process_once(force_group_id=req.group_id)
    return {"nudged": nudged}


@app.get("/health")
async def health() -> dict:
    orch = app.state.orchestrator
    return {
        "status": "ok",
        "active_sessions": len(orch.sessions),
    }
