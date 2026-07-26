"""T9: SqliteArtifactStore — writes the artifacts row C's web app reads."""

import sqlite3
from datetime import datetime

import pytest

from src.agent.artifact_store import SqliteArtifactStore
from src.contracts import Candidate, FinalPlan, Track

SCHEMA = open("schema.sql").read()


@pytest.fixture
def db(tmp_path):
    path = tmp_path / "data.sqlite"
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.close()
    return str(path)


def make_plan():
    return FinalPlan(
        plan_id="plan-1",
        place=Candidate(name="Ebisu Sushi", area="Inner Sunset"),
        time=datetime(2026, 8, 1, 19, 0),
        attendees=["+15550000001", "+15550000002"],
    )


async def test_create_writes_row_and_get_roundtrips(db):
    store = SqliteArtifactStore(db)
    playlist = [Track(title="Blend Opener", artist="The Stubs")]

    created = await store.create(make_plan(), playlist)

    assert created.plan_id == "plan-1"
    # the row exists for C to read
    row = sqlite3.connect(db).execute(
        "SELECT plan_id, attendees, playlist FROM artifacts"
    ).fetchone()
    assert row[0] == "plan-1"
    assert "+15550000001" in row[1]
    assert "Blend Opener" in row[2]
    # and round-trips through the port
    got = await store.get("plan-1")
    assert got.place.name == "Ebisu Sushi"
    assert got.playlist[0].artist == "The Stubs"
    assert got.photos == []


async def test_add_photos_flips_to_keepsake(db):
    store = SqliteArtifactStore(db)
    await store.create(make_plan(), [])

    await store.add_photos("plan-1", ["https://x.test/1.jpg", "https://x.test/2.jpg"])

    got = await store.get("plan-1")
    assert got.photos == ["https://x.test/1.jpg", "https://x.test/2.jpg"]


async def test_get_missing_returns_none(db):
    assert await SqliteArtifactStore(db).get("nope") is None
