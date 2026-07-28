"""Motives: scored listing, radius gate, join flow with host pitch + auto-accept."""

import asyncio
import json
import sqlite3

import pytest

from src.agent.motives import _stretch, create_motive, list_motives, request_join
from src.agent.stubs import ScriptedLLM, StubMessaging

SCHEMA = open("schema.sql").read()


@pytest.fixture(autouse=True)
def fake_mode(monkeypatch):
    monkeypatch.setenv("MATCH_FAKE", "1")


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data.sqlite")
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    rows = [
        ("+1647", "Joseph", {"cuisines": ["tacos", "sushi"], "vibe": ["low-key"]}),
        ("+1111", "Ana R.", {"nearby": True, "km": 2, "persona_label": "the calm one"}),
        ("+1222", "Bo T.", {"nearby": True, "km": 12}),
        ("+1999", "Zed", {}),  # a real (non-pool) person
    ]
    for handle, name, data in rows:
        conn.execute(
            "INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, 0)",
            (handle, name, json.dumps(data)),
        )
    conn.commit()
    conn.close()
    return path


def test_stretch_spreads_display_band_stably():
    assert _stretch(0.70) == pytest.approx(0.5)
    assert _stretch(0.74) == pytest.approx(0.6)
    assert _stretch(0.95) == 0.97  # clamped high
    assert _stretch(0.2) == 0.3  # clamped low
    assert _stretch(0.75) > _stretch(0.71)  # order preserved


def test_listing_scores_and_orders_by_fit(db):
    create_motive(db, "+1111", text="tacos + pool tn", time_window="tonight 8pm", spots=2)
    create_motive(db, "+1222", text="museum morning", time_window="tomorrow 10am", spots=1)

    out = list_motives(db, "+1647")
    assert [m["text"] for m in out] == ["tacos + pool tn", "museum morning"]  # taco hit ranks first
    assert out[0]["score"] > out[1]["score"]
    assert out[0]["host_name"] == "Ana R." and out[0]["persona"] == "the calm one"
    assert out[0]["spots_left"] == 2 and out[0]["my_status"] == "none"


def test_radius_filter_and_own_motive_pinned_first(db):
    create_motive(db, "+1111", text="tacos tn", time_window="tonight", spots=2)
    create_motive(db, "+1222", text="tacos but far", time_window="tonight", spots=2)
    create_motive(db, "+1647", text="my own thing", time_window="tonight", spots=3)

    out = list_motives(db, "+1647", radius_km=5)
    texts = [m["text"] for m in out]
    assert "tacos but far" not in texts  # 12 km > 5 km radius
    assert texts[0] == "my own thing" and out[0]["my_status"] == "host"


async def test_join_texts_host_pitch_and_auto_accepts_fake_host(db):
    mid = create_motive(db, "+1111", text="tacos tn", time_window="tonight", spots=2)
    messaging = StubMessaging()
    llm = ScriptedLLM(default="ana, joseph's a taco guy, he'd fit right in 🐶")

    res = await request_join(
        db, motive_id=mid, handle="+1647", messaging=messaging, llm=llm, auto_accept_s=0.01
    )
    assert res == {"ok": True, "status": "pending"}
    chat, text = messaging.texts[0]
    assert chat == "dm-+1111"  # the host hears from beagle
    assert "—" not in text
    prompt = llm.calls[-1]["input"]
    for needle in ("Ana R.", "Joseph", "tacos tn"):
        assert needle in prompt

    await asyncio.sleep(0.05)  # fake host says yes
    status = sqlite3.connect(db).execute(
        "SELECT status FROM motive_joins WHERE motive_id = ?", (mid,)
    ).fetchone()[0]
    assert status == "in"
    assert list_motives(db, "+1647")[0]["spots_left"] == 1


async def test_notify_decision_texts_the_asker(db):
    from src.agent.motives import notify_decision

    mid = create_motive(db, "+1111", text="tacos tn", time_window="tonight", spots=2)
    messaging = StubMessaging()
    llm = ScriptedLLM(default="you're in for tacos tn, ana says come thru 🐶")

    ok = await notify_decision(
        db, motive_id=mid, asker="+1647", decision="in", messaging=messaging, llm=llm
    )
    assert ok
    chat, text = messaging.texts[0]
    assert chat == "dm-+1647"  # the asker hears the verdict
    assert "—" not in text
    prompt = llm.calls[-1]["input"]
    for needle in ("accepted", "Joseph", "tacos tn", "Ana R."):
        assert needle in prompt


async def test_join_on_real_host_stays_pending(db):
    mid = create_motive(db, "+1999", text="run club", time_window="tonight", spots=2)
    await request_join(
        db, motive_id=mid, handle="+1647", messaging=StubMessaging(), llm=ScriptedLLM(default="x"),
        auto_accept_s=0.01,
    )
    await asyncio.sleep(0.05)
    status = sqlite3.connect(db).execute(
        "SELECT status FROM motive_joins WHERE motive_id = ?", (mid,)
    ).fetchone()[0]
    assert status == "pending"  # real humans answer for themselves
