"""T9 — ProfileRefresher: batch profile update at plan-lock (FR13).

A hands us the session's collected fan-out replies. We re-distill ONLY the
affected members — one cheap call per member, batching that member's replies
(never per-message) — and *merge* the fresh signal into the standing profile:
lists union (new tastes/dealbreakers add on), scalars overwrite when present
(availability that shifted this session wins). Vectors and constraint_score are
recomputed. Live replies thus enrich the profile without discarding cold-start.
"""

from __future__ import annotations

from ..contracts import Profile, ProfileStore, Reply
from .distiller import Distiller, compute_constraint_score
from .embeddings import EmbeddingBuilder
from .importer import PersonMessages


def _union(a: list[str], b: list[str]) -> list[str]:
    out = list(a)
    for x in b:
        if x not in out:
            out.append(x)
    return out


def _merge(old: Profile, fresh: Profile) -> Profile:
    m = old.model_copy(deep=True)
    m.cuisines = _union(old.cuisines, fresh.cuisines)
    m.vibe = _union(old.vibe, fresh.vibe)
    m.hard_nos = _union(old.hard_nos, fresh.hard_nos)
    if fresh.typical_availability:
        m.typical_availability = fresh.typical_availability
    if fresh.price_band:
        m.price_band = fresh.price_band
    if fresh.persona_label:
        m.persona_label = fresh.persona_label
    if fresh.notes:
        m.notes = fresh.notes
    m.constraint_score = compute_constraint_score(m)
    return m


class SqliteProfileRefresher:
    def __init__(
        self, distiller: Distiller, store: ProfileStore, embedder: EmbeddingBuilder
    ) -> None:
        self._distiller = distiller
        self._store = store
        self._embedder = embedder

    async def refresh(self, replies: list[Reply]) -> None:
        # batch replies by member — one cheap call each, never per-message
        by_handle: dict[str, list[str]] = {}
        for r in replies:
            by_handle.setdefault(r.handle, []).append(r.text)

        for handle, texts in by_handle.items():
            old = await self._store.get(handle)
            if old is None:
                continue  # A only refreshes members we already profiled
            fresh = await self._distiller.distill(
                PersonMessages(handle=handle, name=old.name, messages=texts)
            )
            merged = _merge(old, fresh)
            await self._embedder.build(merged)  # taste may have shifted → re-embed
            await self._store.upsert(merged)
