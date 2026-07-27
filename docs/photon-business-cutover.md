# Photon Business cutover runbook

The code already auto-detects the token type (`cloud.issueImessageTokens` →
`"shared" | "dedicated"`). Upgrading the project flips everything on with zero
code changes. Verified 2026-07-26 via `sidecar/src/probe-group.ts`.

## 1. Purchase (human step)
photon.codes dashboard → project → **Business** ($250/line/mo, dedicated number).

## 2. Verify the flip (2 min)
```bash
cd sidecar && npx tsx src/probe-group.ts
```
- `token type: dedicated` → the line is live.
- `GROUP CREATED: {...guid...}` → full group API confirmed. (This texts the
  crew an opening message — heads up.)

## 3. Cut the flags over (.env)
```bash
BEAGLE_DEN_MODE=0        # real group threads again — den mode stays as fallback
BEAGLE_POLL_MODE=native  # try native polls on the dedicated line; if votes
                         # don't arrive within a minute of testing, revert to
                         # text (the shared-line failure may have been tier-gated)
```
Restart the agent after the change.

## 4. Re-verify live (10 min)
1. Everyone texts the NEW dedicated number once (fresh opt-in on a new line).
2. Per-person smoke: `.venv/bin/python -m src.imessage.smoke +1…`
3. Group e2e: create the group (or let Beagle create it — allowed now),
   "hey beagle plan dinner", full loop: asks → poll (native!) → vote →
   confetti + **group rename** (works now) + .ics.
4. Link the group: `UPDATE groups SET chat_id = '<space id from log>' WHERE id = 1;`

## 5. What lights up beyond parity
- `im.space.create(users[])` — Beagle can CREATE group chats ("hey beagle,
  get the gang together" onboarding motion).
- Group renames + chat backgrounds land in real threads.
- Native poll UI instead of numbered-text votes (pending step 3 verification).
- 50 cold-outreach contacts/day — warm intros no longer need prior opt-in
  from the match (revisit BEAGLE_INTRO_TARGET demo override; real matches can
  receive intros directly).
