# Beagle — Branch C: Web App (Operator Console)

**Branch:** `feat/web` · **Owner role:** everything the eye sees on the web
**Mission:** the operator console — onboarding, editable profiles, the **memory artifact** (the demo's peak), the Merge dashboard view, and the matching UI. Plus the Spotify/Google OAuth handshakes.

---

## Shared model (same in all four docs)
Three processes, one SQLite file. The agent (A+B+D) is a **Python/FastAPI** project (plus B's Node sidecar for Photon — invisible to you). You are a **separate Next.js project** in `web/` with its own `package.json`. The agent is Python, so code sharing isn't even possible — your seam to the rest of the system is the **shared SQLite DB** (`schema.sql`, frozen at hour 0; SQLite is language-neutral, which is exactly why this seam works). You read/write the same tables the agent reads/writes. Branch from the hour-0 `main`.

---

## Owned paths
`web/**` only (its own npm project). You also *read* `schema.sql` (frozen) but don't edit it.

## The DB seam (how you talk to everything else)
`schema.sql` (committed hour 0) defines shared tables. You read/write these directly with `better-sqlite3`:
- `profiles` — you **render + edit** these (D writes them from distillation; you let users correct them). *(FR14)*
- `imports` — you **write** raw pasted/imported chat text here from onboarding; D reads it and runs distillation. This is how the web "kicks off" distillation without a cross-process call. *(FR10)*
- `oauth_tokens` — you **write** Spotify/Google tokens after the handshake; D **reads** them to pull data. *(FR20, FR22)*
- `artifacts` — the **agent writes** the row at plan-lock (A's own store); you **read** it and **write** photos/keepsake updates. *(FR17–19)*
- `matches` — you **read** ranked matches D computes; render them. *(FR29)*
- `routing_log` — you **read** Merge routing records to render the dashboard (A's `MergeRouter` is the sole writer). *(FR33)*

While D isn't ready, seed these tables with mock rows so every screen renders. That's your independence.

## Contract you IMPLEMENT (`web/lib/artifact-store.ts`, backed by SQLite)
```ts
export interface ArtifactStore {                 // web-side reader/writer of the artifacts table
  create(plan: FinalPlan, playlist: Track[]): Promise<HangoutArtifact>;
  get(planId: string): Promise<HangoutArtifact | null>;
  addPhotos(planId: string, urls: string[]): Promise<void>;
}
```
**The agent never imports this class** (it's Python — this TS interface exists only web-side). At plan-lock, A's own Python `SqliteArtifactStore` writes the `artifacts` row directly per `schema.sql`; your class is the web-side reader/writer of the same table (`get` + `addPhotos`, and `create` for seeding/testing). The *store* is really the shared table — both sides implement the same shape against it independently.

---

## Tasks

- [ ] **T1. App shell** — Next.js on Vercel; `better-sqlite3` reader/writer against `data.sqlite`. Use the V0/Vercel credits.
- [ ] **T2. Onboarding** — connect group, paste/import chat history → write raw text to the `imports` table (D polls/reads it and distills; no cross-process call), buttons to connect Spotify + Google. *(flow A)*
- [ ] **T3. OAuth handshakes** — Spotify (`user-top-read`) + Google (`calendar.readonly`); on callback, write tokens to `oauth_tokens`. *(FR20, FR22)* You only capture tokens; D uses them.
- [ ] **T4. Profile editor** — list `profiles`, edit any field, save. This is the trust/safety surface. *(FR14)*
- [ ] **T5. Memory artifact page (THE PEAK)** — render an artifact: plan (place/time/attendees) + blended playlist embed, and a **photo upload** that flips it to keepsake state. Make this beautiful — it's the demo climax. *(FR17–19)*
- [ ] **T6. Merge dashboard view** — render `routing_log` (A's `MergeRouter` writes a row per LLM call): per-call model, tier, cost, latency. Your Merge-prize exhibit. *(FR33)*
- [ ] **T7. Matching UI** — read `matches`, show nearby candidates (list or swipe) with persona + shared-interest reasons. Label seeded profiles as samples. *(FR29, FR30)*

## Acceptance (branch green in isolation)
`npm run dev` in `web/` renders every screen against a **seeded `data.sqlite`**: onboarding, profile editor (edits persist), a full memory artifact with playlist + working photo upload, the routing dashboard, and the matching grid. OAuth round-trips and stores a token. No dependency on the agent running.

## Consolidation seam
Point `data.sqlite` at the real file the agent uses. When the agent locks a plan, it writes an `artifacts` row → your artifact page shows a *real* hangout. When D writes real `profiles`/`matches` → your editor and matching grid show real data. Nothing to rewire beyond sharing the DB path.

## Conflict rules
Stay in `web/`. Never edit `schema.sql`, `src/**`, `sidecar/**`, or the agent's `pyproject.toml`. If you need a new shared column, request it from whoever owns `schema.sql` (A) — don't add it unilaterally.