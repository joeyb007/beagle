"""Profile chat: ask Beagle about your own analytics — history-aware answers."""

import json
import sqlite3

import pytest

from src.agent.profile_chat import chat_about_me
from src.agent.stubs import ScriptedLLM

SCHEMA = open("schema.sql").read()


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data.sqlite")
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, 0.5)",
        ("+1647", "Joseph", json.dumps({"cuisines": ["sushi"], "persona_label": "the planner"})),
    )
    conn.execute(
        "INSERT INTO profiles (handle, name, json, constraint_score) VALUES ('+1929', 'Madhav', '{}', 0)"
    )
    for pid, time, attendees in [
        ("p1", "2026-06-01T19:00:00", ["+1647", "+1929"]),
        ("p2", "2026-07-01T19:00:00", ["+1647", "+1929"]),
    ]:
        conn.execute(
            "INSERT INTO artifacts (plan_id, place, time, attendees, playlist, note)"
            " VALUES (?, ?, ?, ?, '[]', 'good night')",
            (pid, json.dumps({"name": f"Spot {pid}"}), time, json.dumps(attendees)),
        )
    conn.commit()
    conn.close()
    return path


async def test_chat_sees_profile_stats_and_history(db):
    llm = ScriptedLLM(default="you and madhav are basically a duo at this point 🐶")
    reply = await chat_about_me(
        llm, db, handle="+1647", question="who do i hang out with most?",
        history=[{"role": "user", "text": "hey"}],
    )
    assert reply == "you and madhav are basically a duo at this point 🐶"
    prompt = llm.calls[-1]["input"]
    for needle in ("Joseph", "sushi", "the planner", "Spot p1", "Spot p2", "Madhav", "2 hangouts", "who do i hang out with most?"):
        assert needle in prompt, f"missing context: {needle}"


async def test_unknown_handle_is_graceful(db):
    reply = await chat_about_me(ScriptedLLM(), db, handle="+nope", question="?", history=[])
    assert "getting to know" in reply.lower()
