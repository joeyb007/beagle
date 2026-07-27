"""Context-update service: un-snapshotted message windows → profile merges.

In-process module behind the ContextUpdater protocol (contracts.py). GC mode
(multi-speaker window, one cheap call per participant) and DM mode (single
human) share this pipeline; the caller just passes the chat + participants.
Reuses the Distiller's never-invent guards and the Refresher's merge rules.
"""

from __future__ import annotations

from ..contracts import LLMRouter, Profile, ProfileStore
from .distiller import (
    _PRICE_BANDS,
    _clean_list,
    _clean_str,
    _extract_json,
    compute_constraint_score,
)
from .embeddings import EmbeddingBuilder
from .message_log import SqliteMessageLog
from .refresh import _merge

BEAGLE_HANDLE = "beagle"

CONTEXT_SYSTEM = (
    "You are Beagle's context updater. Given one person's PRIOR profile JSON "
    "(or 'none') and a recent chat thread, return an UPDATED profile as ONLY a "
    "JSON object with keys: cuisines (list), price_band ('$'|'$$'|'$$$'|null), "
    "vibe (list), hard_nos (list), typical_availability (string|null), "
    "persona_label (string|null), notes (string|null). Add only facts the "
    "thread clearly supports about THIS person; keep prior facts; never invent."
)


class SqliteContextUpdater:
    def __init__(
        self,
        llm: LLMRouter,
        store: ProfileStore,
        embedder: EmbeddingBuilder,
        log: SqliteMessageLog,
    ) -> None:
        self._llm = llm
        self._store = store
        self._embedder = embedder
        self._log = log

    async def snapshot(self, chat_id: str, participants: list[str]) -> None:
        rows, last_id = await self._log.window(chat_id)
        names = await self._names(participants)
        thread = "\n".join(
            f"[{names.get(r['handle'], r['handle'])}]: {r['text']}" for r in rows
        )
        for handle in participants:
            if handle == BEAGLE_HANDLE:
                continue
            try:
                await self._update_one(handle, names.get(handle, handle), thread)
            except Exception:
                continue  # one bad member never blocks the rest
        if last_id is not None:
            await self._log.advance(chat_id, last_id)

    async def _names(self, participants: list[str]) -> dict[str, str]:
        names: dict[str, str] = {}
        for h in participants:
            p = await self._store.get(h)
            if p is not None:
                names[h] = p.name
        return names

    async def _update_one(self, handle: str, name: str, thread: str) -> None:
        prior = await self._store.get(handle)
        if not thread:
            if prior is None:  # silent unknown at trigger time: cold-start row
                await self._store.upsert(Profile(handle=handle, name=name))
            return
        prior_json = prior.model_dump_json() if prior else "none"
        raw = await self._llm.complete(
            tier="cheap",
            system=CONTEXT_SYSTEM,
            input=f"Person: {name} ({handle})\nPrior profile: {prior_json}\nThread:\n{thread}",
        )
        data = _extract_json(raw)
        price = data.get("price_band")
        fresh = Profile(
            handle=handle,
            name=(prior.name if prior else name),
            cuisines=_clean_list(data.get("cuisines")),
            price_band=price if price in _PRICE_BANDS else None,
            vibe=_clean_list(data.get("vibe")),
            hard_nos=_clean_list(data.get("hard_nos")),
            typical_availability=_clean_str(data.get("typical_availability")),
            persona_label=_clean_str(data.get("persona_label")),
            notes=_clean_str(data.get("notes")),
        )
        merged = _merge(prior, fresh) if prior else fresh
        merged.constraint_score = compute_constraint_score(merged)
        await self._embedder.build(merged)
        await self._store.upsert(merged)
