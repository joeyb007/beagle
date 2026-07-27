import pytest

from src.agent.logging_messaging import LoggingMessaging
from src.agent.stubs import StubMessaging
from src.contracts import Card, ChatRef

pytestmark = pytest.mark.asyncio


class MemoryLog:
    def __init__(self):
        self.rows = []

    async def append(self, chat_id, handle, direction, text):
        self.rows.append((chat_id, handle, direction, text))


async def test_outbound_text_and_cards_are_logged_and_delegated():
    inner, log = StubMessaging(), MemoryLog()
    m = LoggingMessaging(inner, log)
    await m.send_text(ChatRef(id="g1"), "who's in?")
    await m.send_card(ChatRef(id="g1"), Card(title="locked in", body="sat 7pm"))
    assert inner.texts == [("g1", "who's in?")]
    assert ("g1", "beagle", "out", "who's in?") in log.rows
    assert ("g1", "beagle", "out", "locked in\nsat 7pm") in log.rows


async def test_non_sending_calls_pass_through_unlogged():
    inner, log = StubMessaging(), MemoryLog()
    m = LoggingMessaging(inner, log)
    chat = await m.open_direct("+1555")
    await m.set_typing(chat, True)
    assert chat.id == "dm-+1555" and inner.typing == [("dm-+1555", True)] and log.rows == []
