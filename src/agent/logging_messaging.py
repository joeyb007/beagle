"""LoggingMessaging: MessagingPort decorator that records outbound rows.

Wraps any MessagingPort and appends every outbound send (text or card)
to the MessageLog as ("beagle", "out") rows. Everything else is pure
passthrough. Wiring keeps a reference to the raw adapter for lifecycle
(ensure_running/close) — this class implements strictly the port surface.
"""

from typing import Callable

from src.contracts import (
    Card,
    ChatRef,
    InboundMessage,
    MessageLog,
    MessagingPort,
    PollRef,
    PollSpec,
    PollVote,
)

BEAGLE_HANDLE = "beagle"


class LoggingMessaging:
    def __init__(self, inner: MessagingPort, log: MessageLog):
        self._inner = inner
        self._log = log

    async def open_direct(self, handle: str) -> ChatRef:
        return await self._inner.open_direct(handle)

    async def open_group(self, handles: list[str]) -> ChatRef:
        return await self._inner.open_group(handles)

    async def send_text(self, chat: ChatRef, text: str) -> None:
        await self._inner.send_text(chat, text)
        await self._log.append(chat.id, BEAGLE_HANDLE, "out", text)

    async def set_typing(self, chat: ChatRef, on: bool) -> None:
        await self._inner.set_typing(chat, on)

    async def send_card(self, chat: ChatRef, card: Card) -> None:
        await self._inner.send_card(chat, card)
        await self._log.append(chat.id, BEAGLE_HANDLE, "out", f"{card.title}\n{card.body}")

    async def create_poll(self, chat: ChatRef, poll: PollSpec) -> PollRef:
        return await self._inner.create_poll(chat, poll)

    async def send_image(self, chat: ChatRef, path: str) -> None:
        await self._inner.send_image(chat, path)

    async def celebrate(
        self, chat: ChatRef, text: str, name: str | None = None,
        background_path: str | None = None,
    ) -> None:
        await self._inner.celebrate(chat, text, name, background_path)
        await self._log.append(chat.id, BEAGLE_HANDLE, "out", text)

    async def send_voice(self, chat: ChatRef, path: str) -> None:
        await self._inner.send_voice(chat, path)

    async def send_file(self, chat: ChatRef, path: str) -> None:
        await self._inner.send_file(chat, path)

    async def get_participants(self, chat: ChatRef) -> list[str]:
        return await self._inner.get_participants(chat)

    def on_inbound(self, handler: Callable[[InboundMessage], None]) -> None:
        self._inner.on_inbound(handler)

    def on_poll_vote(self, handler: Callable[[PollVote], None]) -> None:
        self._inner.on_poll_vote(handler)
