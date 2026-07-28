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
    app.state.intro_worker = intros
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
    handle: str | None = None


@app.post("/api/memory-chat")
async def memory_chat(req: MemoryChatRequest) -> dict:
    reply = await chat_about_memory(
        app.state.orchestrator._llm,
        os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
        plan_id=req.plan_id,
        question=req.question,
        history=req.history,
        handle=req.handle,
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


class MatchesRequest(BaseModel):
    handle: str
    query: str | None = None
    free_day: int | None = None
    limit: int = 4


@app.post("/api/matches")
async def matches(req: MatchesRequest) -> dict:
    from src.agent.matching import find_matches

    return {
        "matches": find_matches(
            os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
            req.handle,
            query=req.query,
            free_day=req.free_day,
            limit=req.limit,
        )
    }


class MotiveListRequest(BaseModel):
    handle: str
    radius_km: float | None = None


@app.post("/api/motives/list")
async def motives_list(req: MotiveListRequest) -> dict:
    from src.agent.motives import list_motives

    return {
        "motives": list_motives(
            os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
            req.handle,
            radius_km=req.radius_km,
        )
    }


class MotiveCreateRequest(BaseModel):
    handle: str
    text: str
    time_window: str = "tonight"
    spots: int = 2


@app.post("/api/motives/create")
async def motives_create(req: MotiveCreateRequest) -> dict:
    from src.agent.motives import create_motive

    mid = create_motive(
        os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
        req.handle,
        text=req.text,
        time_window=req.time_window,
        spots=req.spots,
    )
    return {"ok": True, "id": mid}


class MotiveJoinRequest(BaseModel):
    handle: str
    motive_id: int


@app.post("/api/motives/join")
async def motives_join(req: MotiveJoinRequest) -> dict:
    from src.agent.motives import request_join

    orch = app.state.orchestrator
    return await request_join(
        os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
        motive_id=req.motive_id,
        handle=req.handle,
        messaging=orch._messaging,
        llm=orch._llm,
        demo_target=os.environ.get("BEAGLE_INTRO_TARGET"),
    )


class IntroRequest(BaseModel):
    handle: str
    match_handle: str


@app.post("/api/intro")
async def intro(req: IntroRequest) -> dict:
    text = await app.state.intro_worker.intro_now(req.handle, req.match_handle)
    return {"ok": text is not None, "message": text}


class PlannerChatRequest(BaseModel):
    handle: str
    question: str
    history: list[dict] = []


@app.post("/api/planner-chat")
async def planner_chat(req: PlannerChatRequest) -> dict:
    from src.agent.planner_chat import chat_with_planner

    orch = app.state.orchestrator
    result = await chat_with_planner(
        orch._llm,
        orch._calendar,
        os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")),
        handle=req.handle,
        question=req.question,
        history=req.history,
        orchestrator=orch,
    )
    return result


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
