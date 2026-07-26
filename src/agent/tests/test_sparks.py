"""Serendipity spark worker: pending sparks table row -> nostalgic group text."""

import json
import sqlite3
from pathlib import Path

import pytest

from src.agent.sparks import SparkWorker
from src.agent.stubs import ScriptedLLM, StubMessaging

SCHEMA = open("schema.sql").read()


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data.sqlite")
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT INTO artifacts (plan_id, place, time, attendees, note, group_id)"
        " VALUES ('p1', ?, '2026-07-18T19:00:00', ?, 'the karaoke night', 1)",
        (json.dumps({"name": "Ebisu Sushi"}), json.dumps(["+1647", "+1555"])),
    )
    conn.execute(
        "INSERT INTO groups (id, name, members, chat_id) VALUES (1, 'gang', '[]', 'imsg-group-9')"
    )
    conn.commit()
    conn.close()
    return path


def make_worker(db, photo_root=None):
    messaging = StubMessaging()
    llm = ScriptedLLM(default="remember the karaoke night at Ebisu? 🐶 iconic.")
    return SparkWorker(db_path=db, messaging=messaging, llm=llm, photo_root=photo_root), messaging


async def test_spark_sent_to_group_chat(db):
    sqlite3.connect(db).execute(
        "INSERT INTO sparks (plan_id, requested_by) VALUES ('p1', '+1647')"
    ).connection.commit()
    worker, messaging = make_worker(db)

    processed = await worker.process_once()

    assert processed == 1
    chat, text = messaging.texts[0]
    assert chat == "imsg-group-9"  # the group's real chat
    assert "karaoke" in text
    status, sent_at = sqlite3.connect(db).execute(
        "SELECT status, sent_at FROM sparks"
    ).fetchone()
    assert status == "sent"
    assert sent_at is not None


async def test_spark_falls_back_to_attendee_dms_without_group_chat(db):
    conn = sqlite3.connect(db)
    conn.execute("UPDATE groups SET chat_id = NULL")
    conn.execute("INSERT INTO sparks (plan_id, requested_by) VALUES ('p1', '+1647')")
    conn.commit()
    worker, messaging = make_worker(db)

    await worker.process_once()

    assert {c for c, _ in messaging.texts} == {"dm-+1647", "dm-+1555"}
    assert sqlite3.connect(db).execute("SELECT status FROM sparks").fetchone()[0] == "sent"


async def test_no_pending_sparks_is_a_noop(db):
    worker, messaging = make_worker(db)
    assert await worker.process_once() == 0
    assert messaging.texts == []


async def test_spark_sends_the_specific_photo_then_text(db):
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO sparks (plan_id, requested_by, photo) VALUES ('p1', '+1647', '/uploads/x.svg')"
    )
    conn.commit()
    root = Path(db).parent
    (root / "uploads").mkdir(exist_ok=True)
    (root / "uploads" / "x.svg").write_text("<svg/>")
    worker, messaging = make_worker(db, photo_root=str(root))

    await worker.process_once()

    # image first, then the nostalgic text, same chat
    assert messaging.images and messaging.images[0][0] == "imsg-group-9"
    assert messaging.images[0][1].endswith("/uploads/x.svg")
    assert messaging.texts and messaging.texts[0][0] == "imsg-group-9"
