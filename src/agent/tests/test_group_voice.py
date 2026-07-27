"""Per-group voice card: distilled from the thread's real messages, cached."""

import sqlite3

import pytest

from src.agent.group_voice import style_for
from src.agent.stubs import ScriptedLLM

SCHEMA = open("schema.sql").read()
CHAT = "iMessage;+;chat123"


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data.sqlite")
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT INTO groups (name, members, chat_id) VALUES ('the boys', '[]', ?)", (CHAT,)
    )
    conn.commit()
    conn.close()
    return path


def log(db, n, text="yoo LOL down fr fr"):
    conn = sqlite3.connect(db)
    for i in range(n):
        conn.execute(
            "INSERT INTO group_messages (chat_id, handle, text) VALUES (?, '+1', ?)",
            (CHAT, f"{text} {i}"),
        )
    conn.commit()
    conn.close()


async def test_too_few_messages_means_no_card_yet(db):
    log(db, 3)
    assert await style_for(ScriptedLLM(), db, CHAT) is None


async def test_card_is_distilled_from_the_thread_and_cached(db):
    log(db, 12)
    llm = ScriptedLLM(default="lowercase, heavy 'fr fr', no punctuation, one-word hype replies")
    card = await style_for(llm, db, CHAT)
    assert card == "lowercase, heavy 'fr fr', no punctuation, one-word hype replies"
    assert "fr fr" in llm.calls[-1]["input"]  # real messages fed the distillation

    # cached: second call hits the groups.voice column, no LLM
    llm2 = ScriptedLLM(default="something else")
    assert await style_for(llm2, db, CHAT) == card
    assert llm2.calls == []


async def test_unknown_chat_returns_none(db):
    assert await style_for(ScriptedLLM(), db, "iMessage;+;nope") is None
