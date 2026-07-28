"""Tools for the chattable planner — the hands to go with the brain.

Each tool returns (result_text_for_model, attachment_or_none). Attachments are
typed payloads the web chat renders as real UI (slot chips, venue cards, a
plan-started card) instead of prose.
"""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timedelta

from src.contracts import Interval

# ---------------------------------------------------------------- helpers

DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _rows(db_path: str, sql: str, args: tuple = ()) -> list[sqlite3.Row]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(sql, args).fetchall()
    finally:
        conn.close()


def _profiles(db_path: str) -> list[dict]:
    out = []
    for r in _rows(db_path, "SELECT handle, name, json FROM profiles"):
        d = json.loads(r["json"])
        if d.get("nearby"):
            continue
        out.append({"handle": r["handle"], "name": r["name"], **d})
    return out


def _groups(db_path: str) -> list[dict]:
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "chat_id": r["chat_id"],
            "members": json.loads(r["members"]),
        }
        for r in _rows(db_path, "SELECT id, name, chat_id, members FROM groups")
    ]


def _find_group(db_path: str, crew: str) -> dict | None:
    crew_l = crew.lower().strip()
    groups = _groups(db_path)
    exact = [g for g in groups if g["name"].lower() == crew_l]
    if exact:
        return exact[0]
    partial = [g for g in groups if crew_l in g["name"].lower() or g["name"].lower() in crew_l]
    return partial[0] if partial else None


# Availability text -> (days, start_hour, end_hour). Mirrors web/lib/availability.
def _blocks(text: str | None) -> tuple[list[int], int, int]:
    if not text:
        return [], 0, 0
    t = text.lower()
    named = [i for i, d in enumerate(
        ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    ) if d in t]
    if named:
        days = named
    elif "weekend" in t:
        days = [5, 6]
    elif "weekday" in t:
        days = [0, 1, 2, 3, 4]
    else:
        days = [0, 1, 2, 3, 4, 5, 6]

    start, end = 11, 22
    after = re.search(r"after\s+(\d{1,2})\s*(pm|am)?", t)
    if after:
        h = int(after.group(1))
        start = h if after.group(2) == "am" else (h if h >= 12 else h + 12)
        end = 23
    elif "after work" in t:
        start, end = 18, 22
    elif "late night" in t:
        start, end = 21, 24
    elif "evening" in t or "night" in t:
        start, end = 17, 23
    elif "morning" in t:
        start, end = 8, 12
    elif "afternoon" in t:
        start, end = 12, 17
    elif "anytime" in t or "whenever" in t or "flexible" in t:
        start, end = 10, 23
    return days, start, end


def _hour_label(h: int) -> str:
    if h == 12:
        return "12pm"
    if h == 24:
        return "12am"
    return f"{h}am" if h < 12 else f"{h - 12}pm"


# ---------------------------------------------------------------- the tools

TOOL_DEFS = [
    {
        "name": "start_plan",
        "description": (
            "Actually kick off a hangout plan: Beagle DMs every member of the crew, "
            "collects constraints, proposes, and locks. Use when the user clearly wants "
            "to start planning something with a specific crew."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "crew": {"type": "string", "description": "Crew/group-chat name, e.g. 'the roomies'"},
                "occasion": {"type": "string", "description": "What's being planned, e.g. 'dinner this weekend'"},
            },
            "required": ["crew", "occasion"],
        },
    },
    {
        "name": "find_free_slots",
        "description": (
            "Compute exact overlapping free windows for a crew (or named people) over the "
            "coming days, using usual patterns plus google-calendar busy blocks. Use for any "
            "'when is everyone free' question instead of estimating."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "crew": {"type": "string", "description": "Crew name (optional if people given)"},
                "people": {"type": "array", "items": {"type": "string"}, "description": "Names (optional)"},
                "duration_hours": {"type": "integer", "description": "How long the hangout needs, default 2"},
                "window_days": {"type": "integer", "description": "How many days ahead to search, default 7"},
            },
        },
    },
    {
        "name": "search_venues",
        "description": "Find real venue candidates for a plan (food, activities). Include vibe/cuisine and any hard nos in the query.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "e.g. 'korean bbq, casual, no clubs'"}},
            "required": ["query"],
        },
    },
    {
        "name": "recall_memories",
        "description": "Look up past hangouts and messages: what happened, when, with whom. Use for questions about the past.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Keywords: a place, a person, an occasion"}},
            "required": ["query"],
        },
    },
    {
        "name": "update_my_profile",
        "description": "Save a fact the user states about THEMSELVES (availability, likes, hard nos). Never for other people.",
        "input_schema": {
            "type": "object",
            "properties": {
                "availability": {"type": "string", "description": "New usual-availability text, if changed"},
                "add_likes": {"type": "array", "items": {"type": "string"}},
                "add_hard_nos": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
    {
        "name": "nudge_crew",
        "description": "Send a short warm stir-the-group message to a quiet crew, from Beagle. Use only when the user asks you to nudge/stir them.",
        "input_schema": {
            "type": "object",
            "properties": {
                "crew": {"type": "string"},
                "note": {"type": "string", "description": "Optional angle for the nudge"},
            },
            "required": ["crew"],
        },
    },
]


class PlannerTools:
    def __init__(self, orchestrator, db_path: str, handle: str):
        self._orch = orchestrator
        self._db = db_path
        self._handle = handle

    async def run(self, name: str, args: dict) -> tuple[str, dict | None]:
        fn = getattr(self, f"tool_{name}", None)
        if fn is None:
            return f"unknown tool {name}", None
        try:
            return await fn(**args)
        except Exception as e:  # tool errors go back to the model, not the user
            return f"tool error: {e}", None

    # -- actions ----------------------------------------------------------

    async def tool_start_plan(self, crew: str, occasion: str) -> tuple[str, dict | None]:
        g = _find_group(self._db, crew)
        if not g:
            names = ", ".join(x["name"] for x in _groups(self._db))
            return f"no crew matching '{crew}'. known crews: {names}", None
        chat_id = g["chat_id"] or f"web:{g['id']}"
        if chat_id in self._orch.sessions:
            return f"a plan is already running for {g['name']}", None
        members = [m for m in g["members"]]
        await self._orch.start_plan(
            initiator=self._handle, chat_id=chat_id, participants=members, occasion=occasion
        )
        by_handle = {p["handle"]: p["name"] for p in _profiles(self._db)}
        names = [by_handle.get(m, m) for m in members]
        return (
            f"plan started for {g['name']}: DMing {', '.join(names)} about '{occasion}'.",
            {"type": "plan_started", "crew": g["name"], "occasion": occasion, "members": names},
        )

    async def tool_nudge_crew(self, crew: str, note: str = "") -> tuple[str, dict | None]:
        g = _find_group(self._db, crew)
        if not g:
            return f"no crew matching '{crew}'", None
        from src.contracts import ChatRef

        msg = await self._orch._llm.complete(
            tier="cheap",
            input=(
                "Write ONE short, warm iMessage from Beagle the group's hangout dog, "
                f"gently stirring the quiet group chat '{g['name']}' to hang out again. "
                f"{('Angle: ' + note) if note else ''} Lowercase, friendly, one sentence, no em dashes."
            ),
        )
        if g["chat_id"]:
            targets = [ChatRef(id=g["chat_id"])]
        else:  # no group thread known: den-style, every member's DM
            targets = [await self._orch._messaging.open_direct(h) for h in g["members"]]
        for t in targets:
            await self._orch._messaging.send_text(t, msg)
        return (
            f"nudge sent to {g['name']}: \"{msg}\"",
            {"type": "nudged", "crew": g["name"], "message": msg},
        )

    async def tool_update_my_profile(
        self,
        availability: str | None = None,
        add_likes: list[str] | None = None,
        add_hard_nos: list[str] | None = None,
    ) -> tuple[str, dict | None]:
        conn = sqlite3.connect(self._db)
        conn.row_factory = sqlite3.Row
        try:
            row = conn.execute(
                "SELECT json FROM profiles WHERE handle=?", (self._handle,)
            ).fetchone()
            if not row:
                return "no profile found", None
            d = json.loads(row["json"])
            changed = []
            if availability:
                d["typical_availability"] = availability
                changed.append(f"usually free: {availability}")
            for item in add_likes or []:
                if item.lower() not in [c.lower() for c in d.get("cuisines", [])]:
                    d.setdefault("cuisines", []).append(item.lower())
                    changed.append(f"likes {item}")
            for item in add_hard_nos or []:
                if item.lower() not in [c.lower() for c in d.get("hard_nos", [])]:
                    d.setdefault("hard_nos", []).append(item.lower())
                    changed.append(f"hard no: {item}")
            conn.execute(
                "UPDATE profiles SET json=?, updated_at=datetime('now') WHERE handle=?",
                (json.dumps(d), self._handle),
            )
            conn.commit()
        finally:
            conn.close()
        return ("saved: " + "; ".join(changed) if changed else "nothing new to save"), None

    # -- knowledge --------------------------------------------------------

    async def tool_search_venues(self, query: str) -> tuple[str, dict | None]:
        cands = await self._orch._venues.find(query, self._orch._near)
        if not cands:
            return "no venues found", None
        lines = [f"- {c.name}" + (f" ({c.area})" if c.area else "") + (f": {c.note}" if c.note else "") for c in cands]
        return (
            "venues:\n" + "\n".join(lines),
            {
                "type": "venues",
                "venues": [
                    {"name": c.name, "area": c.area, "note": c.note, "url": c.url} for c in cands[:4]
                ],
            },
        )

    async def tool_recall_memories(self, query: str) -> tuple[str, dict | None]:
        q = f"%{query.lower()}%"
        arts = _rows(
            self._db,
            "SELECT place, time, attendees, note FROM artifacts "
            "WHERE lower(place) LIKE ? OR lower(coalesce(note,'')) LIKE ? ORDER BY time DESC LIMIT 5",
            (q, q),
        )
        by_handle = {p["handle"]: p["name"] for p in _profiles(self._db)}
        lines = []
        for a in arts:
            who = ", ".join(by_handle.get(h, h) for h in json.loads(a["attendees"]))
            place = json.loads(a["place"])["name"]
            lines.append(f"- {place} on {a['time'][:10]} with {who}" + (f" ({a['note']})" if a["note"] else ""))
        msgs = _rows(
            self._db,
            "SELECT handle, text, ts FROM messages WHERE lower(text) LIKE ? ORDER BY id DESC LIMIT 5",
            (q,),
        )
        for m in msgs:
            lines.append(f"- {by_handle.get(m['handle'], m['handle'])} said \"{m['text'][:80]}\" ({m['ts'][:10]})")
        return ("found:\n" + "\n".join(lines)) if lines else "nothing in the memory books for that", None

    async def tool_find_free_slots(
        self,
        crew: str | None = None,
        people: list[str] | None = None,
        duration_hours: int = 2,
        window_days: int = 7,
    ) -> tuple[str, dict | None]:
        profs = _profiles(self._db)
        if crew:
            g = _find_group(self._db, crew)
            if not g:
                return f"no crew matching '{crew}'", None
            pool = [p for p in profs if p["handle"] in g["members"]]
        elif people:
            wanted = [n.lower() for n in people]
            pool = [p for p in profs if any(w in p["name"].lower() for w in wanted)]
        else:
            pool = profs
        if not pool:
            return "nobody matched", None

        # gcal busy for synced members (best effort)
        now = datetime.now()
        busy: dict[str, list[Interval]] = {}
        synced = {r["handle"] for r in _rows(self._db, "SELECT DISTINCT handle FROM oauth_tokens WHERE provider='google'")}
        for p in pool:
            if p["handle"] in synced:
                try:
                    busy[p["handle"]] = await self._orch._calendar.free_busy(
                        p["handle"], Interval(start=now, end=now + timedelta(days=window_days))
                    )
                except Exception:
                    busy[p["handle"]] = []

        def free_at(p: dict, day_dt: datetime, hour: int) -> bool:
            days, s, e = _blocks(p.get("typical_availability"))
            if day_dt.weekday() not in days or not (s <= hour < e):
                return False
            for b in busy.get(p["handle"], []):
                t = day_dt.replace(hour=hour)
                if b.start <= t < b.end:
                    return False
            return True

        slots = []
        for i in range(1, window_days + 1):
            day_dt = now + timedelta(days=i)
            for start_h in range(8, 24 - duration_hours):
                names = [
                    p["name"]
                    for p in pool
                    if all(free_at(p, day_dt, h) for h in range(start_h, start_h + duration_hours))
                ]
                if names:
                    slots.append(
                        {
                            "day": DAY_NAMES[day_dt.weekday()],
                            "date": day_dt.strftime("%b %-d"),
                            "start": _hour_label(start_h),
                            "end": _hour_label(start_h + duration_hours),
                            "free": names,
                            "count": len(names),
                        }
                    )
        if not slots:
            return "no overlapping windows found in that range", None
        # best = most people, then soonest; dedupe overlapping windows per day
        slots.sort(key=lambda s: (-s["count"],))
        best: list[dict] = []
        seen_days: dict[str, int] = {}
        for s in slots:
            if seen_days.get(s["date"], 0) >= 1 and len(best) >= 3:
                continue
            best.append(s)
            seen_days[s["date"]] = seen_days.get(s["date"], 0) + 1
            if len(best) >= 4:
                break
        lines = [f"- {s['day']} {s['date']} {s['start']}-{s['end']}: {', '.join(s['free'])}" for s in best]
        return (
            "best windows:\n" + "\n".join(lines),
            {"type": "slots", "duration_hours": duration_hours, "slots": best},
        )
