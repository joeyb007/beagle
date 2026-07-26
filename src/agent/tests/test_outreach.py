"""Outreach worker: Beagle notices a quiet group and reaches out first."""

import json
import sqlite3

import pytest

from src.agent.outreach import OutreachWorker
from src.agent.stubs import ScriptedLLM, StubMessaging

SCHEMA = open("schema.sql").read()


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data.sqlite")
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT INTO groups (id, name, members, chat_id) VALUES (1, 'the gang', ?, 'imsg-g1')",
        (json.dumps(["+1647", "+1929"]),),
    )
    conn.execute(
        "INSERT INTO profiles (handle, name, json, constraint_score) VALUES ('+1647', 'Joseph', '{}', 0)"
    )
    conn.execute(
        "INSERT INTO artifacts (plan_id, place, time, attendees, group_id)"
        " VALUES ('old', ?, '2026-06-01T19:00:00', ?, 1)",  # 8 weeks quiet
        (json.dumps({"name": "Ebisu Sushi"}), json.dumps(["+1647", "+1929"])),
    )
    conn.commit()
    conn.close()
    return path


def make_worker(db, gap_days=14):
    messaging = StubMessaging()
    llm = ScriptedLLM(default="it's been a minute since ebisu 🐶 want me to find a night?")
    return OutreachWorker(db_path=db, messaging=messaging, llm=llm, gap_days=gap_days), messaging


async def test_quiet_group_gets_a_nudge_in_its_chat(db):
    worker, messaging = make_worker(db)

    nudged = await worker.process_once()

    assert nudged == 1
    chat, text = messaging.texts[0]
    assert chat == "imsg-g1"
    assert "ebisu" in text.lower()
    # recorded so we don't nag
    assert sqlite3.connect(db).execute("SELECT COUNT(*) FROM outreach").fetchone()[0] == 1


async def test_nudge_cooldown_prevents_nagging(db):
    worker, messaging = make_worker(db)
    await worker.process_once()
    assert await worker.process_once() == 0  # second pass is silent
    assert len(messaging.texts) == 1


async def test_active_group_is_left_alone(db):
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO artifacts (plan_id, place, time, attendees, group_id)"
        " VALUES ('recent', ?, datetime('now', '-2 days'), ?, 1)",
        (json.dumps({"name": "Tacos"}), json.dumps(["+1647"])),
    )
    conn.commit()
    conn.close()
    worker, messaging = make_worker(db)

    assert await worker.process_once() == 0
    assert messaging.texts == []


async def test_force_nudges_regardless_of_gap_for_the_demo(db):
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO artifacts (plan_id, place, time, attendees, group_id)"
        " VALUES ('recent', ?, datetime('now', '-2 days'), ?, 1)",
        (json.dumps({"name": "Tacos"}), json.dumps(["+1647"])),
    )
    conn.commit()
    conn.close()
    worker, messaging = make_worker(db)

    assert await worker.process_once(force_group_id=1) == 1
    assert len(messaging.texts) == 1
