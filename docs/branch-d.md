# Beagle — Branch D: Data & Intelligence

**Branch:** `feat/data` · **Owner role:** the "knows them" brain
**Mission:** everything that turns raw signal into understanding — profiles, group voice, the Spotify blend, calendar availability, and the multi-modal matching engine.

---

## Shared model (same in all four docs)
Three processes, one SQLite file. You're a module inside the **agent** project — a **Python/FastAPI** app at repo root (B also runs a Node sidecar for Photon; invisible to you). You implement several interfaces from the frozen `src/contracts.py`; A's Orchestrator consumes them, and the web app (C) reads your outputs via the shared SQLite tables (`schema.sql`). Python is home turf here: CLIP embeddings, vector math, `spotipy`, Google API client — all native, all pre-seeded in `pyproject.toml` by A at hour 0. Own only your directory. Branch from the hour-0 `main`.

---

## Owned paths
`src/data/**` only. You **write** the shared tables `profiles`, `matches` (and read `oauth_tokens` + `imports` that C writes) per `schema.sql`.

## Contracts you IMPLEMENT (concrete classes in `src/data/`)
```python
class ProfileStore(Protocol):
    async def get(self, handle: str) -> Profile | None: ...
    async def upsert(self, p: Profile) -> None: ...
    async def list(self) -> list[Profile]: ...

class VoiceProvider(Protocol):        # group-voice system prompt
    async def style(self) -> str: ...

class CalendarProvider(Protocol):
    async def free_busy(self, handle: str, window: Interval) -> list[Interval]: ...

class MusicProvider(Protocol):
    async def blend_playlist(self, handles: list[str], occasion: str) -> list[Track]: ...

class MatchingService(Protocol):
    async def match_nearby(self, handle: str, radius_km: float, k: int) -> list[Match]: ...

class ProfileRefresher(Protocol):     # A calls at plan-lock with the session's collected replies
    async def refresh(self, replies: list[Reply]) -> None: ...
```
`Profile`, `Interval`, `Track`, `Match`, `Reply` are pydantic models defined in `contracts.py` — reuse them, don't redefine.

## Contracts you CONSUME (import interface + stub in `src/data/stubs/`)
`LLMRouter` (A). Your distillation, voice, and reconcile-support calls all go through it. During dev, `StubLLMRouter.complete()` returns canned JSON so you're never blocked on A.

Your providers take the router by injection:
```python
Distiller(llm=llm_router)           # consolidation passes A's MergeRouter
SqliteMusicProvider(tokens_db)      # reads oauth_tokens C writes
```

---

## Tasks

- [ ] **T1. `SqliteProfileStore`** — CRUD over the `profiles` table. *(FR10)*
- [ ] **T2. Import** — read a group chat via `imessage-exporter` or `chat.db` SQL (decode `attributedBody`); or consume raw pasted text C's onboarding writes to the `imports` table (poll it or run on demand — no cross-process call). Date-range filter to keep it recent/cheap. *(FR10)*
- [ ] **T3. Distiller** — one `llm.complete(tier='cheap')` per person → `Profile`. Rule: fill only supported fields, `None` if unknown, **never invent**. Compute `constraintScore` (from `hardNos` + tight `typicalAvailability`) — A uses this to order fan-out. *(FR11–13, §9)*
- [ ] **T4. `VoiceProvider.style()`** — aggregate cold-start text → a bounded system-prompt string capturing the group's cadence/jokes. Flavor only. *(FR15–16)*
- [ ] **T5. `CalendarProvider.free_busy`** — Google Calendar API via `google-api-python-client` (`calendar.readonly`) using tokens from `oauth_tokens`; return busy/free intervals. Direct Google OAuth — **not** Merge. *(FR20–21)*
- [ ] **T6. `MusicProvider.blend_playlist`** — Spotify `user-top-read` per handle via `spotipy` (tokens from `oauth_tokens`); merge tastes; tune to `occasion`; **compose** a tracklist (`list[Track]` names + optional link). Do NOT write to Spotify accounts. Also expose the per-person taste vector for matching. *(FR22–25)*
- [ ] **T7. Multi-modal embeddings** — build a fused `profileVector` per person from: text/taste profile + music vector (T6) + image embedding (CLIP via `sentence-transformers`/`open_clip` over profile/hangout photos). Concat or weighted blend (numpy). Store on `Profile`. *(FR26–27)*
- [ ] **T8. `MatchingService.match_nearby`** — radius prefilter (bounding box / `sqlite-vec` / brute-force numpy cosine — your call, but stay inside SQLite: no Postgres), cosine-rank fused vectors, return top-k `list[Match]` with reasons. Write to `matches` for C to render; A also sends a top match as an iMessage card post-confirm. Seed a sample pool for the demo (labeled). *(FR28–30)*
- [ ] **T9. `ProfileRefresher.refresh`** — batch profile update at plan-lock: A hands you the session's collected replies; re-distill only the affected members' profiles (one `cheap` call, batched). Never invoked per-message. *(FR13)*

## Acceptance (branch green in isolation)
A CLI (`src/data/harness.py`) runs against a `StubLLMRouter` and sample inputs: imports sample chat text → writes N `Profile`s to SQLite (with `constraintScore` + fused vectors) → `blend_playlist` returns tracks → `match_nearby` returns ranked matches over the seeded pool → `refresh` updates a profile from sample replies → `VoiceProvider.style()` returns a style string. All persisted to `data.sqlite`.

## Consolidation seam
`wiring.py` (A) constructs your classes with the real `MergeRouter` injected, and points them at the shared `data.sqlite`. C reads your `profiles`/`matches` tables. Calendar/Music read the `oauth_tokens` C populated. No code changes at merge — just real router + real tokens instead of stubs.

## Conflict rules
Stay in `src/data/`. Don't edit `contracts.py` (if a Profile field is missing, request it from A). Don't touch `src/agent`, `src/imessage`, `sidecar/`, or `web/`. Coordinate any `schema.sql` column you need with A before hour 0 closes.