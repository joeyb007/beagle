"""T3-T12: the spine — "Hey Beagle" → locked plan (docs/branch-a.md).

States: intake → fanout → collect → reconcile → vote → lock → confirm.
Sessions are held in memory keyed by the group chat id they started in.
Any step failure aborts the session with a friendly message (FR9).
"""

import asyncio
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from uuid import uuid4

from src.agent.ics import build_ics
from src.contracts import (
    ArtifactStore,
    CalendarProvider,
    ChatRef,
    InboundMessage,
    Interval,
    PollSpec,
    LLMRouter,
    MatchingService,
    MemberState,
    MessagingPort,
    MusicProvider,
    Profile,
    ProfileRefresher,
    ProfileStore,
    Reply,
    Session,
    VenueSearch,
    VoiceProvider,
)
from src.contracts import Card, FinalPlan, PollVote

INVOKE_RE = re.compile(r"hey\s+beagle|@beagle", re.IGNORECASE)

ASK_PROMPT = (
    "You are Beagle, the group's hangout dog, DMing {name} to collect their "
    "constraints for a hangout someone else kicked off: {occasion}. "
    "Greet {name} by name (never echo the request phrasing back). Personalize "
    "with what we know: {profile}. One or two sentences, sound like a friend, "
    "end with a question about when they're free and what they're feeling."
)

CONVERSE_PROMPT = (
    "You are collecting one friend's constraints for a hangout. Their DM "
    "conversation so far (their messages only, oldest first):\n{transcript}\n\n"
    "Derive their CURRENT overall answer from the WHOLE conversation and reply "
    "with JSON, exactly these keys: "
    '{{"availability": [{{"start": ISO8601, "end": ISO8601}}], '
    '"prefs": [str], "hard_nos": [str], '
    '"complete": bool, "follow_up": str|null}}. '
    "Resolve relative days within {window_start} .. {window_end}. "
    "complete=true when you know when they're free AND roughly what they'd "
    "enjoy; if not complete, follow_up is ONE short friendly question to get "
    "what's missing. JSON only."
)

TIGHTEN_TEMPLATE = 'heads up — {name} said "{text}". does that work for you?'


def _strip_fences(raw: str) -> str:
    return re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())


def _overlap(a: Interval, b: Interval) -> Interval | None:
    start, end = max(a.start, b.start), min(a.end, b.end)
    return Interval(start=start, end=end) if start < end else None


def _intersect(xs: list[Interval], ys: list[Interval]) -> list[Interval]:
    return [o for x in xs for y in ys if (o := _overlap(x, y))]


def _subtract(slots: list[Interval], busy: list[Interval]) -> list[Interval]:
    for b in busy:
        nxt: list[Interval] = []
        for s in slots:
            if b.end <= s.start or b.start >= s.end:  # no collision
                nxt.append(s)
                continue
            if s.start < b.start:
                nxt.append(Interval(start=s.start, end=b.start))
            if b.end < s.end:
                nxt.append(Interval(start=b.end, end=s.end))
        slots = nxt
    return slots


ABORT_TEXT = "hmm, something went sideways on my end — let's try again in a bit 🐶"


@dataclass
class ActiveSession:
    session: Session
    state: str = "intake"
    profiles: dict[str, Profile] = field(default_factory=dict)
    dm_chats: dict[str, str] = field(default_factory=dict)  # dm chat_id -> handle
    chosen_slot: Interval | None = None
    initiator: str = ""
    replies: list[Reply] = field(default_factory=list)
    threads: dict[str, list[str]] = field(default_factory=dict)  # handle -> their msgs
    follow_ups: dict[str, int] = field(default_factory=dict)  # handle -> asks sent
    votes: dict[str, int] = field(default_factory=dict)  # handle -> option_index
    poll_ids: set[str] = field(default_factory=set)  # den mode: one poll per member DM
    timers: list[asyncio.Task] = field(default_factory=list)


class Orchestrator:
    def __init__(
        self,
        *,
        messaging: MessagingPort,
        llm: LLMRouter,
        profiles: ProfileStore,
        refresher: ProfileRefresher,
        voice: VoiceProvider,
        calendar: CalendarProvider,
        music: MusicProvider,
        matching: MatchingService,
        venues: VenueSearch,
        artifacts: ArtifactStore,
        near: str = "San Francisco",
        reply_timeout_s: float | None = None,  # None = wait for full quorum
        vote_timeout_s: float | None = None,  # armed at first vote when set
        max_follow_ups: int = 5,  # agentic clarification, runaway-capped
        voice_notes=None,  # optional VoiceNotes — spoken confirm when enabled
        den_mode: bool = False,  # shared-line groups blocked -> broadcast to member DMs
    ):
        self._voice_notes = voice_notes
        self.den_mode = den_mode
        self.reply_timeout_s = reply_timeout_s
        self.vote_timeout_s = vote_timeout_s
        self.max_follow_ups = max_follow_ups
        self._messaging = messaging
        self._llm = llm
        self._profiles = profiles
        self._refresher = refresher
        self._voice = voice
        self._calendar = calendar
        self._music = music
        self._matching = matching
        self._venues = venues
        self._artifacts = artifacts
        self._near = near
        self.sessions: dict[str, ActiveSession] = {}

    # ------------------------------------------------- entry points (T4, T8)

    def start(self) -> None:
        """Wire live event streams (consolidation); tests await handlers directly."""
        loop = asyncio.get_event_loop()
        self._messaging.on_inbound(
            lambda m: loop.create_task(self.handle_inbound(m))
        )
        self._messaging.on_poll_vote(
            lambda v: loop.create_task(self.handle_poll_vote(v))
        )

    async def handle_inbound(self, m: InboundMessage) -> None:
        active = self._session_for_dm(m.chat_id)
        try:
            if active is not None and active.state == "collect":
                await self._collect(active, m)
            elif m.chat_id not in self.sessions and INVOKE_RE.search(m.text):
                await self._start_session(m)
        except Exception:  # T10: fail closed, never crash the listener
            await self._abort(active or self.sessions.get(m.chat_id))

    async def handle_poll_vote(self, v: PollVote) -> None:
        active = next(
            (
                a
                for a in self.sessions.values()
                if a.session.poll_id == v.poll_id or v.poll_id in a.poll_ids
            ),
            None,
        )
        if active is None or active.state != "vote":
            return
        try:
            await self._record_vote(active, v)
        except Exception:
            await self._abort(active)

    async def _group_chats(self, active: "ActiveSession") -> list[ChatRef]:
        """Where 'group' messages go: the group chat, or (den mode) every
        member's DM — the group experience without a group thread."""
        if not self.den_mode:
            return [ChatRef(id=active.session.group_chat_id)]
        return [
            await self._messaging.open_direct(h) for h in active.session.members
        ]

    def _session_for_dm(self, chat_id: str) -> "ActiveSession | None":
        return next(
            (a for a in self.sessions.values() if chat_id in a.dm_chats), None
        )

    async def _start_session(self, m: InboundMessage) -> None:
        now = datetime.now()
        members = await self._profiles.list()
        session = Session(
            session_id=str(uuid4()),
            occasion=INVOKE_RE.sub("", m.text).strip(" ,.!-") or "a hangout",
            date_window=Interval(start=now, end=now + timedelta(days=7)),
            group_chat_id=m.chat_id,
            members=[p.handle for p in members],
            member_states={p.handle: MemberState() for p in members},
        )
        active = ActiveSession(
            session=session,
            profiles={p.handle: p for p in members},
            initiator=m.handle,
        )
        self.sessions[m.chat_id] = active
        await self._fan_out(active)

    # -------------------------------------------- T5: ordered hybrid fan-out

    async def _fan_out(self, active: ActiveSession) -> None:
        active.state = "fanout"
        style = await self._voice.style()
        ordered = sorted(
            active.profiles.values(), key=lambda p: p.constraint_score, reverse=True
        )
        for profile in ordered:  # most-constrained first; never blocks on replies
            ask = await self._llm.complete(
                tier="frontier",
                system=style,
                input=ASK_PROMPT.format(
                    name=profile.name,
                    occasion=active.session.occasion,
                    profile=profile.model_dump_json(
                        include={"cuisines", "vibe", "hard_nos", "typical_availability"}
                    ),
                ),
            )
            dm = await self._messaging.open_direct(profile.handle)
            active.dm_chats[dm.id] = profile.handle
            await self._messaging.set_typing(dm, True)
            await self._messaging.send_text(dm, ask)
            await self._messaging.set_typing(dm, False)
        active.state = "collect"
        if self.reply_timeout_s is not None:
            active.timers.append(asyncio.create_task(self._reply_timer(active)))

    async def _reply_timer(self, active: ActiveSession) -> None:
        await asyncio.sleep(self.reply_timeout_s)
        if active.state == "collect" and any(
            s.replied for s in active.session.member_states.values()
        ):
            try:
                await self._reconcile(active)  # quorum-by-timeout (FR4)
            except Exception:
                await self._abort(active)

    # ------------------- T6: agentic collect — Beagle decides when it's done

    async def _collect(self, active: ActiveSession, m: InboundMessage) -> None:
        import json as _json

        handle = active.dm_chats[m.chat_id]
        active.threads.setdefault(handle, []).append(m.text)
        active.replies.append(Reply(handle=handle, text=m.text))
        window = active.session.date_window

        raw = await self._llm.complete(
            tier="cheap",
            input=CONVERSE_PROMPT.format(
                transcript="\n".join(active.threads[handle]),
                window_start=window.start.isoformat(),
                window_end=window.end.isoformat(),
            ),
        )
        data = _json.loads(_strip_fences(raw))
        state = MemberState(  # re-derived from the FULL transcript each turn
            availability=data.get("availability") or [],
            prefs=data.get("prefs") or [],
            hard_nos=data.get("hard_nos") or [],
        )
        active.session.member_states[handle] = state

        follow_up = data.get("follow_up")
        incomplete = data.get("complete") is False
        under_cap = active.follow_ups.get(handle, 0) < self.max_follow_ups
        if incomplete and follow_up and under_cap:
            active.follow_ups[handle] = active.follow_ups.get(handle, 0) + 1
            await self._messaging.send_text(ChatRef(id=m.chat_id), follow_up)
            return  # not done with this member — keep the conversation open

        state.replied = True  # complete (or cap hit): take it and move on (FR13)
        await self._tighten(active, replier=handle, reply_text=m.text)
        if all(s.replied for s in active.session.member_states.values()):
            await self._reconcile(active)

    async def _tighten(self, active: ActiveSession, *, replier: str, reply_text: str) -> None:
        """Hybrid fan-out: constrained answers sharpen the ask for the rest."""
        name = active.profiles[replier].name
        nudge = TIGHTEN_TEMPLATE.format(name=name, text=reply_text)
        for chat_id, handle in active.dm_chats.items():
            if handle != replier and not active.session.member_states[handle].replied:
                await self._messaging.send_text(ChatRef(id=chat_id), nudge)

    # --------------------------------------------------------- T7: reconcile

    async def _reconcile(self, active: ActiveSession) -> None:
        active.state = "reconcile"
        session = active.session
        replied = {h: s for h, s in session.member_states.items() if s.replied}

        slots: list[Interval] | None = None
        for handle, state in replied.items():
            avail = _subtract(
                state.availability,
                await self._calendar.free_busy(handle, session.date_window),
            )
            slots = avail if slots is None else _intersect(slots, avail)
        if not slots:
            raise RuntimeError("no overlapping availability")  # happy path only (FR9)
        active.chosen_slot = slots[0]

        hard_nos = [n for s in replied.values() for n in s.hard_nos]
        prefs = [p for s in replied.values() for p in s.prefs if p not in hard_nos]
        query = f"{session.occasion} — group likes: {', '.join(dict.fromkeys(prefs))}"
        if hard_nos:
            query += f"; avoid: {', '.join(dict.fromkeys(hard_nos))}"
        session.candidates = await self._venues.find(query, self._near)

        spec = PollSpec(
            question="beagle says: where are we going?",
            options=[c.name for c in session.candidates],
        )
        for chat in await self._group_chats(active):
            poll = await self._messaging.create_poll(chat, spec)
            active.poll_ids.add(poll.id)
            if session.poll_id is None:
                session.poll_id = poll.id
        active.state = "vote"  # only after poll_ids are set — votes match on them

    # -------------------------------------------------------- T8: vote+tally

    async def _record_vote(self, active: ActiveSession, v: PollVote) -> None:
        active.votes[v.handle] = v.option_index
        if self.vote_timeout_s is not None and not any(
            not t.done() and t.get_coro().__name__ == "_vote_timer"
            for t in active.timers
        ):
            active.timers.append(asyncio.create_task(self._vote_timer(active)))
        replied = [h for h, s in active.session.member_states.items() if s.replied]
        if all(h in active.votes for h in replied):  # threshold: everyone voted
            await self._lock(active)

    async def _vote_timer(self, active: ActiveSession) -> None:
        await asyncio.sleep(self.vote_timeout_s)
        if active.state == "vote" and active.votes:
            try:
                await self._lock(active)  # lock on timeout with partial votes (FR7)
            except Exception:
                await self._abort(active)

    # --------------------------------- T9 lock+confirm, T11 match, T12 refresh

    async def _lock(self, active: ActiveSession) -> None:
        active.state = "lock"
        session = active.session
        (winner_idx, _), = Counter(active.votes.values()).most_common(1)
        winner = session.candidates[winner_idx]
        attendees = [h for h, s in session.member_states.items() if s.replied]
        plan = FinalPlan(
            plan_id=str(uuid4()),
            place=winner,
            time=active.chosen_slot.start,
            attendees=attendees,
        )
        session.final_plan = plan

        playlist = await self._music.blend_playlist(attendees, session.occasion)
        await self._artifacts.create(plan, playlist)

        active.state = "confirm"
        names = ", ".join(active.profiles[h].name for h in attendees)
        when = plan.time.strftime("%a %b %-d, %-I:%M %p")
        group_chats = await self._group_chats(active)
        for gc in group_chats:
            await self._messaging.send_card(
                gc,
                Card(
                    title=f"🐶 locked in: {winner.name}",
                    body=f"{when} — {names}. playlist's on the hangout page.",
                    fields=None,
                    url=None,
                ),
            )
        # the chat transforms around the plan: confetti burst + group rename,
        # then a tappable calendar invite. cosmetic — never let it kill a lock.
        for gc in group_chats:
            try:
                await self._messaging.celebrate(
                    gc,
                    f"it's happening — {winner.name}, {when} 🎉",
                    # renaming only makes sense on a real group thread
                    name=None if self.den_mode else
                    f"🐶 {winner.name} · {plan.time.strftime('%a %-I:%M%p').lower()}",
                )
            except Exception as e:
                print(f"[orchestrator] celebrate failed (non-fatal): {e}")
        try:
            names_list = [active.profiles[h].name for h in attendees]
            ics_path = build_ics(plan, names_list)
            for gc in group_chats:
                await self._messaging.send_file(gc, ics_path)
        except Exception as e:
            print(f"[orchestrator] ics send failed (non-fatal): {e}")
        if self._voice_notes and self._voice_notes.enabled:
            try:
                spoken = await self._llm.complete(
                    tier="cheap",
                    input=(
                        "Write a 15-25 word spoken voice-note from Beagle, the group's "
                        f"hangout dog, hyping the locked plan: {winner.name}, {when}, with "
                        f"{names}. Warm, casual, like a friend leaving a quick voice memo. "
                        "No emoji, no stage directions — just the words to speak."
                    ),
                )
                audio = await self._voice_notes.synthesize(spoken)
                if audio:
                    for gc in group_chats:
                        await self._messaging.send_voice(gc, audio)
            except Exception as e:
                print(f"[orchestrator] voice note failed (non-fatal): {e}")
        await self._send_match_card(active)  # T11 — after confirm
        try:
            await self._refresher.refresh(active.replies)  # T12 — never blocks
        except Exception:
            pass
        self._cleanup(active)

    async def _send_match_card(self, active: ActiveSession) -> None:
        matches = await self._matching.match_nearby(active.initiator, 10.0, 1)
        if not matches:
            return
        top = matches[0]
        card = Card(
            title="🐶 someone nearby you'd click with",
            body=f"{top.match_name} — {'; '.join(top.reasons)}",
            fields=None,
            url=None,
        )
        for gc in await self._group_chats(active):
            await self._messaging.send_card(gc, card)

    # ------------------------------------------------------- T10: fail closed

    async def _abort(self, active: "ActiveSession | None") -> None:
        if active is None:
            return
        try:
            for gc in await self._group_chats(active):
                await self._messaging.send_text(gc, ABORT_TEXT)
        finally:
            self._cleanup(active)

    def _cleanup(self, active: ActiveSession) -> None:
        for t in active.timers:
            t.cancel()
        self.sessions.pop(active.session.group_chat_id, None)
