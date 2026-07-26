"""Beagle's take: a short LLM-written read on one member, cached in their profile."""

import json
import sqlite3
from datetime import datetime, timezone

from src.contracts import LLMRouter

TAKE_PROMPT = (
    "You are Beagle, the friend who plans this group's hangouts and quietly "
    "learns everyone. Write Beagle's HOT TAKE on {name}: ONE short sentence, "
    "under 15 words. Just the read — no explaining it, no evidence, no "
    "trailing clauses. Second person, cheeky, lowercase texting voice, at "
    "most one emoji. Only use the facts below, never invent.\n"
    "Example shape: 'you'd cancel on anyone except the omakase counter 🍣'\n\n"
    "Profile: {profile}\nPickiness (0-1): {score}\n"
    "Their hangout history (place, date, who else, Beagle's note):\n{history}"
)


async def beagle_take(
    llm: LLMRouter, db_path: str, *, handle: str, refresh: bool = False
) -> str:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT name, json, constraint_score FROM profiles WHERE handle = ?", (handle,)
    ).fetchone()
    if row is None:
        conn.close()
        return "still getting to know you 🐶 — go plan something with your people"

    data = json.loads(row["json"])
    if not refresh and data.get("beagle_take"):
        conn.close()
        return data["beagle_take"]

    names = dict(conn.execute("SELECT handle, name FROM profiles").fetchall())
    history_lines = []
    for a in conn.execute(
        "SELECT place, time, attendees, note FROM artifacts ORDER BY time DESC LIMIT 12"
    ).fetchall():
        attendees = json.loads(a["attendees"])
        if handle not in attendees:
            continue
        others = ", ".join(names.get(h, h) for h in attendees if h != handle) or "solo"
        place = json.loads(a["place"]).get("name", "somewhere")
        note = a["note"] or "(no note)"
        history_lines.append(f"- {place} on {a['time']} with {others} — {note}")

    take = await llm.complete(
        tier="frontier",
        input=TAKE_PROMPT.format(
            name=row["name"],
            profile=json.dumps({k: v for k, v in data.items() if k != "beagle_take"}),
            score=row["constraint_score"],
            history="\n".join(history_lines) or "(no hangouts yet)",
        ),
    )

    data["beagle_take"] = take
    data["beagle_take_at"] = datetime.now(timezone.utc).isoformat()
    conn.execute("UPDATE profiles SET json = ? WHERE handle = ?", (json.dumps(data), handle))
    conn.commit()
    conn.close()
    return take
