"""T1: MergeRouter — tier→model routing, fallback on error, routing_log writes."""

import sqlite3
from types import SimpleNamespace

import pytest

from src.agent.merge_router import MergeRouter

SCHEMA = open("schema.sql").read()


class FakeCompletions:
    """OpenAI-compatible chat.completions surface; fails for models in `broken`."""

    def __init__(self, broken: set[str] | None = None):
        self.broken = broken or set()
        self.calls: list[dict] = []

    async def create(self, *, model, messages, **kw):
        self.calls.append({"model": model, "messages": messages})
        if model in self.broken:
            raise RuntimeError(f"model {model} unavailable")
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=f"reply from {model}"))]
        )


def make_client(broken=None):
    completions = FakeCompletions(broken)
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return client, completions


@pytest.fixture
def db(tmp_path):
    path = tmp_path / "data.sqlite"
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.close()
    return str(path)


async def test_cheap_tier_routes_to_cheap_model_and_logs(db):
    client, completions = make_client()
    router = MergeRouter(
        client=client, db_path=db, cheap_model="small-1", frontier_model="big-1"
    )

    out = await router.complete(tier="cheap", input="parse this", system="be terse")

    assert out == "reply from small-1"
    assert completions.calls[0]["model"] == "small-1"
    # system prompt goes through
    assert completions.calls[0]["messages"][0] == {"role": "system", "content": "be terse"}

    rows = sqlite3.connect(db).execute(
        "SELECT model, tier, latency_ms FROM routing_log"
    ).fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "small-1"
    assert rows[0][1] == "cheap"
    assert rows[0][2] >= 0


async def test_frontier_tier_routes_to_frontier_model(db):
    client, completions = make_client()
    router = MergeRouter(
        client=client, db_path=db, cheap_model="small-1", frontier_model="big-1"
    )

    out = await router.complete(tier="frontier", input="negotiate")

    assert out == "reply from big-1"
    assert completions.calls[0]["model"] == "big-1"


async def test_falls_back_to_other_model_on_error(db):
    client, completions = make_client(broken={"big-1"})
    router = MergeRouter(
        client=client, db_path=db, cheap_model="small-1", frontier_model="big-1"
    )

    out = await router.complete(tier="frontier", input="negotiate")

    assert out == "reply from small-1"  # fell back
    assert [c["model"] for c in completions.calls] == ["big-1", "small-1"]
    # the successful (fallback) call is what lands in the log
    rows = sqlite3.connect(db).execute("SELECT model FROM routing_log").fetchall()
    assert rows == [("small-1",)]
