"""Planner chat — the home-page assistant, now with hands.

With an Anthropic key: a tool-use loop (official SDK) over six tools —
start_plan, find_free_slots, search_venues, recall_memories,
update_my_profile, nudge_crew — grounded in the same context packet.
Tool results can carry typed attachments the web chat renders as UI.
Without a key: degrades to the context-only single completion via the
injected LLMRouter (DemoLLM), no tools.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timedelta

from src.contracts import CalendarProvider, Interval, LLMRouter
from src.agent.planner_tools import TOOL_DEFS, PlannerTools

SYSTEM = (
    "You are Beagle, {name}'s social-planning assistant, a sharp warm dog who "
    "keeps the friend group alive. You answer questions about when people are "
    "free, suggest plans, and TAKE ACTION with your tools: start real plans, "
    "compute exact free windows (always use find_free_slots for who's-free "
    "questions, never estimate), find venues, recall past hangouts, save facts "
    "the user shares about themselves, and nudge quiet crews when asked. "
    "Ground every claim in data; say so plainly when you don't know. Keep "
    "replies short and texty (1-3 sentences), lowercase-friendly, no emoji "
    "spam, no em dashes. Confirm before start_plan or nudge_crew unless the "
    "user's ask was explicit."
)

MAX_TOOL_TURNS = 5


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
            continue
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


def _no_dashes(text: str) -> str:
    return text.replace(" — ", ", ").replace("—", "-")


async def chat_with_planner(
    llm: LLMRouter,
    calendar: CalendarProvider,
    db_path: str,
    *,
    handle: str,
    question: str,
    history: list[dict],
    orchestrator=None,
) -> dict:
    me = _rows(db_path, "SELECT name FROM profiles WHERE handle=?", (handle,))
    name = me[0]["name"] if me else handle
    data = await _context(db_path, calendar, handle)

    if orchestrator is not None and os.environ.get("ANTHROPIC_API_KEY"):
        return await _tool_chat(db_path, handle, name, data, question, history, orchestrator)

    # offline / demo fallback: context-only completion, no tools
    convo = "\n".join(
        f"{'you' if m.get('role') == 'assistant' else name}: {m.get('text', '')}"
        for m in history[-8:]
    )
    prompt = (
        f"DATA:\n{data}\n\nCONVERSATION SO FAR:\n{convo or '(none)'}\n\n"
        f"{name} says: {question}\n\nReply as Beagle:"
    )
    reply = await llm.complete(tier="frontier", system=SYSTEM.format(name=name), input=prompt)
    return {"reply": _no_dashes(reply), "attachments": []}


async def _tool_chat(
    db_path: str,
    handle: str,
    name: str,
    data: str,
    question: str,
    history: list[dict],
    orchestrator,
) -> dict:
    from anthropic import AsyncAnthropic

    from src.agent.anthropic_router import DEFAULT_FRONTIER

    client = AsyncAnthropic()
    tools = PlannerTools(orchestrator, db_path, handle)

    messages: list[dict] = [
        {"role": "assistant" if m.get("role") == "assistant" else "user", "content": m.get("text", "")}
        for m in history[-8:]
        if m.get("text")
    ]
    messages.append({"role": "user", "content": question})

    system = SYSTEM.format(name=name) + f"\n\nDATA:\n{data}"
    attachments: list[dict] = []
    reply = "…"

    for _ in range(MAX_TOOL_TURNS):
        resp = await client.messages.create(
            model=DEFAULT_FRONTIER,
            max_tokens=16000,
            system=system,
            tools=TOOL_DEFS,
            messages=messages,
        )
        if resp.stop_reason == "refusal":
            reply = "hmm, i can't help with that one"
            break

        tool_uses = [b for b in resp.content if b.type == "tool_use"]
        text = "".join(b.text for b in resp.content if b.type == "text")
        if not tool_uses:
            reply = text or reply
            break

        messages.append({"role": "assistant", "content": resp.content})
        results = []
        for tu in tool_uses:
            out, attachment = await tools.run(tu.name, dict(tu.input))
            if attachment:
                attachments.append(attachment)
            results.append({"type": "tool_result", "tool_use_id": tu.id, "content": out})
        messages.append({"role": "user", "content": results})
        reply = text or reply  # keep any preamble in case the loop caps out

    return {"reply": _no_dashes(reply), "attachments": attachments}
