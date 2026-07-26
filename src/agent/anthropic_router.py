"""LLMRouter over the Anthropic API directly (Merge Gateway alternative).

Same shape as MergeRouter: cheap → Haiku, frontier → Sonnet, fallback to the
other tier's model on error, one routing_log row per successful call.
"""

import os
import sqlite3
import time

from src.contracts import LLMTier

DEFAULT_CHEAP = os.environ.get("ANTHROPIC_CHEAP_MODEL", "claude-haiku-4-5-20251001")
DEFAULT_FRONTIER = os.environ.get("ANTHROPIC_FRONTIER_MODEL", "claude-sonnet-5")


class AnthropicRouter:
    def __init__(
        self,
        *,
        db_path: str,
        client: object | None = None,
        cheap_model: str = DEFAULT_CHEAP,
        frontier_model: str = DEFAULT_FRONTIER,
    ):
        if client is None:
            from anthropic import AsyncAnthropic

            client = AsyncAnthropic()  # reads ANTHROPIC_API_KEY
        self._client = client
        self._db_path = db_path
        self._models: dict[LLMTier, str] = {"cheap": cheap_model, "frontier": frontier_model}

    async def complete(self, *, tier: LLMTier, input: str, system: str | None = None) -> str:
        primary = self._models[tier]
        fallback = self._models["cheap" if tier == "frontier" else "frontier"]

        last_err: Exception | None = None
        for model in (primary, fallback):
            start = time.monotonic()
            try:
                resp = await self._client.messages.create(
                    model=model,
                    max_tokens=1024,
                    messages=[{"role": "user", "content": input}],
                    **({"system": system} if system else {}),
                )
            except Exception as e:  # any provider error → try fallback
                last_err = e
                continue
            self._log(model, tier, int((time.monotonic() - start) * 1000))
            return "".join(block.text for block in resp.content if hasattr(block, "text"))
        raise last_err  # both models failed — orchestrator fails closed

    def _log(self, model: str, tier: str, latency_ms: int) -> None:
        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                "INSERT INTO routing_log (model, tier, latency_ms) VALUES (?, ?, ?)",
                (model, tier, latency_ms),
            )
