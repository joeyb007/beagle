"""Message log over the shared `messages` table + per-chat snapshot bookmarks.

The orchestrator appends every observed message (inbound handler + outbound
decorator); the ContextUpdater reads windows and advances bookmarks. Sync
sqlite wrapped in async defs, same style as store.py.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from .db import connect


class SqliteMessageLog:
    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db = db_path

    async def append(
        self, chat_id: str, handle: str, direction: Literal["in", "out"], text: str
    ) -> None:
        conn = connect(self._db)
        try:
            conn.execute(
                "INSERT INTO messages (chat_id, handle, direction, text) VALUES (?, ?, ?, ?)",
                (chat_id, handle, direction, text),
            )
            conn.commit()
        finally:
            conn.close()

    async def window(self, chat_id: str) -> tuple[list[dict], int | None]:
        conn = connect(self._db)
        try:
            mark = conn.execute(
                "SELECT last_message_id FROM context_snapshots WHERE chat_id = ?",
                (chat_id,),
            ).fetchone()
            after = mark["last_message_id"] if mark else 0
            rows = conn.execute(
                "SELECT id, handle, direction, text FROM messages"
                " WHERE chat_id = ? AND id > ? ORDER BY id",
                (chat_id, after),
            ).fetchall()
        finally:
            conn.close()
        out = [dict(r) for r in rows]
        return out, (out[-1]["id"] if out else None)

    async def advance(self, chat_id: str, last_message_id: int) -> None:
        conn = connect(self._db)
        try:
            conn.execute(
                """
                INSERT INTO context_snapshots (chat_id, last_message_id, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(chat_id) DO UPDATE SET
                    last_message_id = excluded.last_message_id,
                    updated_at      = datetime('now')
                """,
                (chat_id, last_message_id),
            )
            conn.commit()
        finally:
            conn.close()
