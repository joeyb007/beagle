"""Warm-intro worker: a swipe-right in the web app becomes Beagle texting the
match — who your friend is, why you two fit, and their number if you want it."""

import asyncio
import json
import sqlite3
from datetime import datetime

from src.contracts import LLMRouter, MessagingPort

INTRO_PROMPT = (
    "You are Beagle, {name}'s hangout dog (a friendly agent that plans their "
    "group's hangouts). {name} saw {match_name}'s profile nearby and wants to "
    "meet — write the WARM INTRO text you'll send {match_name}.\n"
    "Include, naturally: who you are (beagle, texting on {name}'s behalf), a "
    "short genuine background on {name} from the facts below, why the two of "
    "them would get along, and that {match_name} can text {name} at {handle} "
    "if they're down — zero pressure.\n"
    "Casual lowercase texting voice, 2-4 sentences, one emoji max. Only use "
    "the facts below, never invent.\n\n"
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
                print(f"[intros] pass failed: {e}")
            await asyncio.sleep(self._interval_s)

    async def process_once(self) -> int:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, handle, match_handle FROM intros"
            " WHERE status = 'pending' AND decision = 'intro'"
        ).fetchall()

        for row in rows:
            delivered = await self._deliver(conn, row)
            conn.execute(
                "UPDATE intros SET status = ? WHERE id = ?",
                ("sent" if delivered else "skipped", row["id"]),
            )
            conn.commit()
        conn.close()
        return len(rows)

    async def _deliver(self, conn: sqlite3.Connection, row: sqlite3.Row) -> bool:
        def profile(handle: str) -> tuple[str, str]:
            p = conn.execute(
                "SELECT name, json FROM profiles WHERE handle = ?", (handle,)
            ).fetchone()
            return (p["name"], p["json"]) if p else (handle, "{}")

        name, prof = profile(row["handle"])
        match_name, match_prof = profile(row["match_handle"])

        text = await self._llm.complete(
            tier="frontier",
            input=INTRO_PROMPT.format(
                name=name,
                handle=row["handle"],
                profile=prof,
                match_name=match_name,
                match_profile=match_prof,
            ),
        )
        try:
            chat = await self._messaging.open_direct(row["match_handle"])
            await self._messaging.send_text(chat, text)
            print(f"[intros] warm intro sent: {name} -> {match_name}")
            return True
        except Exception as e:
            print(f"[intros] intro to {row['match_handle']} failed: {e}")
            return False
