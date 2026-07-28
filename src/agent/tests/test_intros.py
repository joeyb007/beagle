"""Intro worker: pending swipe-right rows -> warm-intro DM to the match."""

import json
import sqlite3

import pytest

from src.agent.intros import IntroWorker
from src.agent.stubs import ScriptedLLM, StubMessaging

SCHEMA = open("schema.sql").read()


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data.sqlite")
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, 0.5)",
        (
            "+1647",
            "Joseph",
            json.dumps({"cuisines": ["sushi"], "vibe": ["low-key"], "persona_label": "the planner"}),
        ),
    )
    conn.execute(
        "INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, 0.5)",
        ("+1415", "Sam K.", json.dumps({"nearby": True, "cuisines": ["sushi"]})),
    )
    conn.commit()
    conn.close()
    return path


def make_worker(db):
    messaging = StubMessaging()
    llm = ScriptedLLM(
        default="hey sam! i'm beagle, joseph's hangout dog — you two are basically taste twins 🐶"
    )
    return IntroWorker(db_path=db, messaging=messaging, llm=llm), messaging, llm


async def test_pending_intro_sends_warm_dm_with_number(db):
    sqlite3.connect(db).execute(
        "INSERT INTO intros (handle, match_handle, decision) VALUES ('+1647', '+1415', 'intro')"
    ).connection.commit()
    worker, messaging, llm = make_worker(db)

    processed = await worker.process_once()

    assert processed == 1
    chat, text = messaging.texts[0]
    assert chat == "dm-+1415"  # DM to the match, not the swiper
    assert "beagle" in text
    # the LLM saw both people and the swiper's number to hand over
    prompt = llm.calls[-1]["input"]
    for needle in ("Joseph", "Sam K.", "+1647", "sushi", "the planner"):
        assert needle in prompt, f"missing: {needle}"
    status = sqlite3.connect(db).execute("SELECT status FROM intros").fetchone()[0]
    assert status == "sent"


async def test_demo_target_reroutes_every_intro_to_one_real_number(db):
    sqlite3.connect(db).execute(
        "INSERT INTO intros (handle, match_handle, decision) VALUES ('+1647', '+1415', 'intro')"
    ).connection.commit()
    messaging = StubMessaging()
    llm = ScriptedLLM(default="warm intro text")
    worker = IntroWorker(db_path=db, messaging=messaging, llm=llm, demo_target="+1929")

    await worker.process_once()

    chat, _ = messaging.texts[0]
    assert chat == "dm-+1929"  # the teammate's phone, never the fake number


async def test_pass_rows_are_never_texted(db):
    sqlite3.connect(db).execute(
        "INSERT INTO intros (handle, match_handle, decision) VALUES ('+1647', '+1415', 'pass')"
    ).connection.commit()
    worker, messaging, _ = make_worker(db)

    assert await worker.process_once() == 0
    assert messaging.texts == []


async def test_intro_now_upserts_delivers_and_returns_text(db):
    worker, messaging, _ = make_worker(db)

    text = await worker.intro_now("+1647", "+1415")

    assert text is not None and "beagle" in text
    assert "—" not in text  # dash strip applies to drafted intros
    chat, sent = messaging.texts[0]
    assert chat == "dm-+1415"
    assert sent == text
    row = sqlite3.connect(db).execute(
        "SELECT decision, status, message FROM intros WHERE handle='+1647' AND match_handle='+1415'"
    ).fetchone()
    assert row == ("intro", "sent", text)  # the receipt: what beagle actually sent


async def test_intro_now_failed_send_returns_none_and_marks_skipped(db):
    worker, messaging, _ = make_worker(db)
    messaging.fail_handles.add("+1415")

    assert await worker.intro_now("+1647", "+1415") is None
    status = sqlite3.connect(db).execute("SELECT status FROM intros").fetchone()[0]
    assert status == "skipped"


async def test_failed_send_marks_skipped_not_pending_forever(db):
    sqlite3.connect(db).execute(
        "INSERT INTO intros (handle, match_handle, decision) VALUES ('+1647', '+1999', 'intro')"
    ).connection.commit()
    worker, messaging, _ = make_worker(db)
    messaging.fail_handles.add("+1999")  # not allowlisted -> send blows up

    await worker.process_once()

    status = sqlite3.connect(db).execute("SELECT status FROM intros").fetchone()[0]
    assert status == "skipped"
