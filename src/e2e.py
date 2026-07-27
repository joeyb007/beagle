"""Consolidated end-to-end run — the whole product, no external credentials.

Real wiring (wiring.py), real Node sidecar process (fake-Photon mode), real
D providers over the shared SQLite, DemoLLM standing in for the Anthropic
API. Drives the
group-first conversational flow from a cold DB: group chatter accumulates in
the message log → "hey beagle" trigger snapshots the window and bootstraps
every member's profile → multi-turn DM collection → group proposal → assents
→ lock → confirm card + match card → artifact row + context bookmarks.

Run: .venv/bin/python -m src.e2e
"""

import asyncio
import json
import os
import re
import sqlite3
import sys

import httpx

os.environ["SIDECAR_FAKE"] = "1"  # e2e is the OFFLINE rehearsal — never touch the real line
os.environ["BEAGLE_DEN_MODE"] = "0"  # exercise the group-mode conversational close

from src.data.seed import SAMPLE_CHAT
from src.wiring import REPO_ROOT, build_orchestrator

os.environ.pop("ANTHROPIC_API_KEY", None)  # after wiring's load_dotenv: force DemoLLM

SIDECAR = "http://127.0.0.1:8787"
GROUP = "e2e-group-chat"

CHAT_LINE = re.compile(r"^(\w+) \((\+\d+)\): (.*)$", re.MULTILINE)

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

        # cold start: the group's past chatter lands in the message log
        # (no trigger word — Beagle just listens)
        lines = CHAT_LINE.findall(SAMPLE_CHAT)
        handles = list(dict.fromkeys(h for _, h, _ in lines))
        for _, handle, text in lines:
            await inject("inbound", {"handle": handle, "chatId": GROUP, "text": text})
        # the group exists out in the world; the sidecar knows its members
        await inject("group", {"chatId": GROUP, "handles": handles})
        print(f"1. {len(lines)} chat lines observed from {len(handles)} members (cold DB)")

        await inject("inbound", {"handle": handles[0], "chatId": GROUP,
                                 "text": "Hey Beagle, let's hang this weekend"})
        active = await wait_for(lambda: orchestrator.sessions.get(GROUP), "session")
        await wait_for(lambda: active.state == "collect", "fan-out to finish")
        dm_ids = list(active.dms.keys())
        boot = await orchestrator._profiles.list()
        print(f"2. trigger snapshot bootstrapped {len(boot)} profiles; "
              f"DMs to {len(dm_ids)} members (constrained first)")

        for conv, text in zip(list(active.dms.values()), REPLIES * 3):
            await inject("inbound", {"handle": conv.handle, "chatId": conv.chat_id,
                                     "text": text})
        await wait_for(lambda: active.state == "propose", "reconcile + proposal")
        print(f"3. proposal in group: {active.proposal_text!r}")

        for handle in [conv.handle for conv in active.dms.values()]:
            await inject("inbound", {"handle": handle, "chatId": GROUP,
                                     "text": "works for me"})
        await wait_for(lambda: GROUP not in orchestrator.sessions, "lock + confirm")

        sent = (await c.get("/_fake/sent")).json()
        cards = [s["text"].splitlines()[0] for s in sent if s["kind"] == "card"]
        print(f"4. cards over the bridge: {cards}")

    db = sqlite3.connect(os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite")))
    plan_id, place, playlist = db.execute(
        "SELECT plan_id, place, playlist FROM artifacts ORDER BY created_at DESC, rowid DESC"
    ).fetchone()
    routing = db.execute("SELECT COUNT(*) FROM routing_log").fetchone()[0]
    logged = db.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    marks = {r[0] for r in db.execute("SELECT chat_id FROM context_snapshots")}
    missing = {GROUP, *dm_ids} - marks
    if not logged or missing:
        sys.exit(f"E2E FAILED: messages logged={logged}, missing bookmarks={missing}")
    print(f"5. artifact row: {plan_id} at {json.loads(place)['name']}, "
          f"{len(json.loads(playlist))} tracks · routing_log rows: {routing}")
    print(f"6. context: {logged} messages logged, bookmarks for group + {len(dm_ids)} DMs")
    print(f"\n   web page: http://localhost:3000/hangouts/{plan_id}")
    print("\nE2E GREEN — full conversational loop + context subsystem across the bridge.")

    await messaging.close()


if __name__ == "__main__":
    asyncio.run(main())
