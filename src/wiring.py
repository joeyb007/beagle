"""Consolidation wiring (filled at merge — docs/branch-a.md).

Constructs the real implementations from all four branches and injects them
into the Orchestrator. Degrades gracefully so the product runs end-to-end
tonight with zero external credentials:

  - no ANTHROPIC_API_KEY → DemoLLM (deterministic local "model", still logs
                          routing_log rows so the dashboard renders)
  - no IMESSAGE_TOKEN  → sidecar boots in fake-Photon mode automatically
  - no Spotify/Google  → D's providers fall back to distilled-profile taste
                          and "no known busy times"
"""

import json
import os
import re
import time
from pathlib import Path

from src.agent.anthropic_router import AnthropicRouter
from src.agent.artifact_store import SqliteArtifactStore
from src.agent.logging_messaging import LoggingMessaging
from src.agent.orchestrator import Orchestrator
from src.agent.venues import WebVenueSearch
from src.contracts import LLMTier
from src.data import (
    EmbeddingBuilder,
    GoogleCalendarProvider,
    SqliteContextUpdater,
    SqliteMatchingService,
    SqliteMessageLog,
    SqliteMusicProvider,
    SqliteProfileStore,
    SqliteVoiceProvider,
)
from src.data.db import init_db
from src.data.stubs.llm import StubLLMRouter
from src.imessage.photon_messaging import PhotonMessaging

REPO_ROOT = Path(__file__).resolve().parents[1]

_DEMO_VENUES = json.dumps(
    [
        {"name": "Tacos El Rey", "area": "Mission", "url": None, "note": "cheap, open late"},
        {"name": "Ebisu Sushi", "area": "Inner Sunset", "url": None, "note": "counter seats"},
    ]
)

_FOOD_WORDS = ["sushi", "tacos", "thai", "korean", "pizza", "ramen", "bbq", "dim sum"]


class DemoLLM:
    """Deterministic stand-in for AnthropicRouter when ANTHROPIC_API_KEY is absent.

    Handles the two structured prompts the orchestrator depends on (reply
    parsing, venue search) and delegates everything text-shaped (asks, voice,
    distillation) to D's prompt-aware StubLLMRouter. Logs to routing_log so
    the routing dashboard renders during credential-less runs.
    """

    def __init__(self, db_path: str):
        self._db_path = db_path
        self._delegate = StubLLMRouter()

    async def complete(self, *, tier: LLMTier, input: str, system: str | None = None) -> str:
        start = time.monotonic()
        if '"is_complete"' in input:  # DM turn (turns.TURN_PROMPT)
            out = self._turn(input)
        elif '"kind"' in input:  # group reaction classify (turns.CLASSIFY_PROMPT)
            out = self._classify(input)
        elif "proposing" in input:  # group proposal draft (turns.PROPOSAL_PROMPT)
            out = self._proposal(input)
        elif "friendly 1-on-1 iMessage" in input:  # DM opening ask
            out = self._ask(input)
        elif "heads-up nudge" in input:  # cross-member tighten
            out = self._nudge(input)
        elif "JSON array" in input and "venues" in input.lower():
            out = _DEMO_VENUES
        else:  # voice style + context-update distills land on the prompt-aware stub
            out = await self._delegate.complete(tier=tier, input=input, system=system)
        self._log(tier, int((time.monotonic() - start) * 1000))
        return out

    _DAY_RE = re.compile(
        r"\b(mon|tues|wednes|thurs|fri|satur|sun)day\b|\b(sat|sun|fri)\b"
        r"|\b(tonight|tomorrow|weekend|free|whenever|anytime)\b"
    )

    def _turn(self, prompt: str) -> str:
        window = re.search(r"within (\S+) \.\. (\S+)\.", prompt)
        them = re.findall(r"^\[them\]: (.*)$", prompt, re.MULTILINE)
        text = (them[-1] if them else "").lower()
        prefs = [w for w in _FOOD_WORDS if w in text and f"no {w}" not in text]
        hard_nos = [f"no {n}" for n in re.findall(r"no (\w+)", text)]
        if self._DAY_RE.search(text) and window:
            return json.dumps(
                {
                    "availability": [{"start": window.group(1), "end": window.group(2)}],
                    "prefs": prefs,
                    "hard_nos": hard_nos,
                    "is_complete": True,
                    "reply_text": "",
                }
            )
        return json.dumps(
            {
                "availability": [],
                "prefs": prefs,
                "hard_nos": hard_nos,
                "is_complete": False,
                "reply_text": "what day works and what are you feeling food-wise?",
            }
        )

    def _classify(self, prompt: str) -> str:
        m = re.search(r'replied: "(.*)"', prompt)
        text = (m.group(1) if m else "").lower()
        empty = {"availability": [], "prefs": [], "hard_nos": []}
        if re.search(r"\b(can'?t|cannot|actually|instead)\b", text):
            return json.dumps(
                {
                    "kind": "objection",
                    **empty,
                    "hard_nos": [f"no {n}" for n in re.findall(r"no (\w+)", text)],
                    "reply_text": "got it — adjusting",
                }
            )
        if re.search(r"\b(works|down|in|yes|yep|sure|sounds)\b", text) or "👍" in text:
            return json.dumps({"kind": "assent", **empty, "reply_text": None})
        return json.dumps({"kind": "chatter", **empty, "reply_text": None})

    def _proposal(self, prompt: str) -> str:
        m = re.search(r"proposing (.+?) at (.+?) for ", prompt)
        venue, when = (m.group(1), m.group(2)) if m else ("the spot", "soon")
        return f"ok crew — {venue.lower()}, {when.lower()}? say the word and i'll lock it 🐶"

    def _ask(self, prompt: str) -> str:
        m = re.search(r"asking (\w+)", prompt)
        name = (m.group(1) if m else "you").lower()
        return f"yo {name} — what day works this week and what are you feeling food-wise?"

    def _nudge(self, prompt: str) -> str:
        m = re.search(r'(\S+) just said "(.*)" about the plan', prompt, re.DOTALL)
        name, text = (m.group(1), m.group(2)) if m else ("someone", "their plans")
        return f'heads up — {name} said "{text}". does that work for you?'

    def _log(self, tier: str, latency_ms: int) -> None:
        import sqlite3

        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                "INSERT INTO routing_log (model, tier, latency_ms) VALUES (?, ?, ?)",
                ("local/demo-deterministic", tier, latency_ms),
            )


def build_orchestrator() -> tuple[Orchestrator, PhotonMessaging]:
    db_path = os.environ.get("DATABASE_PATH", str(REPO_ROOT / "data.sqlite"))
    init_db(db_path)

    if os.environ.get("ANTHROPIC_API_KEY"):
        llm = AnthropicRouter(db_path=db_path)
    else:
        print("[wiring] ANTHROPIC_API_KEY not set — using DemoLLM (deterministic, offline)")
        llm = DemoLLM(db_path)

    raw_messaging = PhotonMessaging()  # sidecar self-selects real vs fake via IMESSAGE_TOKEN
    store = SqliteProfileStore(db_path)
    music = SqliteMusicProvider(db_path)
    embedder = EmbeddingBuilder(music)
    log = SqliteMessageLog(db_path)
    messaging = LoggingMessaging(raw_messaging, log)

    orchestrator = Orchestrator(
        messaging=messaging,
        llm=llm,
        profiles=store,
        context=SqliteContextUpdater(llm, store, embedder, log),
        message_log=log,
        voice=SqliteVoiceProvider(llm, db_path),
        calendar=GoogleCalendarProvider(db_path),
        music=music,
        matching=SqliteMatchingService(store, db_path),
        venues=WebVenueSearch(llm),
        artifacts=SqliteArtifactStore(db_path),
        near=os.environ.get("BEAGLE_NEAR", "San Francisco"),
        reply_timeout_s=float(os.environ.get("REPLY_TIMEOUT_S", "180")),
        propose_timeout_s=float(os.environ.get("PROPOSE_TIMEOUT_S", "90")),
    )
    # main.py drives sidecar lifecycle on the raw adapter (ensure_running/close)
    return orchestrator, raw_messaging
