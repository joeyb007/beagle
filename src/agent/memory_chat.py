"""Memory chat: converse with Beagle about one past hangout, full context."""

import json
import sqlite3

from src.contracts import LLMRouter

CHAT_PROMPT = (
    "You are Beagle, the friend who plans this group's hangouts and keeps its "
    "memories. A member is asking about one hangout (it may be past or upcoming).\n"
    "Hangout: {place} on {time}\nWho was there: {people}\n"
    "Your memory note: {note}\nPlaylist that night: {playlist}\n\n"
    "Conversation so far:\n{history}\n\nThey ask: {question}\n\n"
    "Answer like a friend who was there (or is hyped to go) — warm, specific, 1-3 sentences, "
    "one emoji max. Never invent facts beyond the details above; if you don't "
    "know, say so playfully."
)


async def chat_about_memory(
    llm: LLMRouter, db_path: str, *, plan_id: str, question: str, history: list[dict]
) -> str:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT place, time, attendees, playlist, note FROM artifacts WHERE plan_id = ?",
        (plan_id,),
    ).fetchone()
    if row is None:
        return "hmm, I don't remember that one 🐶 — was I there?"

    names = dict(conn.execute("SELECT handle, name FROM profiles").fetchall())
    conn.close()
    people = ", ".join(names.get(h, h) for h in json.loads(row["attendees"]))
    playlist = ", ".join(
        f'{t["title"]} — {t["artist"]}' for t in json.loads(row["playlist"] or "[]")
    ) or "no playlist"
    lines = "\n".join(f'{m.get("role", "user")}: {m.get("text", "")}' for m in history) or "(none)"

    return await llm.complete(
        tier="frontier",
        input=CHAT_PROMPT.format(
            place=json.loads(row["place"]).get("name", "somewhere"),
            time=row["time"],
            people=people,
            note=row["note"] or "(no note)",
            playlist=playlist,
            history=lines,
            question=question,
        ),
    )
