"""Nearby-pool profiles (match candidates) must never enter the fan-out set."""

import json
import sqlite3

import pytest

from src.data.db import init_db
from src.data.store import SqliteProfileStore


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data.sqlite")
    init_db(path)
    conn = sqlite3.connect(path)
    for handle, name, extra in [
        ("+1", "Friend", {}),
        ("+2", "Candidate", {"nearby": True}),
    ]:
        conn.execute(
            "INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, 0.5)",
            (handle, name, json.dumps({"handle": handle, "name": name, **extra})),
        )
    conn.commit()
    conn.close()
    return path


async def test_list_excludes_nearby_pool(db):
    store = SqliteProfileStore(db)
    handles = [p.handle for p in await store.list()]
    assert handles == ["+1"]  # the nearby candidate is not a group member
