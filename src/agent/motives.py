"""Motives: same-day intents from nearby people, scored against YOU.

The band on the social page. list_motives ranks open motives by semantic fit
(motive text + host card embedded against the asker's person card via the
matching engine's embedder; token-overlap fallback offline). request_join
records a pending ask and has Beagle text the host a pitch; fake nearby hosts
auto-accept shortly after so the demo resolves live.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3

from src.agent.matching import _cosine_dense, _embedder, person_card
from src.agent.planner_chat import _no_dashes

JOIN_PITCH = (
    "You are Beagle, the hangout dog. {host} floated a motive: \"{motive}\" "
    "({window}). {name} wants in. Text {host} a one-breath pitch for letting "
    "{name} join: who they are (persona + one vivid taste from their profile) "
    "and why they'd fit this motive. Casual lowercase, 1-2 sentences, no "
    "pressure, one emoji max. Only use the facts given.\n"
    "{name}'s profile: {profile}"
)

AUTO_ACCEPT_S = 30.0  # fake nearby hosts say yes after this long (demo pacing)


def _rows(conn: sqlite3.Connection, sql: str, args: tuple = ()) -> list[sqlite3.Row]:
    return conn.execute(sql, args).fetchall()


def _stretch(raw: float) -> float:
    """Display-contrast curve for embedding cosines, which cluster near 0.7:
    a fixed linear stretch around that center so percents span roughly the
    20s to the 90s. Fixed (not per-list normalized) so a motive's score is
    stable across reloads and radius changes. Order-preserving."""
    return max(0.2, min(0.97, 0.55 + (raw - 0.70) * 10))


def _overlap_score(motive_text: str, my_data: dict) -> float:
    """Offline fallback: how much of the motive's wording hits my tastes."""
    words = set(motive_text.lower().replace(",", " ").replace("+", " ").split())
    mine = [
        *(my_data.get("cuisines") or []),
        *(my_data.get("vibe") or []),
    ]
    hits = sum(1 for t in mine if t.lower() in words)
    return min(0.55 + 0.15 * hits, 0.97) if hits else 0.42


def list_motives(db_path: str, handle: str, *, radius_km: float | None = None) -> list[dict]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        me = conn.execute(
            "SELECT name, json FROM profiles WHERE handle = ?", (handle,)
        ).fetchone()
        my_name = me["name"] if me else handle
        my_data = json.loads(me["json"]) if me else {}

        profiles = {
            r["handle"]: (r["name"], json.loads(r["json"]))
            for r in _rows(conn, "SELECT handle, name, json FROM profiles")
        }
        motives = _rows(
            conn,
            "SELECT id, host_handle, text, time_window, spots, created_at"
            " FROM motives WHERE status = 'open' ORDER BY created_at DESC",
        )
        joins = _rows(
            conn,
            "SELECT motive_id, handle, status FROM motive_joins WHERE status != 'declined'",
        )
        accepted = {}
        my_status: dict[int, str] = {}
        for j in joins:
            if j["status"] == "in":
                accepted[j["motive_id"]] = accepted.get(j["motive_id"], 0) + 1
            if j["handle"] == handle:
                my_status[j["motive_id"]] = j["status"]

        model = _embedder()
        my_vec = None
        if model is not None:
            my_vec = [float(x) for x in next(iter(model.embed([person_card(my_name, my_data)])))]

        out = []
        for m in motives:
            host_name, host_data = profiles.get(m["host_handle"], (m["host_handle"], {}))
            km = host_data.get("km") if isinstance(host_data.get("km"), (int, float)) else None
            if radius_km is not None and km is not None and km > radius_km:
                continue
            if m["host_handle"] == handle:
                score = 1.0
            elif my_vec is not None:
                motive_doc = f"{m['text']}. {m['time_window']}. hosted by {person_card(host_name, host_data)}"
                vec = [float(x) for x in next(iter(model.embed([motive_doc])))]
                score = _stretch(_cosine_dense(my_vec, vec))
            else:
                score = _overlap_score(m["text"], my_data)
            out.append(
                {
                    "id": m["id"],
                    "host_handle": m["host_handle"],
                    "host_name": host_name,
                    "persona": host_data.get("persona_label"),
                    "text": m["text"],
                    "time_window": m["time_window"],
                    "km": km,
                    "spots_left": max(0, m["spots"] - accepted.get(m["id"], 0)),
                    "score": round(max(0.0, min(1.0, score)), 4),
                    "my_status": "host" if m["host_handle"] == handle else my_status.get(m["id"], "none"),
                }
            )
        # mine first, then best fit
        out.sort(key=lambda x: (x["my_status"] != "host", -x["score"]))
        return out
    finally:
        conn.close()


def create_motive(
    db_path: str, handle: str, *, text: str, time_window: str, spots: int = 2
) -> int:
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.execute(
            "INSERT INTO motives (host_handle, text, time_window, spots) VALUES (?, ?, ?, ?)",
            (handle, text.strip(), time_window.strip() or "tonight", max(1, spots)),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


async def request_join(
    db_path: str,
    *,
    motive_id: int,
    handle: str,
    messaging,
    llm,
    demo_target: str | None = None,
    auto_accept_s: float | None = None,
) -> dict:
    """Pending ask + Beagle texts the host a pitch. Fake (nearby-pool) hosts
    auto-accept after a beat so the flow resolves live in the demo."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    m = conn.execute(
        "SELECT id, host_handle, text, time_window FROM motives WHERE id = ? AND status = 'open'",
        (motive_id,),
    ).fetchone()
    if m is None:
        conn.close()
        return {"ok": False, "status": "none"}
    conn.execute(
        "INSERT INTO motive_joins (motive_id, handle) VALUES (?, ?)"
        " ON CONFLICT(motive_id, handle) DO UPDATE SET status = 'pending'",
        (motive_id, handle),
    )
    conn.commit()

    def profile(h: str) -> tuple[str, str, dict]:
        p = conn.execute("SELECT name, json FROM profiles WHERE handle = ?", (h,)).fetchone()
        return (p["name"], p["json"], json.loads(p["json"])) if p else (h, "{}", {})

    name, prof, _ = profile(handle)
    host_name, _, host_data = profile(m["host_handle"])
    conn.close()

    pitch = _no_dashes(
        await llm.complete(
            tier="frontier",
            input=JOIN_PITCH.format(
                host=host_name, motive=m["text"], window=m["time_window"], name=name, profile=prof
            ),
        )
    )
    try:
        chat = await messaging.open_direct(demo_target or m["host_handle"])
        await messaging.send_text(chat, pitch)
    except Exception as e:
        print(f"[motives] join pitch to {m['host_handle']} failed: {e}")

    if host_data.get("nearby") is True:
        delay = AUTO_ACCEPT_S if auto_accept_s is None else auto_accept_s
        asyncio.get_running_loop().call_later(
            delay, _accept_join_sync, db_path, motive_id, handle
        )
    return {"ok": True, "status": "pending"}


DECISION_MSG = (
    "You are Beagle, the hangout dog, texting {name} DIRECTLY (address them "
    "as 'you'). {host} {verdict} {name}'s ask to join \"{motive}\" "
    "({window}). {name} is the one joining; {host} is the one hosting. Break "
    "the news to {name} in one or two casual lowercase sentences. If "
    "accepted, the shape is: 'good news, you're in for {motive}! {host} says "
    "come thru' (never say {host} is in; {host} was always going, it is "
    "their motive). If not this time: gentle, no apology spiral, leave the "
    "door open. One emoji max. Only use the facts given."
)


async def notify_decision(
    db_path: str,
    *,
    motive_id: int,
    asker: str,
    decision: str,
    messaging,
    llm,
    demo_target: str | None = None,
) -> bool:
    """Host decided (web-side write already done): Beagle texts the asker."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    m = conn.execute(
        "SELECT host_handle, text, time_window FROM motives WHERE id = ?", (motive_id,)
    ).fetchone()
    names = dict(conn.execute("SELECT handle, name FROM profiles").fetchall())
    conn.close()
    if m is None:
        return False
    text = _no_dashes(
        await llm.complete(
            tier="frontier",
            input=DECISION_MSG.format(
                host=names.get(m["host_handle"], m["host_handle"]),
                verdict="accepted" if decision == "in" else "passed on",
                name=names.get(asker, asker),
                motive=m["text"],
                window=m["time_window"],
            ),
        )
    )
    try:
        chat = await messaging.open_direct(demo_target or asker)
        await messaging.send_text(chat, text)
        return True
    except Exception as e:
        print(f"[motives] decision text to {asker} failed: {e}")
        return False


def _accept_join_sync(db_path: str, motive_id: int, handle: str) -> None:
    try:
        conn = sqlite3.connect(db_path)
        conn.execute(
            "UPDATE motive_joins SET status = 'in' WHERE motive_id = ? AND handle = ? AND status = 'pending'",
            (motive_id, handle),
        )
        conn.commit()
        conn.close()
        print(f"[motives] {handle} accepted into motive {motive_id}")
    except Exception as e:
        print(f"[motives] auto-accept failed: {e}")
