"""Planner tools: find_people retrieval + make_intro delivery via the engine."""

import json
import sqlite3

import pytest

from src.agent.planner_tools import PlannerTools
from src.agent.stubs import ScriptedLLM, StubMessaging

SCHEMA = open("schema.sql").read()


class FakeOrch:
    def __init__(self):
        self._messaging = StubMessaging()
        self._llm = ScriptedLLM(default="hey! i'm beagle, joseph's hangout dog 🐶")


@pytest.fixture(autouse=True)
def fake_mode(monkeypatch):
    monkeypatch.setenv("MATCH_FAKE", "1")
    monkeypatch.delenv("BEAGLE_INTRO_TARGET", raising=False)


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data.sqlite")
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    rows = [
        ("+1647", "Joseph", {"cuisines": ["sushi"], "vibe": ["low-key"],
                             "typical_availability": "weekend evenings"}),
        ("+1111", "Ana R.", {"nearby": True, "km": 2, "cuisines": ["sushi"],
                             "vibe": ["low-key"], "persona_label": "the calm one",
                             "typical_availability": "weekend evenings"}),
        ("+1222", "Bo T.", {"nearby": True, "km": 5, "cuisines": ["thai"],
                            "typical_availability": "friday nights"}),
    ]
    for handle, name, data in rows:
        conn.execute(
            "INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, 0)",
            (handle, name, json.dumps(data)),
        )
    conn.commit()
    conn.close()
    return path


async def test_find_people_returns_ranked_picks_with_attachment(db):
    tools = PlannerTools(FakeOrch(), db, "+1647")
    text, attachment = await tools.run("find_people", {})
    assert "Ana R." in text
    assert attachment["type"] == "intros"
    assert attachment["people"][0]["name"] == "Ana R."
    assert attachment["people"][0]["why"]


async def test_find_people_free_day_filter_accepts_day_names(db):
    tools = PlannerTools(FakeOrch(), db, "+1647")
    _, attachment = await tools.run("find_people", {"free_day": "friday"})
    names = [p["name"] for p in attachment["people"]]
    assert "Bo T." in names
    assert "Ana R." not in names  # weekends only


async def test_make_intro_texts_the_match_and_attaches_message(db):
    orch = FakeOrch()
    tools = PlannerTools(orch, db, "+1647")
    text, attachment = await tools.run("make_intro", {"name": "ana"})
    assert attachment["type"] == "intro_sent"
    assert attachment["name"] == "Ana R."
    chat, sent = orch._messaging.texts[0]
    assert chat == "dm-+1111"
    assert "beagle" in sent
    row = sqlite3.connect(db).execute(
        "SELECT decision, status FROM intros WHERE handle='+1647'"
    ).fetchone()
    assert row == ("intro", "sent")


async def test_make_intro_unknown_name_lists_current_picks(db):
    tools = PlannerTools(FakeOrch(), db, "+1647")
    text, attachment = await tools.run("make_intro", {"name": "zorp"})
    assert attachment is None
    assert "Ana R." in text  # helpful: names the actual picks
