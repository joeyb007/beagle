"""AnthropicRouter — tier→model routing, fallback on error, routing_log writes."""

import sqlite3
from types import SimpleNamespace

import pytest

from src.agent.anthropic_router import AnthropicRouter

SCHEMA = open("schema.sql").read()


class FakeMessages:
    """Anthropic messages surface; fails for models in `broken`."""

    def __init__(self, broken: set[str] | None = None):
        self.broken = broken or set()
        self.calls: list[dict] = []

    async def create(self, *, model, messages, max_tokens, system=None, **kw):
        self.calls.append({"model": model, "messages": messages, "system": system})
        if model in self.broken:
            raise RuntimeError(f"model {model} unavailable")
        return SimpleNamespace(content=[SimpleNamespace(text=f"reply from {model}")])


def make_client(broken=None):
    messages = FakeMessages(broken)
    return SimpleNamespace(messages=messages), messages


@pytest.fixture
def db(tmp_path):
    path = tmp_path / "data.sqlite"
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.close()
    return str(path)


async def test_cheap_tier_routes_to_cheap_model_and_logs(db):
    client, messages = make_client()
    router = AnthropicRouter(client=client, db_path=db, cheap_model="small-1", frontier_model="big-1")

    out = await router.complete(tier="cheap", input="parse this", system="be terse")

    assert out == "reply from small-1"
    assert messages.calls[0]["model"] == "small-1"
    assert messages.calls[0]["system"] == "be terse"
    assert messages.calls[0]["messages"] == [{"role": "user", "content": "parse this"}]

    rows = sqlite3.connect(db).execute("SELECT model, tier, latency_ms FROM routing_log").fetchall()
    assert rows == [("small-1", "cheap", rows[0][2])]
    assert rows[0][2] >= 0


async def test_frontier_tier_routes_to_frontier_model(db):
    client, messages = make_client()
    router = AnthropicRouter(client=client, db_path=db, cheap_model="small-1", frontier_model="big-1")

    assert await router.complete(tier="frontier", input="negotiate") == "reply from big-1"
    assert messages.calls[0]["model"] == "big-1"


async def test_falls_back_to_other_model_on_error(db):
    client, messages = make_client(broken={"big-1"})
    router = AnthropicRouter(client=client, db_path=db, cheap_model="small-1", frontier_model="big-1")

    out = await router.complete(tier="frontier", input="negotiate")

    assert out == "reply from small-1"
    assert [c["model"] for c in messages.calls] == ["big-1", "small-1"]
    rows = sqlite3.connect(db).execute("SELECT model FROM routing_log").fetchall()
    assert rows == [("small-1",)]
