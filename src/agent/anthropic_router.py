"""T1: LLMRouter over the Anthropic API (FR31-33).

Official `anthropic` SDK, tier→model routing: cheap → Haiku (parsing,
classification), frontier → Opus (asks, proposals, anything user-facing).
Falls back to the other tier's model on provider errors and on safety-
classifier refusals (stop_reason "refusal" arrives as a normal 200 — check
it before reading content). Sole producer of routing_log — one row per
successful call, now with a real cost estimate (C's dashboard).
"""

import os
import sqlite3
import time

import anthropic

from src.contracts import LLMTier

DEFAULT_CHEAP = os.environ.get("ANTHROPIC_CHEAP_MODEL", "claude-haiku-4-5")
DEFAULT_FRONTIER = os.environ.get("ANTHROPIC_FRONTIER_MODEL", "claude-opus-5")

MAX_TOKENS = 16000  # hard cap on thinking + text; small outputs stop on their own

# $ per 1M tokens (input, output) — for routing_log cost_estimate only
PRICES: dict[str, tuple[float, float]] = {
    "claude-opus-5": (5.00, 25.00),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
}


class AnthropicRouter:
    def __init__(
        self,
        *,
        db_path: str,
        client: object | None = None,
        cheap_model: str = DEFAULT_CHEAP,
        frontier_model: str = DEFAULT_FRONTIER,
    ):
        # zero-arg client resolves ANTHROPIC_API_KEY / auth profile from the env
        self._client = client or anthropic.AsyncAnthropic()
        self._db_path = db_path
        self._models: dict[LLMTier, str] = {"cheap": cheap_model, "frontier": frontier_model}

    async def complete(self, *, tier: LLMTier, input: str, system: str | None = None) -> str:
        primary = self._models[tier]
        fallback = self._models["cheap" if tier == "frontier" else "frontier"]

        extra = {} if system is None else {"system": system}  # None must be omitted, not sent
        last_err: Exception | None = None
        for model in (primary, fallback):
            start = time.monotonic()
            try:
                resp = await self._client.messages.create(
                    model=model,
                    max_tokens=MAX_TOKENS,
                    messages=[{"role": "user", "content": input}],
                    **extra,
                )
            except Exception as e:  # any provider error → try the other tier
                last_err = e
                continue
            if resp.stop_reason == "refusal":  # classifier decline, HTTP 200
                last_err = RuntimeError(f"{model} refused the request")
                continue
            text = "".join(b.text for b in resp.content if b.type == "text")
            self._log(model, tier, int((time.monotonic() - start) * 1000), _cost(model, resp))
            return text
        raise last_err  # both models failed — orchestrator fails closed (T10)

    def _log(self, model: str, tier: str, latency_ms: int, cost: float | None) -> None:
        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                "INSERT INTO routing_log (model, tier, latency_ms, cost_estimate)"
                " VALUES (?, ?, ?, ?)",
                (model, tier, latency_ms, cost),
            )


def _cost(model: str, resp) -> float | None:
    usage = getattr(resp, "usage", None)
    # prefix match so dated snapshot ids ("claude-haiku-4-5-20251001") price too
    prices = next((p for base, p in PRICES.items() if model.startswith(base)), None)
    if usage is None or prices is None:
        return None
    in_price, out_price = prices
    return usage.input_tokens / 1e6 * in_price + usage.output_tokens / 1e6 * out_price
