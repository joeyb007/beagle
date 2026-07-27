"""When Beagle gets added to a group chat, the group becomes real in our app:
a persisted groups row, placeholder profiles for unknown members, and exactly
one hello in the thread."""

import json
import sqlite3

from src.contracts import ChatRef, MessagingPort

HELLO = (
    "🐶 hey! i'm beagle — i plan this group's hangouts. "
    "when you want to go somewhere, someone just say \"hey beagle\" and what "
    "you're feeling. i'll take it from there."
)


class GroupRegistrar:
    def __init__(self, *, db_path: str, messaging: MessagingPort, announce: bool = True):
        self._db_path = db_path
        self._messaging = messaging
        self._announce = announce

    async def on_group_joined(
        self, chat_id: str, members: list[str], name: str | None = None
    ) -> None:
        conn = sqlite3.connect(self._db_path)
        try:
            existing = conn.execute(
                "SELECT id FROM groups WHERE chat_id = ?", (chat_id,)
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE groups SET name = COALESCE(?, name), members = ? WHERE chat_id = ?",
                    (name, json.dumps(members), chat_id),
                )
            else:
                conn.execute(
                    "INSERT INTO groups (name, members, chat_id) VALUES (?, ?, ?)",
                    (name or "the group chat", json.dumps(members), chat_id),
                )
            self._provision(conn, members)
            conn.commit()
        finally:
            conn.close()

        if existing is None and self._announce:
            try:
                await self._messaging.send_text(ChatRef(id=chat_id), HELLO)
            except Exception as e:  # greeting is cosmetic — registration stands
                print(f"[groups] hello failed (non-fatal): {e}")

    def _provision(self, conn: sqlite3.Connection, members: list[str]) -> None:
        """Placeholder profiles for unknown handles — the distiller fills them
        in as people talk; fan-out works from day one."""
        for handle in members:
            if conn.execute(
                "SELECT 1 FROM profiles WHERE handle = ?", (handle,)
            ).fetchone():
                continue
            conn.execute(
                "INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, 0.0)",
                (handle, handle, json.dumps({"handle": handle, "name": handle})),
            )

    def log_message(self, chat_id: str, handle: str, text: str) -> None:
        """Append a group-thread message — fuel for the per-group voice card."""
        if not text.strip():
            return
        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                "INSERT INTO group_messages (chat_id, handle, text) VALUES (?, ?, ?)",
                (chat_id, handle, text),
            )
