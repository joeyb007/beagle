"""Branch A acceptance harness (docs/branch-a.md).

Runs the ENTIRE loop against stubs — no real network:
fake "Hey Beagle" → stub DMs logged → stub replies injected → reconcile picks
a stub venue → stub poll resolved → FinalPlan printed, artifact row written.

Run: .venv/bin/python -m src.agent.harness
"""

import asyncio
import json
import sqlite3
import tempfile
from pathlib import Path

from src.agent.artifact_store import SqliteArtifactStore
from src.agent.orchestrator import Orchestrator
from src.agent.stubs import (
    ScriptedLLM,
    StubCalendar,
    StubMatching,
    StubMessaging,
    StubMusic,
    StubProfileStore,
    StubRefresher,
    StubVoice,
)
from src.contracts import Candidate, InboundMessage, PollVote

RAYHAN, MAYA = "+15550000001", "+15550000002"

RAYHAN_STATE = (
    '{"availability": [{"start": "2026-08-01T18:00:00", "end": "2026-08-01T22:00:00"}],'
    ' "prefs": ["sushi"], "hard_nos": ["clubs"]}'
)
MAYA_STATE = (
    '{"availability": [{"start": "2026-08-01T19:00:00", "end": "2026-08-01T23:00:00"}],'
    ' "prefs": ["tacos"], "hard_nos": []}'
)


class StubVenues:
    async def find(self, query, near):
        print(f"  [venues] query={query!r} near={near!r}")
        return [Candidate(name="Tacos El Rey"), Candidate(name="Ebisu Sushi")]


async def main() -> None:
    db = str(Path(tempfile.mkdtemp()) / "data.sqlite")
    conn = sqlite3.connect(db)
    conn.executescript(open("schema.sql").read())
    conn.close()

    messaging = StubMessaging()
    llm = ScriptedLLM(
        rules=[
            ("Rayhan", "yo rayhan — sat or sun? still sushi?"),
            ("Maya", "maya! tacos this weekend?"),
            ("only do saturday", RAYHAN_STATE),
            ("free after 7", MAYA_STATE),
        ]
    )
    orch = Orchestrator(
        messaging=messaging,
        llm=llm,
        profiles=StubProfileStore(),
        refresher=(refresher := StubRefresher()),
        voice=StubVoice(),
        calendar=StubCalendar(),
        music=StubMusic(),
        matching=StubMatching(),
        venues=StubVenues(),
        artifacts=(artifacts := SqliteArtifactStore(db)),
    )
    orch.start()

    print("1. invoke: 'Hey Beagle, let's hang this weekend'")
    messaging.inject_inbound(
        InboundMessage(handle=MAYA, chat_id="g1", text="Hey Beagle, let's hang this weekend")
    )
    await asyncio.sleep(0.05)
    for chat, text in messaging.texts:
        print(f"  [dm → {chat}] {text}")

    print("2. replies land (constrained member first)")
    messaging.inject_inbound(
        InboundMessage(handle=RAYHAN, chat_id=f"dm-{RAYHAN}",
                       text="i can only do saturday evening, sushi pls, no clubs")
    )
    await asyncio.sleep(0.05)
    messaging.inject_inbound(
        InboundMessage(handle=MAYA, chat_id=f"dm-{MAYA}", text="free after 7, tacos obviously")
    )
    await asyncio.sleep(0.05)

    poll_chat, poll = messaging.polls[0]
    print(f"3. poll in {poll_chat}: {poll.question} {poll.options}")
    poll_id = orch.sessions["g1"].session.poll_id
    messaging.inject_vote(PollVote(poll_id=poll_id, handle=RAYHAN, option_index=1))
    messaging.inject_vote(PollVote(poll_id=poll_id, handle=MAYA, option_index=1))
    await asyncio.sleep(0.05)

    print("4. locked + confirmed:")
    for chat, card in messaging.cards:
        print(f"  [card → {chat}] {card.title} | {card.body}")

    row = sqlite3.connect(db).execute(
        "SELECT plan_id, place, attendees, playlist FROM artifacts"
    ).fetchone()
    assert row is not None, "artifact row missing"
    print(f"5. FinalPlan persisted: place={json.loads(row[1])['name']} attendees={row[2]}")
    assert refresher.refreshed_with, "profile refresh did not run"
    print(f"6. profile refresh received {len(refresher.refreshed_with[0])} replies")
    assert "g1" not in orch.sessions, "session not cleaned up"
    print("\nHARNESS GREEN — full loop ran against stubs.")


if __name__ == "__main__":
    asyncio.run(main())
