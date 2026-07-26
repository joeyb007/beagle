# Beagle — Branch A: Agent Core & Orchestration

**Branch:** `feat/agent-core` · **Owner role:** the spine (suggest: strongest systems person)
**Mission:** the state machine that turns "Hey Beagle" into a locked plan, plus the Merge routing layer and venue search.

---

## Shared model (read once — same in all four docs)

- **Three processes, one SQLite file.** The **agent** (this branch + B + D, one **Python/FastAPI** project at repo root) is a long-running process. B additionally runs a thin **Node sidecar** (`sidecar/`) wrapping Photon's TS-only SDK. The **web app** (C, a separate Next.js project in `web/`) shares state via `data.sqlite`. The seam to C is the DB schema (`schema.sql`); the seam *inside* the agent is `src/contracts.py` (typed ports as `Protocol` classes + pydantic models).
- **`contracts.py` is FROZEN after hour 0.** If you must change it, announce it — it's the one file that can break everyone.
- **Own only your directories.** Disjoint paths = no merge conflicts.
- **You consume via interfaces + stubs.** Never import another person's concrete class on your branch; import the *interface* from `contracts.py` and a local stub. Consolidation swaps stubs for real impls in `wiring.py`.

---

## Phase 0 — you own the skeleton (do this BEFORE anyone branches)

Commit to `main`, then everyone branches from it:

```
beagle/
  pyproject.toml      # seed ALL agent deps now (below)
  schema.sql          # shared SQLite tables: profiles, imports, oauth_tokens, artifacts, matches, routing_log
  src/
    contracts.py      # canonical ports (frozen): Protocols + pydantic models
    wiring.py         # EMPTY stub — only consolidation fills this
    main.py           # FastAPI app; startup task runs the agent loop
    agent/            # YOU
    imessage/         # B (Python adapter side)
    data/             # D
  sidecar/            # B (Node mini-project wrapping Photon's TS SDK; own package.json)
  web/                # C (separate Next.js project, its own package.json)
  .gitignore          # data.sqlite, node_modules, .venv, .env
```

Seed `pyproject.toml` deps so nobody else edits it: `fastapi`, `uvicorn`, `pydantic`, `httpx`, `websockets`, `openai` (Merge = OpenAI-compatible base-URL swap), `python-dotenv`. D's ML deps (`sentence-transformers`/CLIP, `spotipy`, `google-api-python-client`, `sqlite-vec`) go in now too — one `pip install`, no later edits. (B/D/C add nothing to `pyproject.toml` after hour 0; the sidecar's `package.json` is B's alone.)

---

## Owned paths
`src/agent/**`, `src/contracts.py`, `src/wiring.py` (empty only), `src/main.py`, `pyproject.toml`, `schema.sql`.

## Contracts you IMPLEMENT (put concrete classes in `src/agent/`)

```python
LLMTier = Literal['cheap', 'frontier']

class LLMRouter(Protocol):                   # Merge Gateway
    async def complete(self, *, tier: LLMTier, input: str, system: str | None = None) -> str: ...

class VenueSearch(Protocol):                 # web search
    async def find(self, query: str, near: str) -> list[Candidate]: ...
```
Plus the **Orchestrator**, constructed via dependency injection:
```python
Orchestrator(messaging=..., llm=..., profiles=..., refresher=..., voice=...,
             calendar=..., music=..., matching=..., venues=..., artifacts=...)
```
`src/main.py` is a FastAPI app whose startup task constructs the Orchestrator (from `wiring.py`) and starts the inbound listener as a background task — FastAPI hosts the loop and any utility endpoints (health, manual triggers).

## Contracts you CONSUME (import interface, build a stub in `src/agent/stubs/`)
`MessagingPort` (B), `ProfileStore` (D), `VoiceProvider` (D), `CalendarProvider` (D), `MusicProvider` (D), `MatchingService` (D), `ProfileRefresher` (D). Stub each: e.g. `StubMessaging.send_text` logs to console; `StubProfileStore` returns two hard-coded profiles.

**Artifacts are NOT a cross-project import.** C is a separate Next.js project — the agent never imports from `web/`. You implement your own thin `SqliteArtifactStore` in `src/agent/` that writes the `artifacts` row at plan-lock; C's web pages read/write the same table. The `ArtifactStore` interface stays in `contracts.py`, but both sides implement the same shape independently against the shared DB (C's web-side copy is TS).

---

## Tasks

- [ ] **T1. `MergeRouter` (implements `LLMRouter`)** — route through Gateway (OpenAI-compatible client with Merge's base URL); `cheap` → small model, `frontier` → strong model; fallback on error. **Log every call** (`{model, tier, cost_estimate, latency_ms, ts}`) to the `routing_log` table — you are the sole producer; C renders it as the Merge dashboard. *(FR31–33)*
- [ ] **T2. `WebVenueSearch` (implements `VenueSearch`)** — web search → 2–3 `Candidate`s near a location. *(FR5)*
- [ ] **T3. Session state machine** — states: `intake → fanout → collect → reconcile → vote → lock → confirm`. Hold `Session` in memory keyed by `sessionId`. *(FR1)*
- [ ] **T4. Invoke** — regex on inbound group messages (`hey\s+beagle`, case-insensitive); spawn a session. *(FR1)*
- [ ] **T5. Ordered fan-out** — sort members by `constraintScore` desc; message the most-constrained first via `messaging.open_direct` + `set_typing` + a profile-personalized, voice-styled ask. **Hybrid, non-blocking:** don't wait serially — as constrained replies land, tighten questions to the not-yet-answered. *(FR2, FR3, §9)*
- [ ] **T6. Collect** — subscribe `messaging.on_inbound`; parse each reply via `llm.complete(tier='cheap')` into `MemberState`; proceed on quorum + timeout. *(FR4)*
- [ ] **T7. Reconcile** — deterministic: intersect availability (calendar as prior via `calendar.free_busy`), overlap prefs, honor hard-nos; call `venues.find`; on conflict, one `frontier` compromise call. *(FR5)*
- [ ] **T8. Vote** — `messaging.create_poll` with candidates; subscribe `messaging.on_poll_vote`; tally. *(FR6)*
- [ ] **T9. Lock + confirm** — pick winner → `FinalPlan`; `messaging.send_card` to the group; `artifacts.create(plan, playlist)` via **your** `SqliteArtifactStore` (playlist via `music.blend_playlist`). *(FR7, FR8)*
- [ ] **T10. Fail closed** — any step errors → abort with a friendly message. *(FR9)*
- [ ] **T11. Match card** — after confirm, call `matching.match_nearby` and `messaging.send_card` a top-match card ("someone nearby you'd click with") to the group chat. *(FR29)*
- [ ] **T12. Batch profile refresh** — at plan-lock, pass the session's collected member replies to `refresher.refresh(...)` (D's `ProfileRefresher`). Fire-and-forget; never blocks confirm. *(FR13)*
- [ ] **T13. (stretch, with B)** — generative mini-app tool: generate component in sandbox, self-correct via vision, deliver as Photon mini-app card. Strictly last; never blocks. *(FR34)*

## Acceptance (branch green in isolation)
A test harness (`src/agent/harness.py`) runs the **entire loop against stubs**: fake inbound "Hey Beagle" → stub DMs logged → stub replies injected → reconcile picks a stub venue → stub poll resolved → `FinalPlan` printed and stub artifact created. No real network needed.

## Consolidation seam
In `wiring.py`: import B's `PhotonMessaging` (Python adapter — the Node sidecar is started alongside, see B's doc), D's `SqliteProfileStore / VoiceProvider / CalendarProvider / MusicProvider / MatchingService / ProfileRefresher`, your `MergeRouter` + `WebVenueSearch` + `SqliteArtifactStore`; construct `Orchestrator`; `main.py` starts the inbound listener on FastAPI startup. That's the whole glue for the agent process. (Nothing is imported from `web/` — C shares state only via the SQLite file.)

## Conflict rules
Freeze `contracts.py` after hour 0. Never put logic in `wiring.py` before consolidation. Don't touch `src/imessage`, `src/data`, `sidecar/`, or `web/`.