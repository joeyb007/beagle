"""FastAPI entrypoint for the agent process.

Until consolidation this only serves /health. At consolidation, the startup
task builds the Orchestrator from wiring.py and starts the inbound listener
as a background task. Run: uvicorn src.main:app
"""

from fastapi import FastAPI

app = FastAPI(title="beagle-agent")

# At consolidation (A):
# @app.on_event("startup")
# async def start_agent():
#     orchestrator = build_orchestrator()
#     asyncio.create_task(orchestrator.run())


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
