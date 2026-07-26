"""Consolidated end-to-end run — the whole product, no external credentials.

Real wiring (wiring.py), real Node sidecar process (fake-Photon mode), real
D providers over the shared SQLite, DemoLLM standing in for Merge. Drives:
invoke → fan-out DMs → replies → reconcile → poll → votes → lock → confirm
card + match card → artifact row that the web app renders.

Run: .venv/bin/python -m src.e2e
"""

import asyncio
import json
import sqlite3
import sys

import httpx

from src.wiring import REPO_ROOT, build_orchestrator

SIDECAR = "http://127.0.0.1:8787"
GROUP = "e2e-group-chat"

REPLIES = [
    "i can only do saturday evening, sushi pls, no clubs",
    "free after 7, tacos obviously",
    "whenever works, no hiking tho",
]


async def wait_for(predicate, what: str, timeout: float = 10.0):
    for _ in range(int(timeout / 0.05)):
        if v := predicate():
            return v
        await asyncio.sleep(0.05)
    sys.exit(f"E2E FAILED waiting for: {what}")


async def main() -> None:
    orchestrator, messaging = build_orchestrator()
    await messaging.ensure_running()
    orchestrator.start()

    async with httpx.AsyncClient(base_url=SIDECAR) as c:

        async def inject(path: str, payload: dict):
            (await c.post(f"/_fake/{path}", json=payload)).raise_for_status()

        profiles = await orchestrator._profiles.list()
        print(f"1. profiles in shared DB: {[p.name for p in profiles]}")

        await inject("inbound", {"handle": profiles[0].handle, "chatId": GROUP,
                                 "text": "Hey Beagle, let's hang this weekend"})
        active = await wait_for(lambda: orchestrator.sessions.get(GROUP), "session")
        await wait_for(lambda: active.state == "collect", "fan-out to finish")
        print(f"2. fan-out done — DMs to {len(active.dm_chats)} members (constrained first)")

        for (chat_id, handle), text in zip(list(active.dm_chats.items()), REPLIES * 3):
            await inject("inbound", {"handle": handle, "chatId": chat_id, "text": text})
        poll_id = await wait_for(lambda: active.session.poll_id, "reconcile + poll")
        options = [c_.name for c_ in active.session.candidates]
        print(f"3. poll {poll_id} in group: {options}")

        for handle in list(active.dm_chats.values()):
            await inject("pollVote", {"pollId": poll_id, "handle": handle, "optionIndex": 1})
        await wait_for(lambda: GROUP not in orchestrator.sessions, "lock + confirm")

        sent = (await c.get("/_fake/sent")).json()
        cards = [s["text"].splitlines()[0] for s in sent if s["kind"] == "card"]
        print(f"4. cards over the bridge: {cards}")

    db = sqlite3.connect(REPO_ROOT / "data.sqlite")
    plan_id, place, playlist = db.execute(
        "SELECT plan_id, place, playlist FROM artifacts ORDER BY created_at DESC, rowid DESC"
    ).fetchone()
    routing = db.execute("SELECT COUNT(*) FROM routing_log").fetchone()[0]
    print(f"5. artifact row: {plan_id} at {json.loads(place)['name']}, "
          f"{len(json.loads(playlist))} tracks · routing_log rows: {routing}")
    print(f"\n   web page: http://localhost:3000/hangouts/{plan_id}")
    print("\nE2E GREEN — full product loop ran across all four branches.")

    await messaging.close()


if __name__ == "__main__":
    asyncio.run(main())
