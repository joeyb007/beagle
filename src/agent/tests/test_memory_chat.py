"""Memory chat: ask Beagle about a past hangout — agent answers with context."""

import json
import sqlite3

import pytest

from src.agent.memory_chat import chat_about_memory
from src.agent.stubs import ScriptedLLM

SCHEMA = open("schema.sql").read()


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data.sqlite")
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT INTO profiles (handle, name, json, constraint_score) VALUES ('+1555', 'Maya', '{}', 0)"
    )
    conn.execute(
        "INSERT INTO artifacts (plan_id, place, time, attendees, playlist, note, photo_notes)"
        " VALUES ('p1', ?, '2026-07-18T19:00:00', ?, ?, 'the karaoke night', ?)",
        (
            json.dumps({"name": "Ebisu Sushi"}),
            json.dumps(["+1647", "+1555"]),
            json.dumps([{"title": "Inner Sunset", "artist": "Fog Line"}]),
            json.dumps({"/uploads/a.jpg": "the encore nobody asked for"}),
        ),
    )
    conn.commit()
    conn.close()
    return path


async def test_chat_gets_full_hangout_context_and_replies(db):
    llm = ScriptedLLM(default="you and maya closed the place down 🐶")
    reply = await chat_about_memory(
        llm, db, plan_id="p1", question="what happened that night?",
        history=[{"role": "user", "text": "hey"}, {"role": "beagle", "text": "hey yourself"}],
    )
    assert reply == "you and maya closed the place down 🐶"
    prompt = llm.calls[-1]["input"]
    for needle in (
        "Ebisu Sushi", "Maya", "karaoke", "Inner Sunset",
        "what happened that night?", "hey yourself",
        "the encore nobody asked for",  # photo post-it feeds agent context
    ):
        assert needle in prompt, f"missing context: {needle}"


async def test_unknown_plan_id_gets_graceful_reply(db):
    reply = await chat_about_memory(ScriptedLLM(), db, plan_id="nope", question="?", history=[])
    assert "don't remember" in reply.lower()
