"""Serendipity spark worker: the web queues a "remember this day" request;
this turns it into a nostalgic text in the group chat (or attendee DMs when
the group has no live chat id yet). Snapchat-memories, but it texts you.
"""

import asyncio
import json
import sqlite3
from datetime import datetime
from pathlib import Path

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
        photo_root: str | None = None,  # where web photo urls live on disk
    ):
        self._db_path = db_path
        self._messaging = messaging
        self._llm = llm
        self._interval_s = interval_s
        self._photo_root = Path(photo_root) if photo_root else (
            Path(db_path).resolve().parent / "web" / "public"
        )

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
            """SELECT s.id, s.plan_id, s.photo, a.place, a.time, a.attendees, a.note,
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

        photo_path = self._resolve_photo(row["photo"])

        async def send_to(chat: ChatRef) -> None:
            if photo_path:  # the specific memory, if we can attach it
                try:
                    await self._messaging.send_image(chat, photo_path)
                except Exception as e:
                    print(f"[sparks] image send failed (text still goes): {e}")
            await self._messaging.send_text(chat, text)

        if row["group_chat"]:
            await send_to(ChatRef(id=row["group_chat"]))
            return True

        delivered = False  # no live group chat yet -> DM everyone who was there
        for handle in json.loads(row["attendees"]):
            try:
                await send_to(await self._messaging.open_direct(handle))
                delivered = True
            except Exception as e:
                print(f"[sparks] DM to {handle} failed: {e}")
        return delivered

    def _resolve_photo(self, photo: str | None) -> str | None:
        """Web photo urls (/uploads/x.svg) live on disk under photo_root."""
        if not photo:
            return None
        candidate = self._photo_root / photo.lstrip("/")
        return str(candidate) if candidate.exists() else None
