"""Beagle canonical contracts — FROZEN after hour 0.

The single seam inside the agent process. A/B/D implement and consume ONLY
these shapes; concrete classes live in each owner's directory and meet in
wiring.py at consolidation. If you must change anything here, announce it —
this is the one file that can break everyone.

Owners (see docs/branch-*.md):
  A implements: LLMRouter, VenueSearch, ArtifactStore (agent-side), Orchestrator
  B implements: MessagingPort
  D implements: ProfileStore, VoiceProvider, CalendarProvider, MusicProvider,
                MatchingService, ProfileRefresher
"""

from datetime import datetime
from typing import Callable, Literal, Protocol

from pydantic import BaseModel

# ---------------------------------------------------------------- data models

LLMTier = Literal["cheap", "frontier"]


class Interval(BaseModel):
    start: datetime
    end: datetime


class Profile(BaseModel):
    """PRD §8. Distiller rule: fill only supported fields, None if unknown,
    never invent. constraint_score drives fan-out order (§9)."""

    handle: str  # E.164 / email — REQUIRED for fan-out
    name: str
    cuisines: list[str] = []
    price_band: str | None = None
    vibe: list[str] = []
    hard_nos: list[str] = []
    typical_availability: str | None = None
    constraint_score: float = 0.0
    persona_label: str | None = None
    notes: str | None = None
    music_vector: list[float] | None = None
    image_vector: list[float] | None = None
    profile_vector: list[float] | None = None  # fused multi-modal embedding


class Candidate(BaseModel):
    """A venue option produced by VenueSearch."""

    name: str
    area: str | None = None
    url: str | None = None
    note: str | None = None


class Track(BaseModel):
    title: str
    artist: str
    url: str | None = None


class Match(BaseModel):
    handle: str  # who the match is for
    match_name: str
    score: float
    reasons: list[str] = []
    is_sample: bool = True


class Reply(BaseModel):
    """A collected fan-out reply; ProfileRefresher input at plan-lock."""

    handle: str
    text: str


class MemberState(BaseModel):
    availability: list[Interval] = []
    prefs: list[str] = []
    hard_nos: list[str] = []
    replied: bool = False


class FinalPlan(BaseModel):
    plan_id: str
    place: Candidate
    time: datetime
    attendees: list[str]  # handles


class Session(BaseModel):
    """PRD §8. Held in memory by the Orchestrator, keyed by session_id."""

    session_id: str
    occasion: str
    date_window: Interval
    group_chat_id: str  # chat the invocation came from (poll/card destination)
    members: list[str] = []  # handles
    member_states: dict[str, MemberState] = {}
    candidates: list[Candidate] = []
    poll_id: str | None = None
    final_plan: FinalPlan | None = None


class HangoutArtifact(BaseModel):
    plan_id: str
    place: Candidate
    time: datetime
    attendees: list[str]
    playlist: list[Track] = []
    photos: list[str] = []  # non-empty = keepsake state
    created_at: datetime | None = None


# ------------------------------------------------------- messaging shapes (B)


class ChatRef(BaseModel):
    id: str


class CardField(BaseModel):
    label: str
    value: str


class Card(BaseModel):
    title: str
    body: str
    fields: list[CardField] | None = None
    url: str | None = None


class InboundMessage(BaseModel):
    handle: str
    chat_id: str
    text: str


class PollSpec(BaseModel):
    question: str
    options: list[str]


class PollRef(BaseModel):
    id: str


class PollVote(BaseModel):
    poll_id: str
    handle: str
    option_index: int


# ---------------------------------------------------------------------- ports


class LLMRouter(Protocol):  # A — Merge Gateway; logs every call to routing_log
    async def complete(
        self, *, tier: LLMTier, input: str, system: str | None = None
    ) -> str: ...


class VenueSearch(Protocol):  # A — web search
    async def find(self, query: str, near: str) -> list[Candidate]: ...


class MessagingPort(Protocol):  # B — Photon via Node sidecar
    async def open_direct(self, handle: str) -> ChatRef: ...
    async def open_group(self, handles: list[str]) -> ChatRef: ...
    async def send_text(self, chat: ChatRef, text: str) -> None: ...
    async def set_typing(self, chat: ChatRef, on: bool) -> None: ...
    async def send_card(self, chat: ChatRef, card: Card) -> None: ...
    async def send_image(self, chat: ChatRef, path: str) -> None: ...
    async def create_poll(self, chat: ChatRef, poll: PollSpec) -> PollRef: ...
    def on_inbound(self, handler: Callable[[InboundMessage], None]) -> None: ...
    def on_poll_vote(self, handler: Callable[[PollVote], None]) -> None: ...


class ProfileStore(Protocol):  # D — profiles table
    async def get(self, handle: str) -> Profile | None: ...
    async def upsert(self, p: Profile) -> None: ...
    async def list(self) -> list[Profile]: ...


class VoiceProvider(Protocol):  # D — group-voice system prompt (flavor only)
    async def style(self) -> str: ...


class CalendarProvider(Protocol):  # D — Google free/busy (silent prior)
    async def free_busy(self, handle: str, window: Interval) -> list[Interval]: ...


class MusicProvider(Protocol):  # D — Spotify blend (compose only, never write)
    async def blend_playlist(self, handles: list[str], occasion: str) -> list[Track]: ...


class MatchingService(Protocol):  # D — fused vectors, radius prefilter, cosine rank
    async def match_nearby(self, handle: str, radius_km: float, k: int) -> list[Match]: ...


class ProfileRefresher(Protocol):  # D — A calls at plan-lock, fire-and-forget (FR13)
    async def refresh(self, replies: list[Reply]) -> None: ...


class ArtifactStore(Protocol):  # A (agent-side impl) — artifacts table; C reads via DB
    async def create(self, plan: FinalPlan, playlist: list[Track]) -> HangoutArtifact: ...
    async def get(self, plan_id: str) -> HangoutArtifact | None: ...
    async def add_photos(self, plan_id: str, urls: list[str]) -> None: ...
