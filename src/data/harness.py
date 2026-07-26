"""Branch D acceptance harness — runs the whole data pipeline offline against a
StubLLMRouter and sample inputs, persisting everything to `data.sqlite`.

Flow (mirrors docs/branch-d.md "Acceptance"):
    seed imports  ->  distill N Profiles (constraint_score + fused vectors)
    ->  blend_playlist  ->  match_nearby over the seeded pool
    ->  refresh a profile from sample replies  ->  VoiceProvider.style()

Green = every stage produces output and the assertions at the end hold.
Run:  python -m src.data.harness      (from repo root, venv active)
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from ..contracts import Reply
from .db import DEFAULT_DB, connect, init_db
from .distiller import Distiller
from .embeddings import PROFILE_DIM, EmbeddingBuilder
from .importer import read_imports
from .matching import SqliteMatchingService
from .music import SqliteMusicProvider
from .refresh import SqliteProfileRefresher
from .seed import SAMPLE_CHAT, SAMPLE_REPLIES
from .store import SqliteProfileStore
from .stubs.llm import StubLLMRouter
from .voice import SqliteVoiceProvider

RULE = "=" * 68


def _hdr(title: str) -> None:
    print(f"\n{RULE}\n{title}\n{RULE}")


def _reset_and_seed(db_path) -> None:
    """Clean D's tables and seed the sample chat into `imports` (as C would)."""
    conn = connect(db_path)
    try:
        conn.execute("DELETE FROM matches")
        conn.execute("DELETE FROM profiles")
        conn.execute("DELETE FROM imports")
        conn.execute("INSERT INTO imports (raw_text, status) VALUES (?, 'pending')",
                     (SAMPLE_CHAT,))
        conn.commit()
    finally:
        conn.close()


async def run(db_path, occasion: str, target: str, radius_km: float, k: int) -> None:
    init_db(db_path)
    _reset_and_seed(db_path)

    llm = StubLLMRouter()
    store = SqliteProfileStore(db_path)
    music = SqliteMusicProvider(db_path)
    embedder = EmbeddingBuilder(music=music)
    distiller = Distiller(llm)
    voice = SqliteVoiceProvider(llm, db_path)
    matching = SqliteMatchingService(store, db_path)
    refresher = SqliteProfileRefresher(distiller, store, embedder)

    # --- 1. import + distill + embed + store --------------------------------
    _hdr("1. IMPORT → DISTILL → EMBED  (profiles, constraint_score, vectors)")
    people = read_imports(db_path)
    for person in people:
        profile = await distiller.distill(person)
        await embedder.build(profile)          # music_vector + fused profile_vector
        await store.upsert(profile)
    print(f"imported {len(people)} people from `imports`, wrote {len(people)} profiles\n")

    ranked = await store.list()                # ORDER BY constraint_score DESC
    print("fan-out order (most-constrained first, PRD §9):")
    for i, p in enumerate(ranked, 1):
        dim = len(p.profile_vector or [])
        print(f"  {i}. {p.name:<7} score={p.constraint_score:<5} "
              f"[{p.persona_label}]  vec={dim}d")
        print(f"       cuisines={p.cuisines} vibe={p.vibe}")
        print(f"       hard_nos={p.hard_nos} avail={p.typical_availability!r} price={p.price_band}")

    # --- 2. blended playlist -------------------------------------------------
    _hdr(f"2. BLENDED PLAYLIST  (occasion={occasion!r})")
    handles = [p.handle for p in ranked]
    playlist = await music.blend_playlist(handles, occasion)
    for t in playlist:
        print(f"  ♪ {t.title} — {t.artist}")

    # --- 3. matching over the seeded pool -----------------------------------
    _hdr(f"3. MATCH_NEARBY  (for {target}, radius={radius_km}km, k={k})")
    me = await store.get(target)
    print(f"querying as {me.name} [{me.persona_label}]  cuisines={me.cuisines} vibe={me.vibe}")
    n_in_radius = sum(1 for p in matching._pool if p["dist"] <= radius_km)
    print(f"pool={len(matching._pool)} · within {radius_km}km={n_in_radius} "
          f"(farther candidates prefiltered out)\n")
    matches = await matching.match_nearby(target, radius_km, k)
    for m in matches:
        print(f"  ★ {m.match_name}  (score={m.score})  [sample]")
        for r in m.reasons:
            print(f"       – {r}")

    # --- 4. batch profile refresh at plan-lock ------------------------------
    _hdr("4. PROFILE REFRESH  (batch, from session replies)")
    refreshed_handle = SAMPLE_REPLIES[0]["handle"]
    before = await store.get(refreshed_handle)
    print(f"before  {before.name}: cuisines={before.cuisines} "
          f"avail={before.typical_availability!r} score={before.constraint_score}")
    await refresher.refresh([Reply(**r) for r in SAMPLE_REPLIES])
    after = await store.get(refreshed_handle)
    print(f"after   {after.name}: cuisines={after.cuisines} "
          f"avail={after.typical_availability!r} score={after.constraint_score}")

    # --- 5. group voice ------------------------------------------------------
    _hdr("5. GROUP VOICE  (flavor-only system prompt)")
    style = await voice.style()
    print(style)

    # --- persistence + assertions -------------------------------------------
    _hdr("PERSISTED TO data.sqlite")
    conn = connect(db_path)
    try:
        n_profiles = conn.execute("SELECT COUNT(*) c FROM profiles").fetchone()["c"]
        n_matches = conn.execute("SELECT COUNT(*) c FROM matches").fetchone()["c"]
    finally:
        conn.close()
    print(f"  profiles={n_profiles}  matches={n_matches}  db={db_path}")

    assert len(people) >= 4, "expected several distilled profiles"
    assert n_profiles == len(people), "all profiles must persist"
    assert all(len(p.profile_vector or []) == PROFILE_DIM for p in ranked), "vectors must be fused"
    assert ranked[0].constraint_score >= ranked[-1].constraint_score, "fan-out order must sort"
    assert len(playlist) > 0, "playlist must be composed"
    assert len(matches) > 0, "matching must return candidates"
    assert n_in_radius < len(matching._pool), "radius prefilter must exclude someone"
    assert "japanese" in after.cuisines and "japanese" not in before.cuisines, "refresh must enrich"
    assert len(style) > 0, "voice style must be non-empty"
    assert n_matches == len(matches), "matches must persist"
    print("\n✅ Branch D acceptance harness GREEN — all stages passed.")


def main() -> None:
    try:  # Windows consoles default to cp1252 — force UTF-8 for arrows/emoji
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="Beagle Branch D acceptance harness")
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--occasion", default="saturday night dinner then drinks")
    ap.add_argument("--target", default="+15551110004", help="handle to match for (Lena)")
    ap.add_argument("--radius", type=float, default=25.0)
    ap.add_argument("--k", type=int, default=3)
    args = ap.parse_args()
    asyncio.run(run(args.db, args.occasion, args.target, args.radius, args.k))


if __name__ == "__main__":
    main()
