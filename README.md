# Beagle

The friend who knows your group — and helps it grow. iMessage-native hangout
planning agent. YC Startup School Hackathon build.

## Start here

1. Read `docs/prd.md` (10 min), then **your** branch doc:
   - A — agent core: `docs/branch-a.md`
   - B — Photon/iMessage (+ Node sidecar): `docs/branch-b.md`
   - C — web app: `docs/branch-c.md`
   - D — data & intelligence: `docs/branch-d.md`
2. Review the two frozen seams: `src/contracts.py` and `schema.sql`.
   Objections in the first 20 minutes — after that they're **FROZEN**.
3. Branch from `main` (`feat/agent-core`, `feat/imessage`, `feat/web`,
   `feat/data`) and stay inside your owned paths. Green = your branch's
   acceptance harness passes in isolation.

## Layout

```
pyproject.toml   agent deps (frozen after hour 0 — A owns)
schema.sql       shared SQLite tables (frozen — A owns)
src/contracts.py typed ports + models (frozen — A owns)
src/agent/       A    src/imessage/  B    src/data/  D
sidecar/         B (Node wrapper for Photon's TS-only SDK)
web/             C (separate Next.js project)
```

## Setup

```
python3 -m venv .venv && source .venv/bin/activate && pip install -e .
sqlite3 data.sqlite < schema.sql
cp .env.example .env   # fill in tokens as you get them
```

## Env (fill as credentials land)

```
IMESSAGE_TOKEN=        IMESSAGE_ADDRESS=      # B — Photon line (hour 0!)
ANTHROPIC_API_KEY=                            # A — Anthropic API (LLM routing)
SPOTIFY_CLIENT_ID=     SPOTIFY_CLIENT_SECRET= # C/D
GOOGLE_CLIENT_ID=      GOOGLE_CLIENT_SECRET=  # C/D
```
