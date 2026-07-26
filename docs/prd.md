# Beagle — Product Requirements Document

| | |
|---|---|
| **Product** | Beagle |
| **One-liner** | The friend who knows your group — and helps it grow. |
| **Status** | Build — MVP target 3:00 AM |
| **Team** | 4 engineers + Claude Code |
| **Event** | YC Startup School Hackathon ("Make It Feel Human") |
| **Prizes targeted** | Best Overall · Merge (Gateway) · Photon (iMessage) |

---

## 1. Overview

Every friend group has one person doing the invisible labor: chasing availability, picking the spot, herding the vote, remembering what everyone likes. Beagle is an AI agent that lives natively in your iMessage and *is* that friend — it plans your hangouts, learns who everyone really is, sounds like your group, turns each hangout into a keepsake, and uses the understanding it builds to introduce you to new people nearby you'd actually click with.

Beagle does not just execute a coordination workflow. It **expresses** — it knows your group and grows it. That is the product, and it is a direct answer to the competition's "express, not just execute" rubric.

---

## 2. Thesis & positioning

Beagle runs on three layers, each earning the next:

- **Utility (the wedge):** planning gets Beagle into the group chat.
- **Expression (the feel):** knowing, sounding like, and remembering the group makes it human.
- **Payoff (the vision):** the deep, multi-modal profiles that plan your hangouts become a social graph that grows your circle.

**Finding new friends is central, not an add-on.** Beagle's differentiated bet is that a coordination tool, done with real understanding of people, is the most natural on-ramp to a genuinely good friend-matching product — because the profiles are earned through real use, not filled out on a signup form.

Incumbents help *one person* plan solo (Wanderlog, etc.) or match strangers on shallow, self-reported data (dating/friend apps). Beagle owns the unclaimed middle: **multi-person coordination + earned, multi-modal profiles → matching that feels uncannily right.**

---

## 3. Goals / Non-goals

**Goals**
- Ship the full experience (plan → express → match) end-to-end by 3:00 AM.
- Win the room on one landed emotional peak (the memory artifact) and a memorable thesis.
- Qualify strongly for the Merge and Photon prizes via genuine, visible integration.

**Non-goals (tonight)**
- Production auth, error recovery, or scale hardening. **Happy path only.**
- Real matching liquidity (no real nearby strangers) — matching is demoed on a labeled seeded pool.
- Writing to users' Spotify accounts (compose-and-share only).

---

## 4. Target users

- **Primary:** 20-something friend groups who over-coordinate in iMessage and want the labor gone.
- **Secondary (matching payoff):** people new to a city / wanting to widen their circle, reached through the same profiles.

---

## 5. Prize alignment

| Prize | How Beagle qualifies |
|---|---|
| **Photon (iMessage)** | Native iMessage agent: 1-on-1 fan-out with typing indicators, native polls, rich + mini-app cards. Strongest shot. |
| **Merge (Gateway)** | All LLM calls route through Merge Gateway with an intelligent routing policy; dashboard shows per-call routing/cost/latency. *Merge is the LLM router, NOT a calendar/data source.* |
| **Best Overall** | The "express, not execute" thesis, landed on a real emotional peak, running on the team's own real group. |

---

## 6. Feature requirements

Priority key: **P0** = demo-critical · **P1** = ships tonight · **P2** = stretch.

### 6.1 Core planning loop — P0
The state machine that turns "Hey Beagle, let's hang" into a locked plan, entirely in iMessage.

**Functional requirements**
- FR1. Detect invocation on every group message via trigger regex (`Hey Beagle` / `@Beagle`); create a planning session.
- FR2. **Fan out** 1-on-1 to each member (`im.chats.create`), with `setTyping`, asking timing + preferences personalized by profile.
- FR3. **Ordered fan-out** — message the most-constrained members first (see §9).
- FR4. **Collect** replies via inbound message-event subscription; parse each into structured constraints; proceed on quorum (N of M) with timeout.
- FR5. **Reconcile** — intersect availability, overlap prefs, honor hard-nos; fetch 2–3 real venues via web search.
- FR6. **Vote** — post a native iMessage poll (`im.polls.create`); subscribe to poll events.
- FR7. **Lock** — tally votes; on threshold/timeout select winner → `FinalPlan`.
- FR8. **Confirm** — post plan to group as a rich card; persist to dashboard (seeds memory artifact).
- FR9. On failure, abort cleanly. No failure-branch UX for the demo.

### 6.2 Profiles — P0
Compact per-person profile so Beagle's first touch already feels personal.

- FR10. Build profiles from imported chat history (`imessage-exporter` / `chat.db` SQL with `attributedBody` decode) or per-person paste (fallback).
- FR11. Distill via one Merge mid-tier LLM call per person into the Profile schema (§8).
- FR12. Prompt rule: fill only supported fields; null if unknown; never invent.
- FR13. Update in **batches on invocation**, not per-message. Live replies override stale profile during the session; at plan-lock the agent hands collected replies to the distiller for a batch profile refresh (A triggers, D executes).
- FR14. Profiles editable in the web app.

### 6.3 Group voice — P0
Beagle talks in the group's cadence and inside jokes.

- FR15. Derive a style prompt from aggregated cold-start data.
- FR16. Apply as flavor to fan-out + confirmation messages only. Bounded style, not free improvisation.

### 6.4 Memory artifact — P0 (the emotional peak)
A per-hangout page that starts as the plan and becomes the memory.

- FR17. On plan lock, create a hangout page holding plan details + blended playlist.
- FR18. Support photo upload post-hangout → keepsake state.
- FR19. Lives in the web app; is the demo's climax.

### 6.5 Google Calendar — P1
Real availability as a silent prior.

- FR20. Direct Google OAuth (`calendar.readonly`) — **not** via Merge.
- FR21. Use free/busy to propose smart times; still confirm 1-on-1 over text (preserve the texting beat).

### 6.6 Blended playlist — P1
Group-blended, occasion-tuned soundtrack.

- FR22. Pull each member's top artists/genres via Spotify `user-top-read` (Dev Mode allowlist = our team).
- FR23. Merge tastes into a shared profile; tune to the planned occasion's vibe.
- FR24. **Compose** a tracklist (names + shareable link/embed); do **not** write to accounts.
- FR25. Render inside the memory artifact.

### 6.7 Friend matching — P0 (central)
Multi-modal matching that grows the group.

- FR26. Build a **multi-modal profile vector** fusing: (a) text/taste profile, (b) music vector (Spotify), (c) image embeddings (CLIP-style) from profile/hangout photos.
- FR27. Fuse modality vectors (concat or weighted blend) into one profile embedding.
- FR28. **Radius prefilter** candidates (bounding box / vector distance via `sqlite-vec` or in-process cosine — no Postgres), then cosine-rank; recommend top-k.
- FR29. Surface matches on **both** surfaces: the web-app matching view (C) and an iMessage match card the agent sends post-confirm (A via B).
- FR30. **Demo data:** seed a sample pool, narrated as samples; optionally include real teammates so a returned match is verifiable.

### 6.8 Merge Gateway routing — P0 (cross-cutting)
- FR31. Route all model calls through Merge Gateway (base-URL swap or SDK).
- FR32. Routing policy: cheap tier for distillation/parsing, frontier for negotiation/voice/personas, with fallback.
- FR33. Surface the Gateway dashboard as the Merge-prize exhibit.

### 6.9 Generative iMessage mini-apps — P2 (stretch)
- FR34. Agent tool generates a component in a sandbox, self-corrects via vision, delivers as a Photon mini-app card. Built last; never blocks the deadline.

---

## 7. User flows

**A. Onboarding (web app)**
Connect group → import/paste chat history → (optional) connect Spotify & Google Calendar → Beagle distills profiles → user reviews/edits.

**B. Plan a hangout (iMessage)**
"Hey Beagle…" → ordered 1-on-1 fan-out → collect constraints → reconcile + venue candidates → group poll → lock → confirm card → memory artifact created.

**C. Remember (web app)**
Open hangout artifact → view plan + playlist → add photos post-event → keepsake.

**D. Grow the group (matching)**
From profiles → multi-modal embed → radius prefilter → cosine rank → recommend nearby matches (iMessage card / web view).

---

## 8. Data models

```
Profile {
  name, handle,               // handle = E.164/email, REQUIRED for fan-out
  cuisines[], priceBand,
  vibe[], hardNos[],
  typicalAvailability,
  constraintScore,            // derived: how hard to satisfy (drives fan-out order)
  personaLabel, notes,
  musicVector?, imageVector?, // modality embeddings for matching
  profileVector?              // fused multi-modal embedding
}

Session {
  sessionId, occasion, dateWindow,
  members[], memberStates{ handle -> {availability, prefs, hardNos, replied} },
  candidates[], poll, finalPlan
}

HangoutArtifact {
  planId, place, time, attendees[],
  playlist[], photos[], createdAt
}
```

---

## 9. Fan-out ordering logic

Beagle does **not** fan out uniformly. It sorts members by `constraintScore` (derived from `hardNos` + `typicalAvailability` + a picky/flexible read) and messages the **most-constrained first**, because their answers prune the solution space most.

**Hybrid, not strictly sequential:** send to constrained members first but do **not** block all others waiting on them. As each constrained reply lands, tighten the questions to whoever hasn't answered ("Rayhan can only do Saturday — does Saturday work?"). This gets the pruning benefit without a serialized fan-out that visibly stalls on camera.

---

## 10. System architecture & integrations

- **Runtime:** Python / **FastAPI** backend — the agent (A+B+D) is one Python project at repo root. Frontend (C) is Next.js in `web/`.
- **iMessage:** Photon `advanced-imessage`. The SDK is **TS-only**, so B owns a thin **Node sidecar** that wraps it and bridges to Python over loopback (HTTP + WebSocket for event streams). The agent only ever sees B's Python `MessagingPort` adapter.
- **LLM:** Merge Gateway (routing policy).
- **Venues:** web search (no OSM/Overpass).
- **Availability:** Google Calendar OAuth (`calendar.readonly`).
- **Music:** Spotify Web API (`user-top-read`).
- **Matching:** `sqlite-vec` or in-process cosine over the seeded pool (single SQLite file — no Postgres); CLIP-style image embeddings; fused profile vectors.
- **Web app:** Next.js on Vercel (operator console: onboarding, profile editor, artifacts, Merge dashboard, matching UI).
- **Store:** SQLite / in-memory for profiles + sessions. SQLite is the language-neutral seam between the Python backend and the Next.js web app.

---

## 11. Non-functional requirements & constraints

- Happy path only; clean abort on failure.
- Demo runs on the team's real group.
- **Insurance:** pre-run and record the full demo; commit `profiles.json`. No live prompt (Full Disk Access, poll lag, network) can break the 90 seconds.
- All seeded data (matching pool) narrated as samples.

---

## 12. Success metrics

- End-to-end plan completes live in iMessage in under ~90s.
- Memory-artifact reveal lands as the demo's peak.
- Merge dashboard visibly shows multi-model routing.
- Judges can restate the thesis unprompted ("the friend who knows your group and grows it").

---

## 13. Team split & interface contracts

| Owner | Scope |
|---|---|
| **A — Agent core** | State machine, invoke/regex, fan-out (+ordering), reconcile, LLM loop, Merge routing. |
| **B — Photon/iMessage** | Line setup (first!), chats, typing, message events, polls, cards. |
| **C — Web app** | Next.js/Vercel: onboarding, profile editor, memory artifact (+photos), Merge dashboard, matching UI. |
| **D — Data & intelligence** | Profile distillation, group voice, Spotify blend, Calendar OAuth, matching embeddings + vector search. |

**Contracts to lock in first 20 min:** Profile schema · Session state · message-event boundary (`on_inbound` / `send_text`) · Merge routing config · sidecar↔Python bridge shape (B's internal detail, but the port names freeze with `contracts.py`).

---

## 14. Build milestones

1. **Hour 0 (parallel):** B provisions Photon line + numbers (+ sidecar hello-world); A commits skeleton (`schema.sql` + `contracts.py`, with D's profile fields and C's table needs reviewed in); C scaffolds Next app; D starts the profile pipeline.
2. **Loop lives:** A+B — invoke → fan-out → poll → confirm on real numbers. *Always-have-a-demo point.*
3. **Feels human:** D profiles + group voice into fan-out.
4. **Peak:** C+D memory artifact + playlist.
5. **Grounding + payoff:** Calendar (D); matching pipeline + UI (D→C).
6. **Stretch:** mini-apps (A+B).

---

## 15. Demo script (90s, real group)

1. **Thesis, out loud:** "Beagle is the friend who knows your group — and helps it grow."
2. **Prove utility+expression:** "Hey Beagle, let's hang this weekend" → ordered DMs (typing bubbles, group voice) → real poll → locked plan.
3. **Peak:** reveal the memory artifact — plan-turned-keepsake + blended playlist.
4. **Payoff/vision:** matching flash — nearby people you'd click with, from multi-modal profiles (narrated as sample data).

---

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Full scope by 3 AM | Dependency-ordered build; every milestone is a complete demo. |
| Photon line setup is the long pole | Build it first, hour 0. |
| Matching is central but runs on fake strangers | Keep the *emotional* peak on the real memory artifact; matching is the *vision* peak, narrated as samples. |
| Live demo failure | Pre-recorded backup; committed profiles. |
| Voice/mini-apps go off-script | Bound the voice to flavor; mini-apps strictly last. |

---

## 17. Open questions

- ~~Matching surface~~ — **Resolved: both.** Web matching view (C) + post-confirm iMessage match card (A via B).
- Image embeddings: which photos feed the CLIP vector, and are they available/consented for the team pool?
- Weighting of text vs. music vs. image in the fused profile vector.
- Group-native thread vs. hub-and-spoke DMs for the live poll step.