"""T4-T10: full Python↔sidecar bridge, sidecar in fake-Photon mode.

This is the acceptance path minus a live Photon line: every MessagingPort
method crosses the HTTP boundary, and both event streams cross the WS
boundary with normalization. smoke.py runs the same code against the real
line once IMESSAGE_TOKEN lands.
"""

import asyncio

import httpx
import pytest
import pytest_asyncio

from src.contracts import Card, ChatRef, InboundMessage, PollSpec, PollVote
from src.imessage.photon_messaging import PhotonMessaging

SIDECAR_URL = "http://127.0.0.1:8791"

# one event loop for the whole module: the adapter's WS task must live on the
# same loop as every test that awaits it
pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def messaging():
    m = PhotonMessaging(sidecar_url=SIDECAR_URL, fake=True, auto_spawn=True)
    await m.ensure_running()
    yield m
    await m.close()


async def sent_records() -> list[dict]:
    async with httpx.AsyncClient() as c:
        return (await c.get(f"{SIDECAR_URL}/_fake/sent")).json()


async def inject(path: str, payload: dict) -> None:
    async with httpx.AsyncClient() as c:
        (await c.post(f"{SIDECAR_URL}/_fake/{path}", json=payload)).raise_for_status()


async def test_open_direct_returns_chat_ref(messaging):
    chat = await messaging.open_direct("+15550000001")
    assert isinstance(chat, ChatRef)
    assert chat.id


async def test_send_text_and_typing_cross_the_bridge(messaging):
    chat = await messaging.open_direct("+15550000001")
    await messaging.set_typing(chat, True)
    await messaging.send_text(chat, "yo — sat or sun?")
    await messaging.set_typing(chat, False)
    kinds = [(r["kind"], r.get("text")) for r in await sent_records()]
    assert ("typing_on", None) in kinds
    assert ("text", "yo — sat or sun?") in kinds
    assert ("typing_off", None) in kinds


async def test_send_card_renders_with_text_fallback(messaging):
    chat = await messaging.open_direct("+15550000002")
    await messaging.send_card(chat, Card(title="locked in", body="7pm sat"))
    cards = [r for r in await sent_records() if r["kind"] == "card"]
    assert cards and "locked in" in cards[-1]["text"]


async def test_create_poll_returns_poll_ref(messaging):
    chat = await messaging.open_group(["+15550000001", "+15550000002"])
    ref = await messaging.create_poll(
        chat, PollSpec(question="where to?", options=["Tacos", "Sushi"])
    )
    assert ref.id
    polls = [r for r in await sent_records() if r["kind"] == "poll"]
    assert polls[-1]["options"] == ["Tacos", "Sushi"]


async def test_inbound_message_normalized_through_ws(messaging):
    got: list[InboundMessage] = []
    messaging.on_inbound(got.append)
    await inject("inbound", {"handle": "+15550000001", "chatId": "chat-9", "text": "sat works"})
    for _ in range(50):
        if got:
            break
        await asyncio.sleep(0.02)
    assert got and got[0] == InboundMessage(handle="+15550000001", chat_id="chat-9", text="sat works")


async def test_poll_vote_normalized_through_ws(messaging):
    got: list[PollVote] = []
    messaging.on_poll_vote(got.append)
    await inject("pollVote", {"pollId": "poll-1", "handle": "+15550000002", "optionIndex": 1})
    for _ in range(50):
        if got:
            break
        await asyncio.sleep(0.02)
    assert got and got[0] == PollVote(poll_id="poll-1", handle="+15550000002", option_index=1)


async def test_availability_preflight(messaging):
    assert await messaging.is_imessage_available("+15550000001") is True


# ---------------- text-emulated polls (guaranteed-MVP mode, BEAGLE_POLL_MODE=text)


async def test_text_mode_poll_sends_numbered_text_and_parses_votes(messaging):
    m2 = PhotonMessaging(sidecar_url=SIDECAR_URL, fake=True, auto_spawn=False, poll_mode="text")
    await m2.ensure_running()
    votes: list[PollVote] = []
    inbounds: list[InboundMessage] = []
    m2.on_poll_vote(votes.append)
    m2.on_inbound(inbounds.append)

    chat = await m2.open_direct("+15550000009")
    ref = await m2.create_poll(chat, PollSpec(question="where to?", options=["Tacos", "Sushi"]))
    assert ref.id.startswith("textpoll-")

    # the poll went out as a numbered TEXT (the proven primitive), not a native poll
    sent = await sent_records()
    poll_texts = [r for r in sent if r["kind"] == "text" and "where to?" in (r.get("text") or "")]
    assert poll_texts, "numbered poll text was not sent"
    assert "1. Tacos" in poll_texts[-1]["text"]
    assert "2. Sushi" in poll_texts[-1]["text"]

    # a numeric reply in that chat becomes a vote, NOT an inbound message
    await inject("inbound", {"handle": "+15550000009", "chatId": chat.id, "text": "2"})
    for _ in range(50):
        if votes:
            break
        await asyncio.sleep(0.02)
    assert votes and votes[0] == PollVote(poll_id=ref.id, handle="+15550000009", option_index=1)
    assert not inbounds

    # a non-numeric reply in the same chat still flows through as inbound
    await inject("inbound", {"handle": "+15550000009", "chatId": chat.id, "text": "hype!!"})
    for _ in range(50):
        if inbounds:
            break
        await asyncio.sleep(0.02)
    assert inbounds and inbounds[0].text == "hype!!"
    assert len(votes) == 1
    await m2.close()


async def test_text_mode_out_of_range_vote_ignored(messaging):
    m2 = PhotonMessaging(sidecar_url=SIDECAR_URL, fake=True, auto_spawn=False, poll_mode="text")
    await m2.ensure_running()
    votes: list[PollVote] = []
    m2.on_poll_vote(votes.append)
    chat = await m2.open_direct("+15550000010")
    await m2.create_poll(chat, PollSpec(question="q?", options=["a", "b"]))
    await inject("inbound", {"handle": "+15550000010", "chatId": chat.id, "text": "7"})
    await asyncio.sleep(0.3)
    assert votes == []
    await m2.close()
