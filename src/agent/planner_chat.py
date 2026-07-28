"""Planner chat — the home-page assistant. Beagle as social concierge:
grounded in profiles, crews, upcoming plans, and (when tokens exist) live
Google-Calendar busy blocks, so "who's free thursday?" gets a real answer.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta

from src.contracts import CalendarProvider, Interval, LLMRouter

SYSTEM = (
    "You are Beagle, {name}'s social-planning assistant — a sharp, warm dog "
    "who keeps the friend group alive. You answer questions about when people "
    "are free, suggest plans, and help {name} get hangouts moving. Ground "
    "every claim in the data below; say so plainly when you don't know. Keep "
    "replies short and texty (1-3 sentences), lowercase-friendly, no emoji "
    "spam, no em dashes. When {name} wants to start a plan, tell them to text their group: "
    '"hey beagle, <occasion>" — that summons you into the thread.'
)


def _rows(db_path: str, sql: str, args: tuple = ()) -> list[sqlite3.Row]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(sql, args).fetchall()
    finally:
        conn.close()


async def _context(db_path: str, calendar: CalendarProvider, handle: str) -> str:
    people = []
    for r in _rows(db_path, "SELECT handle, name, json FROM profiles"):
        d = json.loads(r["json"])
        if d.get("nearby"):
            continue  # sample pool, not the crew
        people.append(
            f"- {r['name']} ({r['handle']}): usually free {d.get('typical_availability') or 'unknown'};"
            f" likes {', '.join(d.get('cuisines') or []) or '?'};"
            f" hard nos: {', '.join(d.get('hard_nos') or []) or 'none'}"
        )

    groups = [
        f"- {r['name']}: {', '.join(json.loads(r['members']))}"
        for r in _rows(db_path, "SELECT name, members FROM groups")
    ]

    now = datetime.now()
    plans = [
        f"- {json.loads(r['place'])['name']} at {r['time']} with {', '.join(json.loads(r['attendees']))}"
        for r in _rows(
            db_path,
            "SELECT place, time, attendees FROM artifacts WHERE time > ? ORDER BY time LIMIT 5",
            (now.isoformat(),),
        )
    ]

    # live calendar busy blocks for anyone with a google token (silent prior)
    window = Interval(start=now, end=now + timedelta(days=7))
    busy_lines = []
    for r in _rows(db_path, "SELECT DISTINCT handle FROM oauth_tokens WHERE provider='google'"):
        try:
            blocks = await calendar.free_busy(r["handle"], window)
        except Exception:
            blocks = []
        if blocks:
            spans = "; ".join(f"{b.start:%a %H:%M}-{b.end:%H:%M}" for b in blocks[:6])
            busy_lines.append(f"- {r['handle']} busy: {spans}")

    parts = [f"today is {now:%A %b %d, %H:%M}", "PEOPLE:", *people, "CREWS:", *groups]
    if plans:
        parts += ["UPCOMING PLANS:", *plans]
    if busy_lines:
        parts += ["CALENDAR BUSY BLOCKS (gcal-synced members, next 7 days):", *busy_lines]
    return "\n".join(parts)


async def chat_with_planner(
    llm: LLMRouter,
    calendar: CalendarProvider,
    db_path: str,
    *,
    handle: str,
    question: str,
    history: list[dict],
) -> str:
    me = _rows(db_path, "SELECT name FROM profiles WHERE handle=?", (handle,))
    name = me[0]["name"] if me else handle
    convo = "\n".join(
        f"{'you' if m.get('role') == 'assistant' else name}: {m.get('text', '')}"
        for m in history[-8:]
    )
    prompt = (
        f"DATA:\n{await _context(db_path, calendar, handle)}\n\n"
        f"CONVERSATION SO FAR:\n{convo or '(none)'}\n\n"
        f"{name} says: {question}\n\nReply as Beagle:"
    )
    reply = await llm.complete(tier="frontier", system=SYSTEM.format(name=name), input=prompt)
    # style guard: no em dashes reach the UI regardless of model mood
    return reply.replace(" — ", ", ").replace("—", "-")
