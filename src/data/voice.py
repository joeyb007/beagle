"""T4 — VoiceProvider: derive the group's voice as a bounded system-prompt string.

Aggregates cold-start text (the imported group chat) and asks the LLM once for a
short style guide. Flavor only (FR16): A applies it to fan-out + confirmation
copy, never to the facts of a plan. Cached after first derivation — one call.
"""

from __future__ import annotations

from pathlib import Path

from ..contracts import LLMRouter
from .db import connect

_MAX_CHARS = 4000  # keep the single call cheap
_FALLBACK = (
    "Group voice: warm, casual, and playful. Keep Beagle's messages short and "
    "human — never corporate. Flavor only: never change the facts of the plan."
)

_SYSTEM = (
    "You are Beagle's group-voice analyst. Read the group's chat and return ONE "
    "short style guide (plain text, no JSON) capturing their cadence, slang, and "
    "inside jokes so Beagle can text in-group. This is flavor only — it must never "
    "change the facts of a plan."
)


class SqliteVoiceProvider:
    def __init__(self, llm: LLMRouter, db_path: str | Path | None = None) -> None:
        self._llm = llm
        self._db = db_path
        self._cached: str | None = None

    def _cold_start_text(self) -> str:
        conn = connect(self._db)
        try:
            rows = conn.execute("SELECT raw_text FROM imports ORDER BY id").fetchall()
            if rows:
                return "\n".join(r["raw_text"] for r in rows)
            # fallback: synthesize from distilled notes if no raw import survived
            rows = conn.execute("SELECT json FROM profiles").fetchall()
        finally:
            conn.close()
        return "\n".join(r["json"] for r in rows)

    async def style(self) -> str:
        if self._cached is not None:
            return self._cached
        text = self._cold_start_text().strip()
        if not text:
            self._cached = _FALLBACK
            return self._cached
        out = await self._llm.complete(
            tier="cheap", input=text[-_MAX_CHARS:], system=_SYSTEM
        )
        self._cached = out.strip() or _FALLBACK
        return self._cached
