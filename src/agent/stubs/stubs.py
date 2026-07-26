from typing import Callable

from src.contracts import (
    Card,
    ChatRef,
    HangoutArtifact,
    InboundMessage,
    Interval,
    LLMTier,
    Match,
    PollRef,
    PollSpec,
    PollVote,
    Profile,
    Reply,
    Track,
)


class StubMessaging:
    """Records every outbound call; lets tests inject inbound events."""

    def __init__(self):
        self.texts: list[tuple[str, str]] = []  # (chat_id, text)
        self.cards: list[tuple[str, Card]] = []
        self.images: list[tuple[str, str]] = []  # (chat_id, path)
        self.polls: list[tuple[str, PollSpec]] = []
        self.typing: list[tuple[str, bool]] = []
        self._inbound_handlers: list[Callable[[InboundMessage], None]] = []
        self._vote_handlers: list[Callable[[PollVote], None]] = []
        self._poll_seq = 0
        self.fail_handles: set[str] = set()  # simulate not-allowlisted targets
        self.celebrations: list[tuple] = []  # (chat_id, text, name, background)
        self.voices: list[tuple[str, str]] = []
        self.files: list[tuple[str, str]] = []

    async def open_direct(self, handle: str) -> ChatRef:
        if handle in self.fail_handles:
            raise RuntimeError(f"Target not allowed: {handle}")
        return ChatRef(id=f"dm-{handle}")

    async def open_group(self, handles: list[str]) -> ChatRef:
        return ChatRef(id="group-" + "-".join(handles))

    async def send_text(self, chat: ChatRef, text: str) -> None:
        self.texts.append((chat.id, text))

    async def celebrate(self, chat, text, name=None, background_path=None):
        self.celebrations.append((chat.id, text, name, background_path))

    async def send_voice(self, chat, path):
        self.voices.append((chat.id, path))

    async def send_file(self, chat, path):
        self.files.append((chat.id, path))

    async def set_typing(self, chat: ChatRef, on: bool) -> None:
        self.typing.append((chat.id, on))

    async def send_card(self, chat: ChatRef, card: Card) -> None:
        self.cards.append((chat.id, card))

    async def send_image(self, chat: ChatRef, path: str) -> None:
        self.images.append((chat.id, path))

    async def create_poll(self, chat: ChatRef, poll: PollSpec) -> PollRef:
        self._poll_seq += 1
        ref = PollRef(id=f"poll-{self._poll_seq}")
        self.polls.append((chat.id, poll))
        return ref

    def on_inbound(self, handler: Callable[[InboundMessage], None]) -> None:
        self._inbound_handlers.append(handler)

    def on_poll_vote(self, handler: Callable[[PollVote], None]) -> None:
        self._vote_handlers.append(handler)

    # test/harness helpers
    def inject_inbound(self, m: InboundMessage) -> None:
        for h in self._inbound_handlers:
            h(m)

    def inject_vote(self, v: PollVote) -> None:
        for h in self._vote_handlers:
            h(v)

    def texts_to(self, chat_id: str) -> list[str]:
        return [t for c, t in self.texts if c == chat_id]


DEFAULT_PROFILES = [
    Profile(
        handle="+15550000001",
        name="Rayhan",
        cuisines=["sushi", "thai"],
        hard_nos=["clubs"],
        typical_availability="weekends only",
        constraint_score=0.9,
    ),
    Profile(
        handle="+15550000002",
        name="Maya",
        cuisines=["tacos"],
        vibe=["casual"],
        constraint_score=0.2,
    ),
]


class StubProfileStore:
    def __init__(self, profiles: list[Profile] | None = None):
        self._profiles = {p.handle: p for p in (profiles or DEFAULT_PROFILES)}

    async def get(self, handle: str) -> Profile | None:
        return self._profiles.get(handle)

    async def upsert(self, p: Profile) -> None:
        self._profiles[p.handle] = p

    async def list(self) -> list[Profile]:
        return list(self._profiles.values())


class StubVoice:
    async def style(self) -> str:
        return "Talk like the group: dry humor, lowercase, one emoji max."


class StubCalendar:
    """Returns BUSY intervals (Google freebusy semantics). Default: wide open."""

    def __init__(self, busy: dict[str, list[Interval]] | None = None):
        self._busy = busy or {}

    async def free_busy(self, handle: str, window: Interval) -> list[Interval]:
        return self._busy.get(handle, [])


class StubMusic:
    async def blend_playlist(self, handles: list[str], occasion: str) -> list[Track]:
        return [
            Track(title="Blend Opener", artist="The Stubs"),
            Track(title=f"{occasion} Anthem", artist="Seed Data"),
        ]


class StubMatching:
    async def match_nearby(self, handle: str, radius_km: float, k: int) -> list[Match]:
        return [
            Match(
                handle=handle,
                match_name="Sam (sample)",
                score=0.92,
                reasons=["also loves tacos", "2km away"],
            )
        ]


class StubRefresher:
    def __init__(self):
        self.refreshed_with: list[list[Reply]] = []

    async def refresh(self, replies: list[Reply]) -> None:
        self.refreshed_with.append(replies)


class StubArtifactStore:
    """In-memory ArtifactStore for tests that don't need SQLite."""

    def __init__(self):
        self.created: list[HangoutArtifact] = []

    async def create(self, plan, playlist) -> HangoutArtifact:
        artifact = HangoutArtifact(
            plan_id=plan.plan_id,
            place=plan.place,
            time=plan.time,
            attendees=plan.attendees,
            playlist=playlist,
        )
        self.created.append(artifact)
        return artifact

    async def get(self, plan_id: str) -> HangoutArtifact | None:
        return next((a for a in self.created if a.plan_id == plan_id), None)

    async def add_photos(self, plan_id: str, urls: list[str]) -> None:
        artifact = await self.get(plan_id)
        if artifact:
            artifact.photos.extend(urls)


class ScriptedLLM:
    """Keyword-routed canned completions; records every call."""

    def __init__(self, rules: list[tuple[str, str]] | None = None, default: str = "ok!"):
        self.rules = rules or []  # (substring-of-input, response)
        self.default = default
        self.calls: list[dict] = []

    async def complete(self, *, tier: LLMTier, input: str, system: str | None = None) -> str:
        self.calls.append({"tier": tier, "input": input, "system": system})
        for needle, response in self.rules:
            if needle in input:
                return response
        return self.default
