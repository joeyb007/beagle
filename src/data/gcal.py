"""T5 — CalendarProvider: Google Calendar free/busy as a silent prior (FR20-21).

Direct Google OAuth (`calendar.readonly`) — NOT via Merge. Reads tokens C wrote
to `oauth_tokens` (provider='google'). Returns **busy** intervals inside the
window; A subtracts them from the window to get real availability, then still
confirms 1-on-1 over text (preserving the texting beat).

Google libs are imported lazily so the offline harness never needs them; with no
token (the isolation case) `free_busy` returns `[]` — "nothing known busy".
"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from ..contracts import Interval
from .db import connect

_TOKEN_URI = "https://oauth2.googleapis.com/token"


class GoogleCalendarProvider:
    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db = db_path

    def _token_row(self, handle: str):
        conn = connect(self._db)
        try:
            return conn.execute(
                "SELECT access_token, refresh_token, expires_at FROM oauth_tokens "
                "WHERE handle = ? AND provider = 'google'",
                (handle,),
            ).fetchone()
        finally:
            conn.close()

    async def free_busy(self, handle: str, window: Interval) -> list[Interval]:
        row = self._token_row(handle)
        if row is None:
            return []  # not connected → no known conflicts

        try:
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build
        except ImportError:
            return []

        creds = Credentials(
            token=row["access_token"],
            refresh_token=row["refresh_token"],
            token_uri=_TOKEN_URI,
            client_id=os.getenv("GOOGLE_CLIENT_ID"),
            client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
            scopes=["https://www.googleapis.com/auth/calendar.readonly"],
        )
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        body = {
            "timeMin": _rfc3339(window.start),
            "timeMax": _rfc3339(window.end),
            "items": [{"id": "primary"}],
        }
        resp = service.freebusy().query(body=body).execute()
        busy = resp.get("calendars", {}).get("primary", {}).get("busy", [])
        return [
            Interval(
                start=datetime.fromisoformat(b["start"].replace("Z", "+00:00")),
                end=datetime.fromisoformat(b["end"].replace("Z", "+00:00")),
            )
            for b in busy
        ]


def _rfc3339(dt: datetime) -> str:
    s = dt.isoformat()
    return s if ("+" in s or s.endswith("Z")) else s + "Z"
