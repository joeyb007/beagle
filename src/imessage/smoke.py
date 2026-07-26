"""Branch B live acceptance (docs/branch-b.md) — run once the Photon line exists.

Usage:
    IMESSAGE_TOKEN=... IMESSAGE_ADDRESS=... \
    .venv/bin/python -m src.imessage.smoke +15551234567

Against a REAL number: preflight → DM → typing → text → card → poll, then
streams inbound messages + poll votes to the console. Reply from the phone
and vote in the poll to prove the full event path. Ctrl-C to stop.
"""

import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()  # .env at repo root — credentials live there

from src.contracts import Card, PollSpec
from src.imessage.photon_messaging import PhotonMessaging


async def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: python -m src.imessage.smoke <E.164 phone number>")
    has_spectrum = os.environ.get("SPECTRUM_PROJECT_ID") and os.environ.get("SPECTRUM_PROJECT_SECRET")
    if not has_spectrum and not os.environ.get("IMESSAGE_TOKEN"):
        sys.exit(
            "No Photon credentials — set SPECTRUM_PROJECT_ID + SPECTRUM_PROJECT_SECRET "
            "(from app.photon.codes project Settings), or IMESSAGE_ADDRESS + IMESSAGE_TOKEN "
            "for an explicit line"
        )
    handle = sys.argv[1]

    m = PhotonMessaging()  # real mode: sidecar sees the Spectrum creds and goes live
    try:
        await run(m, handle)
    finally:
        await m.close()  # never leak a sidecar with a stale session


async def run(m: PhotonMessaging, handle: str) -> None:
    await m.ensure_running()
    print("sidecar healthy (real photon layer)")

    ok = await m.is_imessage_available(handle)
    print(f"preflight {handle}: {'iMessage ✓' if ok else 'NOT iMessage — green bubble risk!'}")

    m.on_inbound(lambda msg: print(f"  [inbound] {msg.handle}: {msg.text}"))
    m.on_poll_vote(lambda v: print(f"  [vote] {v.handle} → option {v.option_index} on {v.poll_id}"))

    chat = await m.open_direct(handle)
    print(f"DM open: {chat.id}")

    async def attempt(label: str, coro) -> None:
        try:
            result = await coro
            print(f"  ✓ {label}" + (f": {result}" if result else ""))
        except Exception as e:
            print(f"  ✗ {label} FAILED: {e}")
        await asyncio.sleep(2)  # human-ish spacing; avoid rapid-fire on a shared line

    await attempt("typing on", m.set_typing(chat, True))
    await attempt("text", m.send_text(chat, "hey! beagle smoke test 🐶 — reply anything"))
    await attempt("typing off", m.set_typing(chat, False))
    await attempt("card", m.send_card(chat, Card(title="🐶 smoke card", body="if you can read this, cards work")))
    await attempt("poll", m.create_poll(chat, PollSpec(question="smoke poll?", options=["works", "nope"])))

    print("listening for events — reply to the text and vote in the poll (Ctrl-C to stop)…")
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass


if __name__ == "__main__":
    asyncio.run(main())
