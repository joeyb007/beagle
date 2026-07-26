"""T2 — Import a group chat into per-person message bundles for distillation.

Three sources, same output (`list[PersonMessages]`):
  1. Raw pasted text C's onboarding wrote to the `imports` table (poll on demand).
  2. A raw text blob passed directly (paste fallback).
  3. A macOS `chat.db` (or imessage-exporter dump) — decode `attributedBody`.

Only the `imports`/paste paths run in the offline harness; the chat.db path is
implemented for consolidation and never imported unless a path is given.
A date-range filter keeps the window recent and the distill cheap.
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from .db import connect

# "Name (+1555…): message"  or  "Name: message"
_LINE = re.compile(r"^\s*(?P<name>[^:(]+?)\s*(?:\((?P<handle>[^)]+)\))?\s*:\s*(?P<msg>.*)$")


@dataclass
class PersonMessages:
    handle: str
    name: str
    messages: list[str] = field(default_factory=list)

    @property
    def blob(self) -> str:
        return "\n".join(self.messages)


def _slug_handle(name: str) -> str:
    return "unknown:" + re.sub(r"[^a-z0-9]+", "", name.lower())


def parse_pasted(text: str) -> list[PersonMessages]:
    """Parse `Name (handle): message` transcripts; continuation lines append to
    the current speaker. Returns one bundle per distinct handle, in first-seen order."""
    by_handle: dict[str, PersonMessages] = {}
    order: list[str] = []
    current: PersonMessages | None = None

    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        m = _LINE.match(line)
        if m and m.group("msg") is not None and (m.group("handle") or ":" in line):
            name = m.group("name").strip()
            handle = (m.group("handle") or _slug_handle(name)).strip()
            msg = m.group("msg").strip()
            person = by_handle.get(handle)
            if person is None:
                person = PersonMessages(handle=handle, name=name)
                by_handle[handle] = person
                order.append(handle)
            if msg:
                person.messages.append(msg)
            current = person
        elif current is not None:
            # continuation of the previous speaker's turn
            current.messages.append(line.strip())

    return [by_handle[h] for h in order]


def read_imports(db_path: str | Path | None = None, mark_processed: bool = True) -> list[PersonMessages]:
    """Consume pending rows from the `imports` table (C writes them) and parse.

    No cross-process call — just the shared SQLite file, per the branch contract.
    """
    conn = connect(db_path)
    try:
        rows = conn.execute(
            "SELECT id, raw_text FROM imports WHERE status = 'pending' ORDER BY id"
        ).fetchall()
        blob = "\n".join(r["raw_text"] for r in rows)
        people = parse_pasted(blob)
        if mark_processed and rows:
            conn.executemany(
                "UPDATE imports SET status = 'processed' WHERE id = ?",
                [(r["id"],) for r in rows],
            )
            conn.commit()
    finally:
        conn.close()
    return people


# ------------------------------------------------------------- chat.db source

_APPLE_EPOCH = 978307200  # 2001-01-01 UTC in Unix seconds


def _decode_attributed_body(blob: bytes | None) -> str | None:
    """Best-effort text extraction from an NSAttributedString `streamtyped` blob.

    iMessage stores the body as an archived NSAttributedString; the visible text
    is a UTF-8 run tagged by `NSString`. This pulls that run without a full
    typedstream parser — good enough for cold-start profiling.
    """
    if not blob:
        return None
    marker = blob.find(b"NSString")
    if marker == -1:
        return None
    # after the marker: class metadata, then a length prefix, then the bytes.
    seg = blob[marker + 8 :]
    # skip the archiver's small type/length bytes, then read a printable run.
    m = re.search(rb"[\x20-\x7e\xc2-\xf4][\x20-\xff]{2,}", seg)
    if not m:
        return None
    try:
        return m.group(0).decode("utf-8", errors="ignore").strip("\x00 \x01\x02\x84\x85\x86")
    except Exception:
        return None


def read_chatdb(
    chat_db: str | Path, since: datetime | None = None
) -> list[PersonMessages]:
    """Read a macOS `chat.db`. Groups by sender handle, decoding `attributedBody`
    when `text` is null. `since` filters by message date (recent = cheap)."""
    conn = sqlite3.connect(str(chat_db))
    conn.row_factory = sqlite3.Row
    try:
        where, params = "", []
        if since is not None:
            ns = int((since.timestamp() - _APPLE_EPOCH) * 1e9)
            where = "WHERE m.date >= ?"
            params = [ns]
        rows = conn.execute(
            f"""
            SELECT h.id AS handle, m.text AS text, m.attributedBody AS body
            FROM message m
            JOIN handle h ON m.handle_id = h.ROWID
            {where}
            ORDER BY m.date
            """,
            params,
        ).fetchall()
    finally:
        conn.close()

    by_handle: dict[str, PersonMessages] = {}
    for r in rows:
        text = r["text"] or _decode_attributed_body(r["body"])
        if not text:
            continue
        handle = r["handle"]
        person = by_handle.get(handle)
        if person is None:
            person = PersonMessages(handle=handle, name=handle)
            by_handle[handle] = person
        person.messages.append(text.strip())
    return list(by_handle.values())
