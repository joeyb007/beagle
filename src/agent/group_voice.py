"""Per-group voice card: Beagle talks like the group chat talks.

Distilled from the thread's real messages into a compact style description,
cached on groups.voice. Callers inject it as the system prompt for anything
Beagle says in that thread."""

import sqlite3

from src.contracts import LLMRouter

MIN_MESSAGES = 8  # below this, no card — beagle uses its default voice

VOICE_PROMPT = (
    "Here are recent messages from one friend-group chat (oldest first):\n"
    "{messages}\n\n"
    "Write a compact STYLE CARD for texting like this group: capitalization, "
    "punctuation, slang/phrases they actually use, emoji habits, typical "
    "message length, energy. 2-4 lines, imperative voice (e.g. 'all lowercase, "
    "never end with a period'). Only patterns visible above, never invent."
)


async def style_for(llm: LLMRouter, db_path: str, chat_id: str) -> str | None:
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            "SELECT id, voice FROM groups WHERE chat_id = ?", (chat_id,)
        ).fetchone()
        if row is None:
            return None
        if row[1]:
            return row[1]

        msgs = [
            t for (t,) in conn.execute(
                "SELECT text FROM group_messages WHERE chat_id = ? ORDER BY id DESC LIMIT 60",
                (chat_id,),
            ).fetchall()
        ]
        if len(msgs) < MIN_MESSAGES:
            return None

        card = await llm.complete(
            tier="cheap",
            input=VOICE_PROMPT.format(messages="\n".join(reversed(msgs))),
        )
        conn.execute("UPDATE groups SET voice = ? WHERE chat_id = ?", (card, chat_id))
        conn.commit()
        return card
    finally:
        conn.close()


def invalidate(db_path: str, chat_id: str) -> None:
    """Drop the cached card so the next ask re-distills (e.g. periodic refresh)."""
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE groups SET voice = NULL WHERE chat_id = ?", (chat_id,))
