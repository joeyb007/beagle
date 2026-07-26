"""T1: LLMRouter over Merge Gateway (FR31-33).

OpenAI-compatible client with Merge's base URL. cheap → small model,
frontier → strong model, fallback to the other tier's model on error.
Sole producer of routing_log — one row per successful call (C's dashboard).
"""

import os
import sqlite3
import time

from openai import AsyncOpenAI

from src.contracts import LLMTier

# Defaults verified against gateway.merge.dev docs: OpenAI-compatible surface,
# provider-prefixed model ids, base URL gateway.merge.dev/v1.
DEFAULT_BASE_URL = "https://gateway.merge.dev/v1"
DEFAULT_CHEAP = os.environ.get("MERGE_CHEAP_MODEL", "google/gemini-2.0-flash")
DEFAULT_FRONTIER = os.environ.get("MERGE_FRONTIER_MODEL", "anthropic/claude-sonnet-4-20250514")


class MergeRouter:
    def __init__(
        self,
        *,
        db_path: str,
        client: object | None = None,
        cheap_model: str = DEFAULT_CHEAP,
        frontier_model: str = DEFAULT_FRONTIER,
    ):
        self._client = client or AsyncOpenAI(
            api_key=os.environ["MERGE_API_KEY"],
            base_url=os.environ.get("MERGE_BASE_URL", DEFAULT_BASE_URL),
        )
        self._db_path = db_path
        self._models: dict[LLMTier, str] = {"cheap": cheap_model, "frontier": frontier_model}

    async def complete(self, *, tier: LLMTier, input: str, system: str | None = None) -> str:
        primary = self._models[tier]
        fallback = self._models["cheap" if tier == "frontier" else "frontier"]
        messages = ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": input}
        ]

        last_err: Exception | None = None
        for model in (primary, fallback):
            start = time.monotonic()
            try:
                resp = await self._client.chat.completions.create(model=model, messages=messages)
            except Exception as e:  # any provider error → try fallback
                last_err = e
                continue
            self._log(model, tier, int((time.monotonic() - start) * 1000))
            return resp.choices[0].message.content
        raise last_err  # both models failed — orchestrator fails closed (T10)

    def _log(self, model: str, tier: str, latency_ms: int) -> None:
        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                "INSERT INTO routing_log (model, tier, latency_ms) VALUES (?, ?, ?)",
                (model, tier, latency_ms),
            )
