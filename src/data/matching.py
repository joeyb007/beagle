"""T8 — MatchingService: radius prefilter + cosine rank over fused vectors (FR28-30).

Stays inside SQLite (no Postgres): the labeled sample pool lives in `seed.py`, we
compute each candidate's fused vector with the *same* pipeline as real profiles
(T7), radius-prefilter by haversine from the demo origin, then cosine-rank the
querying user's `profile_vector` against survivors. Reasons are derived from the
raw overlap (cuisines / vibe / music), not the opaque vector, so they read human.
Results are written to `matches` for C to render; A sends the top one as a card.
"""

from __future__ import annotations

import json
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

import numpy as np

from ..contracts import Match, Profile, ProfileStore
from .db import connect
from .embeddings import (IMAGE_DIM, cosine, fuse, profile_tokens, taste_to_vector,
                         text_vector)
from .seed import DEMO_ORIGIN, POOL


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    (lat1, lon1), (lat2, lon2) = a, b
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    h = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(h))


def _candidate_vector(cand: dict) -> tuple[list[float], np.ndarray]:
    """Fused vector + music sub-vector, built like a real profile (T7)."""
    text_v = text_vector(profile_tokens(
        cand["cuisines"], cand["vibe"], [], cand.get("persona"),
    ))
    music_v = taste_to_vector({g: 1.0 for g in cand["genres"]})
    image_v = np.zeros(IMAGE_DIM, dtype=np.float32)
    return fuse(text_v, music_v, image_v), music_v


def _reasons(me: Profile, cand: dict, cand_music: np.ndarray, dist_km: float) -> list[str]:
    reasons: list[str] = []
    shared_c = [c for c in cand["cuisines"] if c in set(me.cuisines)]
    if shared_c:
        reasons.append("You both love " + " & ".join(shared_c))
    shared_v = [v for v in cand["vibe"] if v in set(me.vibe)]
    if shared_v:
        reasons.append("Same " + "/".join(shared_v) + " energy")
    if me.music_vector and cosine(me.music_vector, cand_music.tolist()) > 0.25:
        reasons.append("Overlapping music taste")
    reasons.append(f"~{dist_km:.1f} km away")
    if not shared_c and not shared_v and len(reasons) == 1:
        reasons.insert(0, "Strong overall profile match")
    return reasons[:3]


class SqliteMatchingService:
    def __init__(
        self,
        store: ProfileStore,
        db_path: str | Path | None = None,
        origin: tuple[float, float] = DEMO_ORIGIN,
    ) -> None:
        self._store = store
        self._db = db_path
        self._origin = origin
        # precompute the sample pool's vectors once
        self._pool = []
        for cand in POOL:
            vec, music = _candidate_vector(cand)
            dist = _haversine_km(origin, (cand["lat"], cand["lon"]))
            self._pool.append({"cand": cand, "vec": vec, "music": music, "dist": dist})

    async def match_nearby(self, handle: str, radius_km: float, k: int) -> list[Match]:
        me = await self._store.get(handle)
        if me is None or not me.profile_vector:
            return []

        # 1. radius prefilter
        near = [p for p in self._pool if p["dist"] <= radius_km]
        # 2. cosine rank on fused vectors
        ranked = sorted(
            near, key=lambda p: cosine(me.profile_vector, p["vec"]), reverse=True
        )[:k]

        matches: list[Match] = []
        for p in ranked:
            cand = p["cand"]
            matches.append(Match(
                handle=handle,
                match_name=cand["name"],
                score=round(cosine(me.profile_vector, p["vec"]), 4),
                reasons=_reasons(me, cand, p["music"], p["dist"]),
                is_sample=True,
            ))

        self._write(handle, matches)
        return matches

    def _write(self, handle: str, matches: list[Match]) -> None:
        conn = connect(self._db)
        try:
            conn.execute(
                "DELETE FROM matches WHERE handle = ? AND is_sample = 1", (handle,)
            )
            conn.executemany(
                "INSERT INTO matches (handle, match_name, score, reasons, is_sample) "
                "VALUES (?, ?, ?, ?, 1)",
                [(m.handle, m.match_name, m.score, json.dumps(m.reasons)) for m in matches],
            )
            conn.commit()
        finally:
            conn.close()
