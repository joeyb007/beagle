"""Beagle's take: the LLM-written read on one member, cached in their profile."""

import json
import sqlite3

import pytest

from src.agent.beagle_take import beagle_take
from src.agent.stubs import ScriptedLLM

SCHEMA = open("schema.sql").read()


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data.sqlite")
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, 0.7)",
        (
            "+1647",
            "Joseph",
            json.dumps({"cuisines": ["ramen"], "hard_nos": ["sushi"], "persona_label": "the anchor"}),
        ),
    )
    conn.execute(
        "INSERT INTO profiles (handle, name, json, constraint_score) VALUES ('+1555', 'Maya', '{}', 0)"
    )
    conn.execute(
        "INSERT INTO artifacts (plan_id, place, time, attendees, playlist, note)"
        " VALUES ('p1', ?, '2026-07-18T19:00:00', ?, '[]', 'the karaoke night')",
        (json.dumps({"name": "Ebisu Sushi"}), json.dumps(["+1647", "+1555"])),
    )
    conn.commit()
    conn.close()
    return path


async def test_take_sees_profile_and_hangout_history(db):
    llm = ScriptedLLM(default="Joseph is the anchor of every plan 🐶")
    take = await beagle_take(llm, db, handle="+1647")
    assert take == "Joseph is the anchor of every plan 🐶"
    prompt = llm.calls[-1]["input"]
    for needle in ("Joseph", "ramen", "sushi", "the anchor", "Ebisu Sushi", "Maya", "karaoke"):
        assert needle in prompt, f"missing context: {needle}"


async def test_take_is_cached_in_profile_until_refresh(db):
    llm = ScriptedLLM(default="first take")
    await beagle_take(llm, db, handle="+1647")

    conn = sqlite3.connect(db)
    stored = json.loads(conn.execute("SELECT json FROM profiles WHERE handle='+1647'").fetchone()[0])
    conn.close()
    assert stored["beagle_take"] == "first take"

    llm2 = ScriptedLLM(default="second take")
    assert await beagle_take(llm2, db, handle="+1647") == "first take"  # cache hit, no call
    assert llm2.calls == []
    assert await beagle_take(llm2, db, handle="+1647", refresh=True) == "second take"


async def test_unknown_handle_gets_graceful_reply(db):
    take = await beagle_take(ScriptedLLM(), db, handle="+nope")
    assert "getting to know" in take.lower()


async def test_take_prompt_carries_fewshot_examples(db):
    llm = ScriptedLLM(default="allergic to clubs, addicted to golden hour")
    await beagle_take(llm, db, handle="+1647")
    prompt = llm.calls[-1]["input"]
    assert "omakase counter" in prompt  # few-shot length anchors present
    assert "easy hike" in prompt
