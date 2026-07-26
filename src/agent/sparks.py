"""Serendipity spark worker: the web queues a "remember this day" request;
this turns it into a nostalgic text in the group chat (or attendee DMs when
the group has no live chat id yet). Snapchat-memories, but it texts you.
"""

import asyncio
import json
import sqlite3
from datetime import datetime

from src.contracts import ChatRef, LLMRouter, MessagingPort

SPARK_PROMPT = (
    "Write ONE short, warm, nostalgic iMessage reminding a friend group about "
    "a past hangout. Details: place={place}, date={date}, memory_note={note}. "
    "Sound like a friend reminiscing, not an app. One or two sentences, one "
    "emoji max. No preamble."
)


class SparkWorker:
    def __init__(
        self,
        *,
        db_path: str,
        messaging: MessagingPort,
        llm: LLMRouter,
        interval_s: float = 5.0,
    ):
        self._db_path = db_path
        self._messaging = messaging
        self._llm = llm
        self._interval_s = interval_s

    async def run_forever(self) -> None:
        while True:
            try:
                await self.process_once()
            except Exception as e:  # worker must never die
                print(f"[sparks] pass failed: {e}")
            await asyncio.sleep(self._interval_s)

    async def process_once(self) -> int:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT s.id, s.plan_id, a.place, a.time, a.attendees, a.note,
                      g.chat_id AS group_chat
               FROM sparks s
               JOIN artifacts a ON a.plan_id = s.plan_id
               LEFT JOIN groups g ON g.id = a.group_id
               WHERE s.status = 'pending'"""
        ).fetchall()

        for row in rows:
            delivered = await self._deliver(row)
            conn.execute(
                "UPDATE sparks SET status = ?, sent_at = ? WHERE id = ?",
                ("sent" if delivered else "skipped", datetime.now().isoformat(), row["id"]),
            )
            conn.commit()
        conn.close()
        return len(rows)

    async def _deliver(self, row: sqlite3.Row) -> bool:
        place = json.loads(row["place"]).get("name", "that place")
        date = datetime.fromisoformat(row["time"]).strftime("%A %b %-d")
        text = await self._llm.complete(
            tier="cheap",
            input=SPARK_PROMPT.format(place=place, date=date, note=row["note"] or "a great time"),
        )

        if row["group_chat"]:
            await self._messaging.send_text(ChatRef(id=row["group_chat"]), text)
            return True

        delivered = False  # no live group chat yet -> DM everyone who was there
        for handle in json.loads(row["attendees"]):
            try:
                dm = await self._messaging.open_direct(handle)
                await self._messaging.send_text(dm, text)
                delivered = True
            except Exception as e:
                print(f"[sparks] DM to {handle} failed: {e}")
        return delivered
