"""SqliteMessageLog: append rows, read un-snapshotted windows, advance bookmark."""

import pytest

from src.data.db import init_db
from src.data.message_log import SqliteMessageLog

pytestmark = pytest.mark.asyncio


@pytest.fixture
def log(tmp_path):
    db = tmp_path / "t.sqlite"
    init_db(db)
    return SqliteMessageLog(db)


async def test_window_returns_appended_rows_in_order(log):
    await log.append("g1", "+1555", "in", "hey beagle")
    await log.append("g1", "beagle", "out", "on it")
    await log.append("dm1", "+1666", "in", "unrelated chat")
    rows, last_id = await log.window("g1")
    assert [(r["handle"], r["direction"], r["text"]) for r in rows] == [
        ("+1555", "in", "hey beagle"),
        ("beagle", "out", "on it"),
    ]
    assert last_id == rows[-1]["id"]


async def test_advance_excludes_older_rows_from_next_window(log):
    await log.append("g1", "+1555", "in", "first")
    rows, last_id = await log.window("g1")
    await log.advance("g1", last_id)
    await log.append("g1", "+1555", "in", "second")
    rows, _ = await log.window("g1")
    assert [r["text"] for r in rows] == ["second"]


async def test_empty_window_is_none(log):
    rows, last_id = await log.window("never-seen")
    assert rows == [] and last_id is None
