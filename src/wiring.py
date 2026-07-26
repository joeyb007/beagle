"""Consolidation wiring (filled at merge — docs/branch-a.md).

Constructs the real implementations from all four branches and injects them
into the Orchestrator. Degrades gracefully so the product runs end-to-end
tonight with zero external credentials:

  - no MERGE_API_KEY   → DemoLLM (deterministic local "model", still logs
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

from dotenv import load_dotenv

load_dotenv()  # .env at repo root — covers main.py and e2e.py via import

from src.agent.artifact_store import SqliteArtifactStore
from src.agent.merge_router import MergeRouter
from src.agent.orchestrator import Orchestrator
from src.agent.venues import WebVenueSearch
from src.contracts import LLMTier
from src.data import (
    Distiller,
    EmbeddingBuilder,
    GoogleCalendarProvider,
    SqliteMatchingService,
    SqliteMusicProvider,
    SqliteProfileRefresher,
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
    """Deterministic stand-in for MergeRouter when MERGE_API_KEY is absent.

    Handles the two structured prompts the orchestrator depends on (reply
    parsing, venue search) and delegates everything text-shaped (asks, voice,
    distillation) to D's prompt-aware StubLLMRouter. Logs to routing_log so
    the Merge dashboard renders during credential-less runs.
    """

    def __init__(self, db_path: str):
        self._db_path = db_path
        self._delegate = StubLLMRouter()

    async def complete(self, *, tier: LLMTier, input: str, system: str | None = None) -> str:
        start = time.monotonic()
        if "exactly these keys" in input and '"availability"' in input:
            out = self._parse_reply(input)
        elif "JSON array" in input and "venues" in input.lower():
            out = _DEMO_VENUES
        else:
            out = await self._delegate.complete(tier=tier, input=input, system=system)
        self._log(tier, int((time.monotonic() - start) * 1000))
        return out

    def _parse_reply(self, prompt: str) -> str:
        window = re.search(r"within (\S+) \.\. (\S+)\.", prompt)
        text_m = re.search(r'Reply text: "(.*)"\. JSON only', prompt, re.DOTALL)
        text = (text_m.group(1) if text_m else "").lower()
        prefs = [w for w in _FOOD_WORDS if w in text and f"no {w}" not in text]
        hard_nos = re.findall(r"no (\w+)", text)
        start, end = (window.group(1), window.group(2)) if window else ("", "")
        return json.dumps(
            {
                "availability": [{"start": start, "end": end}],
                "prefs": prefs,
                "hard_nos": [n for n in hard_nos if n not in _FOOD_WORDS or f"no {n}" in text],
            }
        )

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

    if os.environ.get("MERGE_API_KEY"):
        llm = MergeRouter(db_path=db_path)
    else:
        print("[wiring] MERGE_API_KEY not set — using DemoLLM (deterministic, offline)")
        llm = DemoLLM(db_path)

    messaging = PhotonMessaging()  # sidecar self-selects real vs fake via IMESSAGE_TOKEN
    store = SqliteProfileStore(db_path)
    music = SqliteMusicProvider(db_path)
    embedder = EmbeddingBuilder(music)
    distiller = Distiller(llm)

    orchestrator = Orchestrator(
        messaging=messaging,
        llm=llm,
        profiles=store,
        refresher=SqliteProfileRefresher(distiller, store, embedder),
        voice=SqliteVoiceProvider(llm, db_path),
        calendar=GoogleCalendarProvider(db_path),
        music=music,
        matching=SqliteMatchingService(store, db_path),
        venues=WebVenueSearch(llm),
        artifacts=SqliteArtifactStore(db_path),
        near=os.environ.get("BEAGLE_NEAR", "San Francisco"),
        reply_timeout_s=float(os.environ.get("REPLY_TIMEOUT_S", "180")),
        vote_timeout_s=float(os.environ.get("VOTE_TIMEOUT_S", "90")),
    )
    return orchestrator, messaging
