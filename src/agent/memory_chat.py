"""Memory chat: converse with Beagle about one past hangout, full context.

When the asker's handle is known, their (and the crew's) recent real texts
are injected as style exemplars so Beagle mirrors how this group actually
talks — few-shot style conditioning, no extra model needed.
"""

import json
import sqlite3

from src.agent.planner_chat import _no_dashes
from src.contracts import LLMRouter

CHAT_PROMPT = (
    "You are Beagle, the friend who plans this group's hangouts and keeps its "
    "memories. A member is asking about one hangout (it may be past or upcoming).\n"
    "Hangout: {place} on {time}\nWho was there: {people}\n"
    "Your memory note: {note}\nPlaylist that night: {playlist}\n"
    "Post-it notes people stuck on the photos: {photo_notes}\n"
    "{style}"
    "\nConversation so far:\n{history}\n\nThey ask: {question}\n\n"
    "Answer like a friend who was there (or is hyped to go) — warm, specific, 1-3 sentences, "
    "one emoji max. Never invent facts beyond the details above; if you don't "
    "know, say so playfully."
)

STYLE_BLOCK = (
    "\nHow this crew actually texts (recent real messages — mirror their vibe: "
    "diction, energy, lowercase habits, message length; never quote these back):\n"
    "{samples}\n"
)


def _style_samples(conn: sqlite3.Connection, handle: str, names: dict) -> str:
    rows = conn.execute(
        "SELECT handle, text FROM messages WHERE direction='in' AND handle=? "
        "ORDER BY id DESC LIMIT 8",
        (handle,),
    ).fetchall()
    crew = conn.execute(
        "SELECT handle, text FROM messages WHERE direction='in' AND handle<>? "
        "ORDER BY id DESC LIMIT 6",
        (handle,),
    ).fetchall()
    lines = [
        f'{names.get(r["handle"], r["handle"])}: {r["text"]}'
        for r in [*reversed(rows), *reversed(crew)]
    ]
    return "\n".join(lines)


async def chat_about_memory(
    llm: LLMRouter,
    db_path: str,
    *,
    plan_id: str,
    question: str,
    history: list[dict],
    handle: str | None = None,
) -> str:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT place, time, attendees, playlist, note, photo_notes FROM artifacts WHERE plan_id = ?",
        (plan_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return "hmm, I don't remember that one 🐶 — was I there?"

    names = dict(conn.execute("SELECT handle, name FROM profiles").fetchall())
    style = ""
    if handle:
        samples = _style_samples(conn, handle, names)
        if samples:
            style = STYLE_BLOCK.format(samples=samples)
    conn.close()
    people = ", ".join(names.get(h, h) for h in json.loads(row["attendees"]))
    playlist = ", ".join(
        f'{t["title"]} — {t["artist"]}' for t in json.loads(row["playlist"] or "[]")
    ) or "no playlist"
    lines = "\n".join(f'{m.get("role", "user")}: {m.get("text", "")}' for m in history) or "(none)"
    photo_notes = "; ".join(json.loads(row["photo_notes"] or "{}").values()) or "(none)"

    reply = await llm.complete(
        tier="frontier",
        input=CHAT_PROMPT.format(
            place=json.loads(row["place"]).get("name", "somewhere"),
            time=row["time"],
            people=people,
            note=row["note"] or "(no note)",
            playlist=playlist,
            photo_notes=photo_notes,
            style=style,
            history=lines,
            question=question,
        ),
    )
    return _no_dashes(reply)
