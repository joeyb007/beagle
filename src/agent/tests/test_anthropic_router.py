"""T1: AnthropicRouter — tier→model routing, fallback on error/refusal, routing_log."""

import sqlite3
from types import SimpleNamespace

import pytest

from src.agent.anthropic_router import AnthropicRouter

SCHEMA = open("schema.sql").read()


class FakeMessages:
    """Anthropic messages.create surface; fails or refuses per-model."""

    def __init__(self, broken: set[str] | None = None, refusing: set[str] | None = None):
        self.broken = broken or set()
        self.refusing = refusing or set()
        self.calls: list[dict] = []

    async def create(self, *, model, max_tokens, messages, system=None, **kw):
        self.calls.append({"model": model, "messages": messages, "system": system})
        if model in self.broken:
            raise RuntimeError(f"model {model} unavailable")
        if model in self.refusing:
            return SimpleNamespace(stop_reason="refusal", content=[], usage=None)
        return SimpleNamespace(
            stop_reason="end_turn",
            content=[
                SimpleNamespace(type="thinking", thinking=""),  # filtered out
                SimpleNamespace(type="text", text=f"reply from {model}"),
            ],
            usage=SimpleNamespace(input_tokens=1_000_000, output_tokens=1_000_000),
        )


def make_client(broken=None, refusing=None):
    messages = FakeMessages(broken, refusing)
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
    router = AnthropicRouter(
        client=client, db_path=db, cheap_model="small-1", frontier_model="big-1"
    )

    out = await router.complete(tier="cheap", input="parse this", system="be terse")

    assert out == "reply from small-1"
    assert messages.calls[0]["model"] == "small-1"
    assert messages.calls[0]["system"] == "be terse"  # top-level system param
    assert messages.calls[0]["messages"] == [{"role": "user", "content": "parse this"}]

    rows = sqlite3.connect(db).execute(
        "SELECT model, tier, latency_ms FROM routing_log"
    ).fetchall()
    assert rows == [("small-1", "cheap", rows[0][2])] and rows[0][2] >= 0


async def test_frontier_tier_routes_to_frontier_model(db):
    client, messages = make_client()
    router = AnthropicRouter(
        client=client, db_path=db, cheap_model="small-1", frontier_model="big-1"
    )

    out = await router.complete(tier="frontier", input="negotiate")

    assert out == "reply from big-1"
    assert messages.calls[0]["model"] == "big-1"
    assert messages.calls[0]["system"] is None


async def test_falls_back_to_other_model_on_error(db):
    client, messages = make_client(broken={"big-1"})
    router = AnthropicRouter(
        client=client, db_path=db, cheap_model="small-1", frontier_model="big-1"
    )

    out = await router.complete(tier="frontier", input="negotiate")

    assert out == "reply from small-1"
    assert [c["model"] for c in messages.calls] == ["big-1", "small-1"]
    rows = sqlite3.connect(db).execute("SELECT model FROM routing_log").fetchall()
    assert rows == [("small-1",)]  # only the successful call lands


async def test_falls_back_on_refusal_stop_reason(db):
    client, messages = make_client(refusing={"big-1"})
    router = AnthropicRouter(
        client=client, db_path=db, cheap_model="small-1", frontier_model="big-1"
    )

    out = await router.complete(tier="frontier", input="scan these hosts")

    assert out == "reply from small-1"
    assert [c["model"] for c in messages.calls] == ["big-1", "small-1"]


async def test_both_models_failing_raises(db):
    client, _ = make_client(broken={"small-1", "big-1"})
    router = AnthropicRouter(
        client=client, db_path=db, cheap_model="small-1", frontier_model="big-1"
    )
    with pytest.raises(RuntimeError):
        await router.complete(tier="cheap", input="anything")


async def test_cost_estimate_logged_for_known_models(db):
    client, _ = make_client()
    router = AnthropicRouter(
        client=client, db_path=db,
        cheap_model="claude-haiku-4-5", frontier_model="claude-opus-5",
    )

    await router.complete(tier="frontier", input="plan")

    (cost,) = sqlite3.connect(db).execute(
        "SELECT cost_estimate FROM routing_log"
    ).fetchone()
    # fake usage is 1M in + 1M out; opus-5 is $5/$25 per MTok
    assert cost == pytest.approx(30.0)
