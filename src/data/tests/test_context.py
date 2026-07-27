"""ContextUpdater: window → per-person LLM update → merge → embed → upsert → bookmark."""

import json

import pytest

from src.contracts import Profile
from src.data.context import SqliteContextUpdater
from src.data.db import init_db
from src.data.message_log import SqliteMessageLog
from src.data.store import SqliteProfileStore

pytestmark = pytest.mark.asyncio


class OneShotLLM:
    """Returns canned JSON; records prompts for assertions."""

    def __init__(self, payload: dict):
        self.payload = payload
        self.calls: list[dict] = []

    async def complete(self, *, tier, input, system=None):
        self.calls.append({"tier": tier, "input": input, "system": system})
        return json.dumps(self.payload)


class NoopEmbedder:
    def __init__(self):
        self.built: list[str] = []

    async def build(self, profile, photos=None):
        self.built.append(profile.handle)


@pytest.fixture
def env(tmp_path):
    db = tmp_path / "t.sqlite"
    init_db(db)
    store = SqliteProfileStore(db)
    log = SqliteMessageLog(db)
    return db, store, log


async def test_updates_profile_from_window_and_advances_bookmark(env):
    db, store, log = env
    await store.upsert(Profile(handle="+1555", name="Maya", cuisines=["tacos"]))
    await log.append("g1", "+1555", "in", "im vegetarian now btw")
    llm = OneShotLLM({"cuisines": ["tacos"], "hard_nos": ["no meat"], "vibe": [],
                      "price_band": None, "typical_availability": None,
                      "persona_label": None, "notes": None})
    embedder = NoopEmbedder()
    updater = SqliteContextUpdater(llm, store, embedder, log)

    await updater.snapshot("g1", ["+1555"])

    p = await store.get("+1555")
    assert "no meat" in p.hard_nos and "tacos" in p.cuisines  # merge, not replace
    assert embedder.built == ["+1555"]
    assert "Maya" in llm.calls[0]["input"] or "+1555" in llm.calls[0]["input"]
    rows, _ = await log.window("g1")
    assert rows == []  # bookmark advanced


async def test_unknown_participant_with_empty_window_gets_minimal_profile(env):
    db, store, log = env
    updater = SqliteContextUpdater(OneShotLLM({}), store, NoopEmbedder(), log)
    await updater.snapshot("g-empty", ["+1777"])
    p = await store.get("+1777")
    assert p is not None and p.handle == "+1777"


async def test_beagle_rows_feed_thread_but_beagle_gets_no_profile(env):
    db, store, log = env
    await log.append("g1", "beagle", "out", "who's in?")
    await log.append("g1", "+1555", "in", "me!")
    llm = OneShotLLM({"cuisines": [], "vibe": [], "hard_nos": [], "price_band": None,
                      "typical_availability": None, "persona_label": None, "notes": None})
    updater = SqliteContextUpdater(llm, store, NoopEmbedder(), log)
    await updater.snapshot("g1", ["+1555"])
    assert "[beagle]: who's in?" in llm.calls[0]["input"]
    assert await store.get("beagle") is None


async def test_one_member_failure_does_not_block_others(env):
    db, store, log = env
    await log.append("g1", "+1555", "in", "hi")

    class FlakyLLM(OneShotLLM):
        async def complete(self, *, tier, input, system=None):
            if "+1BAD" in input:
                raise RuntimeError("boom")
            return await super().complete(tier=tier, input=input, system=system)

    llm = FlakyLLM({"cuisines": ["thai"], "vibe": [], "hard_nos": [], "price_band": None,
                    "typical_availability": None, "persona_label": None, "notes": None})
    updater = SqliteContextUpdater(llm, store, NoopEmbedder(), log)
    await updater.snapshot("g1", ["+1BAD", "+1555"])
    assert (await store.get("+1555")).cuisines == ["thai"]
