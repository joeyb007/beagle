"""Warm-intro worker: a swipe-right in the web app becomes Beagle texting the
match — who your friend is, why you two fit, and their number if you want it."""

import asyncio
import json
import sqlite3
from datetime import datetime

from src.agent.planner_chat import _no_dashes
from src.contracts import LLMRouter, MessagingPort

INTRO_PROMPT = (
    "You are Beagle, {name}'s hangout dog (a friendly agent that plans their "
    "group's hangouts). {name} saw {match_name}'s profile nearby and wants to "
    "meet — write the WARM INTRO text you'll send {match_name}.\n"
    "Structure (flow it naturally, not as a list):\n"
    "1. who you are — beagle, texting on {name}'s behalf\n"
    "2. a curated one-breath portrait of {name}: their persona in the group + "
    "the 2 most vivid specifics from their profile (a taste, a habit, a hard no)\n"
    "3. the single strongest reason these two would click, drawn from where "
    "their profiles actually overlap\n"
    "4. the handoff: they can text {name} at {handle} if they're down — "
    "zero pressure, beagle doesn't do pressure\n"
    "Casual lowercase texting voice, 3-4 sentences, one emoji max. Only use "
    "the facts below, never invent.\n"
    "Example energy: 'hey! i'm beagle, joseph's hangout dog. he's the one who "
    "plans everything, lives for omakase, won't set foot in a club. you're "
    "both sushi people with sundays free — feels like a layup. if you're "
    "down, he's at +1647… no pressure 🐶'\n\n"
    "{name}'s profile: {profile}\n{match_name}'s profile: {match_profile}"
)


class IntroWorker:
    def __init__(
        self,
        *,
        db_path: str,
        messaging: MessagingPort,
        llm: LLMRouter,
        interval_s: float = 5.0,
        demo_target: str | None = None,  # route ALL intro DMs to this real number
    ):
        self._db_path = db_path
        self._messaging = messaging
        self._llm = llm
        self._interval_s = interval_s
        self._demo_target = demo_target

    async def run_forever(self) -> None:
        while True:
            try:
                await self.process_once()
            except Exception as e:  # worker must never die
                print(f"[intros] pass failed: {e}")
            await asyncio.sleep(self._interval_s)

    @staticmethod
    def _ensure_message_column(conn: sqlite3.Connection) -> None:
        # older DBs predate the stored intro text; the column is additive
        try:
            conn.execute("ALTER TABLE intros ADD COLUMN message TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # already there

    async def process_once(self) -> int:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        self._ensure_message_column(conn)
        rows = conn.execute(
            "SELECT id, handle, match_handle FROM intros"
            " WHERE status = 'pending' AND decision = 'intro'"
        ).fetchall()

        for row in rows:
            delivered = await self._deliver(conn, row)
            conn.execute(
                "UPDATE intros SET status = ?, message = ? WHERE id = ?",
                ("sent" if delivered else "skipped", delivered, row["id"]),
            )
            conn.commit()
        conn.close()
        return len(rows)

    async def intro_now(self, handle: str, match_handle: str) -> str | None:
        """Immediate path for the make_intro tool / API: upsert the intro row,
        deliver right away, return the drafted text (None if delivery failed)."""
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        self._ensure_message_column(conn)
        conn.execute(
            "INSERT INTO intros (handle, match_handle, decision) VALUES (?, ?, 'intro')"
            " ON CONFLICT(handle, match_handle) DO UPDATE SET decision = 'intro',"
            " status = 'pending'",
            (handle, match_handle),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, handle, match_handle FROM intros WHERE handle = ? AND match_handle = ?",
            (handle, match_handle),
        ).fetchone()
        text = await self._deliver(conn, row)
        conn.execute(
            "UPDATE intros SET status = ?, message = ? WHERE id = ?",
            ("sent" if text else "skipped", text, row["id"]),
        )
        conn.commit()
        conn.close()
        return text

    async def _deliver(self, conn: sqlite3.Connection, row: sqlite3.Row) -> str | None:
        def profile(handle: str) -> tuple[str, str]:
            p = conn.execute(
                "SELECT name, json FROM profiles WHERE handle = ?", (handle,)
            ).fetchone()
            return (p["name"], p["json"]) if p else (handle, "{}")

        name, prof = profile(row["handle"])
        match_name, match_prof = profile(row["match_handle"])

        text = _no_dashes(
            await self._llm.complete(
                tier="frontier",
                input=INTRO_PROMPT.format(
                    name=name,
                    handle=row["handle"],
                    profile=prof,
                    match_name=match_name,
                    match_profile=match_prof,
                ),
            )
        )
        target = self._demo_target or row["match_handle"]
        try:
            chat = await self._messaging.open_direct(target)
            await self._messaging.send_text(chat, text)
            print(f"[intros] warm intro sent: {name} -> {match_name}")
            return text
        except Exception as e:
            print(f"[intros] intro to {row['match_handle']} failed: {e}")
            return None
