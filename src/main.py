"""FastAPI entrypoint for the consolidated agent process.

Startup: apply schema, bring up the Photon sidecar (real or fake), wire the
Orchestrator, and start listening for iMessage events.

Run: .venv/bin/uvicorn src.main:app
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.wiring import build_orchestrator


@asynccontextmanager
async def lifespan(app: FastAPI):
    orchestrator, messaging = build_orchestrator()
    await messaging.ensure_running()
    orchestrator.start()
    app.state.orchestrator = orchestrator
    app.state.messaging = messaging
    print("[beagle] agent listening — say 'Hey Beagle' in the group chat")
    yield
    await messaging.close()


app = FastAPI(title="beagle-agent", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    orch = app.state.orchestrator
    return {
        "status": "ok",
        "active_sessions": len(orch.sessions),
    }
