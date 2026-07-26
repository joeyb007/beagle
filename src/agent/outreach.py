"""Autonomous serendipity: Beagle notices a group has gone quiet and reaches
out first — the friend who texts "it's been a while" before anyone else does."""

import asyncio
import json
import sqlite3
from datetime import datetime, timedelta

from src.contracts import ChatRef, LLMRouter, MessagingPort

NUDGE_PROMPT = (
    "You are Beagle, the friend who plans this group's hangouts. The group "
    "'{group}' hasn't hung out in {weeks} weeks — last time was {place} on "
    "{date}. Write ONE short warm text to the group chat noticing the quiet "
    "and offering to plan the next one (they can just say 'hey beagle, plan "
    "something'). Reference the last hangout. Casual lowercase texting voice, "
    "1-2 sentences, one emoji max. No preamble."
)


class OutreachWorker:
    def __init__(
        self,
        *,
        db_path: str,
        messaging: MessagingPort,
        llm: LLMRouter,
        gap_days: int = 14,
        cooldown_days: int = 7,
        interval_s: float = 3600.0,
    ):
        self._db_path = db_path
        self._messaging = messaging
        self._llm = llm
        self._gap = timedelta(days=gap_days)
        self._cooldown = timedelta(days=cooldown_days)
        self._interval_s = interval_s

    async def run_forever(self) -> None:
        while True:
            try:
                await self.process_once()
            except Exception as e:  # worker must never die
                print(f"[outreach] pass failed: {e}")
            await asyncio.sleep(self._interval_s)

    async def process_once(self, force_group_id: int | None = None) -> int:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        now = datetime.now()
        nudged = 0

        for g in conn.execute("SELECT id, name, chat_id, members FROM groups").fetchall():
            forced = force_group_id == g["id"]
            if force_group_id is not None and not forced:
                continue

            last = conn.execute(
                "SELECT place, time FROM artifacts WHERE group_id = ?"
                " AND time <= datetime('now') ORDER BY time DESC LIMIT 1",
                (g["id"],),
            ).fetchone()
            upcoming = conn.execute(
                "SELECT 1 FROM artifacts WHERE group_id = ? AND time > datetime('now')",
                (g["id"],),
            ).fetchone()
            recent_nudge = conn.execute(
                "SELECT 1 FROM outreach WHERE group_id = ? AND sent_at > ?",
                (g["id"], (now - self._cooldown).isoformat(sep=" ")),
            ).fetchone()

            if last is None:
                continue
            quiet_for = now - datetime.fromisoformat(last["time"])
            if not forced and (upcoming or recent_nudge or quiet_for < self._gap):
                continue

            place = json.loads(last["place"]).get("name", "last time")
            text = await self._llm.complete(
                tier="cheap",
                input=NUDGE_PROMPT.format(
                    group=g["name"],
                    weeks=max(1, quiet_for.days // 7),
                    place=place,
                    date=last["time"][:10],
                ),
            )
            if await self._deliver(g, text):
                conn.execute("INSERT INTO outreach (group_id) VALUES (?)", (g["id"],))
                conn.commit()
                nudged += 1

        conn.close()
        return nudged

    async def _deliver(self, g: sqlite3.Row, text: str) -> bool:
        if g["chat_id"]:
            await self._messaging.send_text(ChatRef(id=g["chat_id"]), text)
            return True
        delivered = False  # no live chat id yet — DM the members
        for handle in json.loads(g["members"]):
            try:
                await self._messaging.send_text(await self._messaging.open_direct(handle), text)
                delivered = True
            except Exception as e:
                print(f"[outreach] DM to {handle} failed: {e}")
        return delivered
