"""Semantic KNN matching engine — the one engine behind /matches and the
find_people / make_intro tools.

Pipeline: gates (nearby pool, not self, not already swiped, free-day) →
retrieval → assemble reasons + pitch. Retrieval is semantic when fastembed is
available: each profile is serialized into a natural-language person card and
embedded (cached in SQLite by profile hash); cosine over those embeddings is
the KNN metric, and a free-text query rides along on the asker's card. With
MATCH_FAKE=1 or no fastembed, retrieval falls back to the deterministic
hand-built taste-vector cosine (port of web/lib/similarity.ts).
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sqlite3

from src.agent.planner_tools import _blocks

DAY_WEIGHT = 0.5  # availability overlap matters, but taste dominates
EMBED_MODEL = "BAAI/bge-small-en-v1.5"

_model = None  # process-level cache; fastembed loads once


# ---- person card: the whole person as one paragraph ----

def person_card(name: str, data: dict) -> str:
    bits = [f"{name}"]
    if data.get("persona_label"):
        bits.append(f"known as {data['persona_label']}")
    if data.get("cuisines"):
        bits.append(f"loves {', '.join(data['cuisines'])}")
    if data.get("vibe"):
        bits.append(f"{', '.join(data['vibe'])} energy")
    if data.get("hard_nos"):
        bits.append(f"hard no to {', '.join(data['hard_nos'])}")
    if data.get("typical_availability"):
        bits.append(f"usually free {data['typical_availability']}")
    return ". ".join(bits) + "."


# ---- fallback: sparse taste vectors (deterministic, offline) ----

def _taste_vector(data: dict) -> dict[str, float]:
    v: dict[str, float] = {}
    for c in data.get("cuisines") or []:
        v[f"cuisine:{c.lower()}"] = 1.0
    for x in data.get("vibe") or []:
        v[f"vibe:{x.lower()}"] = 1.0
    for n in data.get("hard_nos") or []:
        v[f"no:{n.lower()}"] = 1.0  # shared aversions bond people
    days, _, _ = _blocks(data.get("typical_availability"))
    for d in days:
        v[f"day:{d}"] = DAY_WEIGHT
    return v


def _cosine_sparse(a: dict[str, float], b: dict[str, float]) -> float:
    dot = sum(va * b.get(k, 0.0) for k, va in a.items())
    norm = lambda v: math.sqrt(sum(x * x for x in v.values()))  # noqa: E731
    denom = norm(a) * norm(b)
    return dot / denom if denom else 0.0


def _cosine_dense(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    denom = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / denom if denom else 0.0


# ---- reasons + pitch (user-facing: no em dashes, ever) ----

def _shared(a: list | None, b: list | None) -> list[str]:
    lower_b = [y.lower() for y in (b or [])]
    return [x for x in (a or []) if x.lower() in lower_b]


def _reasons(mine: dict, theirs: dict) -> list[str]:
    out: list[str] = []
    cuisines = _shared(mine.get("cuisines"), theirs.get("cuisines"))
    if cuisines:
        out.append(f"both crave {' & '.join(cuisines)}")
    vibes = _shared(mine.get("vibe"), theirs.get("vibe"))
    if vibes:
        out.append(f"{', '.join(vibes)} energy on both sides")
    nos = _shared(mine.get("hard_nos"), theirs.get("hard_nos"))
    if nos:
        out.append(f"both allergic to {' & '.join(nos)}")
    my_days, _, _ = _blocks(mine.get("typical_availability"))
    their_days, _, _ = _blocks(theirs.get("typical_availability"))
    overlap = [d for d in their_days if d in my_days]
    if overlap:
        out.append(f"{len(overlap)} free day{'s' if len(overlap) != 1 else ''} in common")
    return out


def _pitch(mine: dict, theirs: dict) -> str:
    nos = _shared(mine.get("hard_nos"), theirs.get("hard_nos"))
    if nos:
        return f"you both say no to {nos[0]}, that's basically friendship already 🐶"
    cuisines = _shared(mine.get("cuisines"), theirs.get("cuisines"))
    if cuisines:
        return f"two people who'd split the {cuisines[0]} order without discussion"
    vibes = _shared(mine.get("vibe"), theirs.get("vibe"))
    if vibes:
        return f"{vibes[0]} energy on both ends, beagle can feel it"
    return "beagle just has a feeling about this one 🐶"


# ---- semantic path: fastembed + sqlite cache ----

def _embedder():
    global _model
    if os.environ.get("MATCH_FAKE"):
        return None
    if _model is not None:
        return _model
    try:
        from fastembed import TextEmbedding

        _model = TextEmbedding(model_name=EMBED_MODEL)
    except Exception:
        _model = None
    return _model


def _ensure_cache(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS person_embeddings ("
        " handle TEXT PRIMARY KEY, profile_hash TEXT NOT NULL, vec TEXT NOT NULL)"
    )


def _cached_embedding(conn: sqlite3.Connection, model, handle: str, card: str) -> list[float]:
    h = hashlib.sha256(card.encode()).hexdigest()
    row = conn.execute(
        "SELECT profile_hash, vec FROM person_embeddings WHERE handle = ?", (handle,)
    ).fetchone()
    if row and row[0] == h:
        return json.loads(row[1])
    vec = [float(x) for x in next(iter(model.embed([card])))]
    conn.execute(
        "INSERT INTO person_embeddings (handle, profile_hash, vec) VALUES (?, ?, ?)"
        " ON CONFLICT(handle) DO UPDATE SET profile_hash = excluded.profile_hash,"
        " vec = excluded.vec",
        (handle, h, json.dumps(vec)),
    )
    conn.commit()
    return vec


# ---- the engine ----

def find_matches(
    db_path: str,
    handle: str,
    *,
    query: str | None = None,
    free_day: int | None = None,
    limit: int = 4,
) -> list[dict]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        _ensure_cache(conn)
        profiles = [
            (r["handle"], r["name"], json.loads(r["json"]))
            for r in conn.execute("SELECT handle, name, json FROM profiles")
        ]
        mine = next(((h, n, d) for h, n, d in profiles if h == handle), None)
        if mine is None:
            return []
        _, my_name, my_data = mine

        swiped = {
            r["match_handle"]
            for r in conn.execute("SELECT match_handle FROM intros WHERE handle = ?", (handle,))
        }
        candidates = [
            (h, n, d)
            for h, n, d in profiles
            if h != handle and d.get("nearby") is True and h not in swiped
        ]
        if free_day is not None:
            candidates = [
                (h, n, d)
                for h, n, d in candidates
                if free_day in _blocks(d.get("typical_availability"))[0]
            ]

        model = _embedder()
        if model is not None:
            my_card = person_card(my_name, my_data)
            if query:
                my_card += f" Looking for: {query}."
            my_vec = [float(x) for x in next(iter(model.embed([my_card])))]
            scored = [
                (h, n, d, _cosine_dense(my_vec, _cached_embedding(conn, model, h, person_card(n, d))))
                for h, n, d in candidates
            ]
        else:
            my_vec_sparse = _taste_vector(my_data)
            q_tokens = set((query or "").lower().split())
            scored = []
            for h, n, d in candidates:
                score = _cosine_sparse(my_vec_sparse, _taste_vector(d))
                if q_tokens:
                    tastes = [*(d.get("cuisines") or []), *(d.get("vibe") or [])]
                    if any(t.lower() in q_tokens for t in tastes):
                        score += 0.25  # query boost: they have what you asked for
                scored.append((h, n, d, score))

        scored.sort(key=lambda x: x[3], reverse=True)
        return [
            {
                "handle": h,
                "name": n,
                "score": round(score, 4),
                "km": d.get("km") if isinstance(d.get("km"), (int, float)) else None,
                "days": _blocks(d.get("typical_availability"))[0],
                "reasons": _reasons(my_data, d),
                "persona": d.get("persona_label"),
                "tastes": [*(d.get("cuisines") or []), *(d.get("vibe") or [])],
                "says": _pitch(my_data, d),
            }
            for h, n, d, score in scored[:limit]
        ]
    finally:
        conn.close()
