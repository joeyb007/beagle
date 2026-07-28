"""Matching engine: person cards, gated KNN retrieval, deterministic fallback."""

import json
import sqlite3

import pytest

from src.agent.matching import find_matches, person_card

SCHEMA = open("schema.sql").read()


@pytest.fixture(autouse=True)
def fake_mode(monkeypatch):
    monkeypatch.setenv("MATCH_FAKE", "1")  # never download models in tests


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data.sqlite")
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    rows = [
        ("+1647", "Joseph", {
            "cuisines": ["sushi", "tacos"], "vibe": ["low-key"], "hard_nos": ["clubs"],
            "typical_availability": "weekend evenings", "persona_label": "the planner",
        }),
        ("+1111", "Ana R.", {
            "nearby": True, "km": 2, "cuisines": ["sushi"], "vibe": ["low-key"],
            "hard_nos": ["clubs"], "typical_availability": "weekend evenings",
            "persona_label": "the calm one",
        }),
        ("+1222", "Bo T.", {
            "nearby": True, "km": 5, "cuisines": ["thai"], "vibe": ["loud"],
            "typical_availability": "weekday mornings",
        }),
        ("+1333", "Cal M.", {  # NOT nearby: never a candidate
            "cuisines": ["sushi"], "vibe": ["low-key"],
        }),
        ("+1444", "Dee L.", {
            "nearby": True, "km": 3, "cuisines": ["tacos"],
            "typical_availability": "friday evenings",
        }),
    ]
    for handle, name, data in rows:
        conn.execute(
            "INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, 0)",
            (handle, name, json.dumps(data)),
        )
    conn.commit()
    conn.close()
    return path


def test_person_card_reads_like_a_person(db):
    card = person_card("Joseph", {
        "cuisines": ["sushi"], "vibe": ["low-key"], "hard_nos": ["clubs"],
        "typical_availability": "weekend evenings", "persona_label": "the planner",
    })
    for needle in ("Joseph", "the planner", "sushi", "low-key", "clubs", "weekend evenings"):
        assert needle in card


def test_ranks_taste_twin_first_and_gates_out_non_nearby(db):
    matches = find_matches(db, "+1647")
    handles = [m["handle"] for m in matches]
    assert handles[0] == "+1111"  # shares sushi, low-key, clubs aversion, days
    assert "+1333" not in handles  # not flagged nearby
    assert "+1647" not in handles  # never yourself


def test_already_swiped_are_excluded(db):
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO intros (handle, match_handle, decision) VALUES ('+1647', '+1111', 'pass')"
    )
    conn.commit()
    conn.close()
    handles = [m["handle"] for m in find_matches(db, "+1647")]
    assert "+1111" not in handles


def test_free_day_filters_candidates(db):
    handles = [m["handle"] for m in find_matches(db, "+1647", free_day=4)]  # friday
    assert "+1444" in handles  # "friday evenings"
    assert "+1111" not in handles  # weekends only: sat/sun


def test_query_boosts_matching_tastes_in_fallback(db):
    matches = find_matches(db, "+1647", query="someone to get thai food with")
    boosted = next(m for m in matches if m["handle"] == "+1222")
    plain = next(m for m in find_matches(db, "+1647") if m["handle"] == "+1222")
    assert boosted["score"] > plain["score"]


def test_limit_and_shape_and_no_em_dashes(db):
    matches = find_matches(db, "+1647", limit=2)
    assert len(matches) == 2
    m = matches[0]
    for key in ("handle", "name", "score", "km", "days", "reasons", "persona", "tastes", "says"):
        assert key in m
    assert "—" not in m["says"]
    assert all("—" not in r for r in m["reasons"])
