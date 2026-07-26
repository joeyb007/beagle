"""Profile chat: converse with Beagle about your own history and analytics."""

import json
import sqlite3
from collections import Counter

from src.contracts import LLMRouter

CHAT_PROMPT = (
    "You are Beagle, the friend who plans this group's hangouts and quietly "
    "learns everyone. {name} is asking about their own life with the group — "
    "their habits, people, places, patterns.\n\n"
    "Their profile: {profile}\nPickiness (0-1): {score}\n"
    "Quick stats: {stats}\n"
    "Their hangout history (place, date, who else, note):\n{history}\n\n"
    "Conversation so far:\n{thread}\n\nThey ask: {question}\n\n"
    "Answer like a friend who's been there for all of it — warm, specific, "
    "casual lowercase texting voice, 1-3 sentences, one emoji max. Only use "
    "the facts above; if you don't know, say so playfully."
)


async def chat_about_me(
    llm: LLMRouter, db_path: str, *, handle: str, question: str, history: list[dict]
) -> str:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT name, json, constraint_score FROM profiles WHERE handle = ?", (handle,)
    ).fetchone()
    if row is None:
        conn.close()
        return "still getting to know you 🐶 — go plan something first"

    names = dict(conn.execute("SELECT handle, name FROM profiles").fetchall())
    lines, seen = [], Counter()
    for a in conn.execute("SELECT place, time, attendees, note FROM artifacts ORDER BY time").fetchall():
        attendees = json.loads(a["attendees"])
        if handle not in attendees:
            continue
        others = [names.get(h, h) for h in attendees if h != handle]
        seen.update(others)
        place = json.loads(a["place"]).get("name", "somewhere")
        lines.append(f"- {place} on {a['time']} with {', '.join(others) or 'just you'} — {a['note'] or '(no note)'}")
    conn.close()

    stats = f"{len(lines)} hangouts total"
    if seen:
        top, n = seen.most_common(1)[0]
        stats += f"; most-seen: {top} ({n} hangouts)"
    thread = "\n".join(f'{m.get("role", "user")}: {m.get("text", "")}' for m in history) or "(none)"

    return await llm.complete(
        tier="frontier",
        input=CHAT_PROMPT.format(
            name=row["name"],
            profile=row["json"],
            score=row["constraint_score"],
            stats=stats,
            history="\n".join(lines) or "(no hangouts yet)",
            thread=thread,
            question=question,
        ),
    )
