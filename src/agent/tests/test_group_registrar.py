"""Beagle added to a group chat -> group persisted, members provisioned, one hello."""

import json
import sqlite3

import pytest

from src.agent.group_registrar import GroupRegistrar
from src.agent.stubs import StubMessaging

SCHEMA = open("schema.sql").read()


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data.sqlite")
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT INTO profiles (handle, name, json, constraint_score) VALUES ('+1647', 'Joseph', '{}', 0.5)"
    )
    conn.commit()
    conn.close()
    return path


def make(db):
    messaging = StubMessaging()
    return GroupRegistrar(db_path=db, messaging=messaging), messaging


async def test_new_group_is_persisted_provisioned_and_greeted(db):
    reg, messaging = make(db)

    await reg.on_group_joined("iMessage;+;chat123", ["+1647", "+1999"], name="the boys")

    conn = sqlite3.connect(db)
    gid, name, members = conn.execute(
        "SELECT id, name, members FROM groups WHERE chat_id = 'iMessage;+;chat123'"
    ).fetchone()
    assert name == "the boys"
    assert json.loads(members) == ["+1647", "+1999"]
    # unknown member auto-provisioned as a placeholder profile
    row = conn.execute("SELECT name, json FROM profiles WHERE handle = '+1999'").fetchone()
    assert row is not None
    # existing profile untouched
    assert conn.execute("SELECT name FROM profiles WHERE handle='+1647'").fetchone()[0] == "Joseph"
    # exactly one hello, into the group thread
    assert len(messaging.texts) == 1
    chat, text = messaging.texts[0]
    assert chat == "iMessage;+;chat123"
    assert "beagle" in text.lower() and "hey beagle" in text.lower()


async def test_rejoin_updates_roster_without_regreeting(db):
    reg, messaging = make(db)
    await reg.on_group_joined("iMessage;+;chat123", ["+1647"], name="the boys")
    await reg.on_group_joined("iMessage;+;chat123", ["+1647", "+2000"], name="the boys v2")

    conn = sqlite3.connect(db)
    rows = conn.execute("SELECT name, members FROM groups WHERE chat_id='iMessage;+;chat123'").fetchall()
    assert len(rows) == 1  # upsert, no dup
    assert rows[0][0] == "the boys v2"
    assert json.loads(rows[0][1]) == ["+1647", "+2000"]
    assert len(messaging.texts) == 1  # greeted only once


async def test_group_messages_are_logged_for_the_voice_card(db):
    reg, _ = make(db)
    await reg.on_group_joined("iMessage;+;chat123", ["+1647"])
    reg.log_message("iMessage;+;chat123", "+1647", "yoo who's down for tacos")

    row = sqlite3.connect(db).execute(
        "SELECT chat_id, handle, text FROM group_messages"
    ).fetchone()
    assert row == ("iMessage;+;chat123", "+1647", "yoo who's down for tacos")
