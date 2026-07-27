"""The spine — "Hey Beagle" → locked plan (spec:
docs/superpowers/specs/2026-07-27-imessage-workflow-design.md).

States: intake → fanout → collect → {propose | vote} → lock → confirm.
Hybrid agentic state machine: this class owns every transition, timer, and
cap; the LLM (via src/agent/turns.py) owns content — slot-filling each
member's constraint form over multi-turn DMs, judging is_complete,
classifying group reactions, and drafting the messages.

Two close-out paths:
  - group mode (dedicated line): conversational proposal in the group chat,
    reactions classified assent/objection/chatter, one replan round, lock.
  - den mode (shared line — groups blocked server-side): the group
    experience broadcast across every member's DM — a poll lands in each DM,
    votes tally across copies, lock on quorum or vote timeout.

Context accumulation: every inbound message is appended to the message log;
the trigger chat's window is snapshotted into profiles at trigger time
(bootstrapping unknown members), and each DM window at session end (lock or
abort). Sessions are held in memory keyed by the chat they started in.
Any step failure aborts the session with a friendly message (FR9).
"""

import asyncio
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from uuid import uuid4

from src.agent.ics import build_ics
from src.agent.turns import (
    build_classify_prompt,
    build_proposal_prompt,
    build_turn_prompt,
    parse_classification,
    parse_turn,
)
from src.contracts import (
    ArtifactStore,
    CalendarProvider,
    Card,
    ChatRef,
    ContextUpdater,
    FinalPlan,
    InboundMessage,
    Interval,
    LLMRouter,
    MatchingService,
    MemberState,
    MessageLog,
    MessagingPort,
    MusicProvider,
    PollSpec,
    PollVote,
    Profile,
    ProfileStore,
    Session,
    VenueSearch,
    VoiceProvider,
)

INVOKE_RE = re.compile(r"hey\s+beagle|@beagle", re.IGNORECASE)

DM_MAX_TURNS = 4  # opening ask counts as turn 1; cap ⇒ plan with what we have

ASK_PROMPT = (
    "You are Beagle, the group's hangout dog, DMing {name} to collect their "
    "constraints for a hangout someone else kicked off: {occasion}. "
    "Greet {name} by name (never echo the request phrasing back). Personalize "
    "with what we know: {profile}. One or two sentences, sound like a friend, "
    "end with a question about when they're free and what they're feeling."
)

NUDGE_PROMPT = (
    "Draft a short heads-up nudge for {recipient}: {replier} just said "
    '"{text}" about the plan. One casual sentence asking {recipient} if that '
    "works for them too."
)

TIGHTEN_TEMPLATE = 'heads up — {name} said "{text}". does that work for you?'

ABORT_TEXT = "hmm, something went sideways on my end — let's try again in a bit 🐶"
ALREADY_ON_IT = "already on it 🐶"
NOT_A_GROUP = "add me to a group chat and say hey beagle there 🐶"
OBJECTION_ACK_FALLBACK = "heard — locking what works for most 🐶"


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


def _merge_unique(base: list[str], extra: list[str]) -> list[str]:
    return base + [x for x in extra if x not in base]


@dataclass
class DMConversation:
    chat_id: str
    handle: str
    history: list[tuple[str, str]] = field(default_factory=list)  # ("beagle"|"them", text)
    turns: int = 0
    complete: bool = False


@dataclass
class ActiveSession:
    session: Session
    state: str = "intake"
    profiles: dict[str, Profile] = field(default_factory=dict)
    dms: dict[str, DMConversation] = field(default_factory=dict)  # dm chat_id -> conv
    chosen_slot: Interval | None = None
    initiator: str = ""
    style: str = ""
    proposal_text: str = ""
    assents: set[str] = field(default_factory=set)
    replan_rounds: int = 0
    votes: dict[str, int] = field(default_factory=dict)  # handle -> option_index
    poll_ids: set[str] = field(default_factory=set)  # den mode: one poll per member DM
    timers: list[asyncio.Task] = field(default_factory=list)

    def complete_handles(self) -> list[str]:
        return [c.handle for c in self.dms.values() if c.complete]


class Orchestrator:
    def __init__(
        self,
        *,
        messaging: MessagingPort,
        llm: LLMRouter,
        profiles: ProfileStore,
        context: ContextUpdater,
        message_log: MessageLog,
        voice: VoiceProvider,
        calendar: CalendarProvider,
        music: MusicProvider,
        matching: MatchingService,
        venues: VenueSearch,
        artifacts: ArtifactStore,
        near: str = "San Francisco",
        reply_timeout_s: float | None = None,  # None = wait for full quorum
        propose_timeout_s: float | None = None,  # group mode: armed at proposal
        vote_timeout_s: float | None = None,  # den mode: armed at first vote
        voice_notes=None,  # optional VoiceNotes — spoken confirm when enabled
        den_mode: bool = False,  # shared-line groups blocked -> broadcast to member DMs
    ):
        self.reply_timeout_s = reply_timeout_s
        self.propose_timeout_s = propose_timeout_s
        self.vote_timeout_s = vote_timeout_s
        self.den_mode = den_mode
        self._voice_notes = voice_notes
        self._messaging = messaging
        self._llm = llm
        self._profiles = profiles
        self._context = context
        self._log = message_log
        self._voice = voice
        self._calendar = calendar
        self._music = music
        self._matching = matching
        self._venues = venues
        self._artifacts = artifacts
        self._near = near
        self.sessions: dict[str, ActiveSession] = {}

    # ------------------------------------------------------------ entry point

    def start(self) -> None:
        """Wire the live event streams (consolidation); tests await handlers."""
        loop = asyncio.get_event_loop()
        self._messaging.on_inbound(
            lambda m: loop.create_task(self.handle_inbound(m))
        )
        self._messaging.on_poll_vote(
            lambda v: loop.create_task(self.handle_poll_vote(v))
        )

    async def handle_inbound(self, m: InboundMessage) -> None:
        await self._log.append(m.chat_id, m.handle, "in", m.text)
        active_dm = self._session_for_dm(m.chat_id)
        active_group = self.sessions.get(m.chat_id)
        try:
            if active_dm is not None and active_dm.state == "collect":
                await self._dm_turn(active_dm, m)
            elif active_group is not None:
                if active_group.state == "propose":
                    await self._group_message(active_group, m)
                elif INVOKE_RE.search(m.text):
                    await self._messaging.send_text(
                        ChatRef(id=m.chat_id), ALREADY_ON_IT
                    )
            elif INVOKE_RE.search(m.text):
                await self._start_session(m)
        except Exception:  # fail closed, never crash the listener
            await self._abort(active_dm or active_group or self.sessions.get(m.chat_id))

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

    def _session_for_dm(self, chat_id: str) -> "ActiveSession | None":
        return next((a for a in self.sessions.values() if chat_id in a.dms), None)

    async def _group_chats(self, active: "ActiveSession") -> list[ChatRef]:
        """Where 'group' messages go: the group chat, or (den mode) every
        member's DM — the group experience without a group thread."""
        if not self.den_mode:
            return [ChatRef(id=active.session.group_chat_id)]
        return [
            await self._messaging.open_direct(h) for h in active.session.members
        ]

    # ------------------------------------------------- intake: snapshot first

    async def _start_session(self, m: InboundMessage) -> None:
        chat = ChatRef(id=m.chat_id)
        participants = await self._messaging.get_participants(chat)
        if len(participants) < 2:
            if not self.den_mode:
                await self._messaging.send_text(chat, NOT_A_GROUP)
                return
            # den mode: no group thread exists anywhere — the whole roster is in
            participants = [p.handle for p in await self._profiles.list()]

        # trigger-time snapshot: distills the chat window since the last
        # bookmark and bootstraps profiles for unknown members
        await self._context.snapshot(m.chat_id, participants)

        profiles: dict[str, Profile] = {}
        for handle in participants:
            profiles[handle] = (
                await self._profiles.get(handle) or Profile(handle=handle, name=handle)
            )

        now = datetime.now()
        session = Session(
            session_id=str(uuid4()),
            occasion=INVOKE_RE.sub("", m.text).strip(" ,.!-") or "a hangout",
            date_window=Interval(start=now, end=now + timedelta(days=7)),
            group_chat_id=m.chat_id,
            members=participants,
            member_states={h: MemberState() for h in participants},
        )
        active = ActiveSession(session=session, profiles=profiles, initiator=m.handle)
        self.sessions[m.chat_id] = active
        await self._fan_out(active)

    # ------------------------------------------------ ordered hybrid fan-out

    async def _fan_out(self, active: ActiveSession) -> None:
        active.state = "fanout"
        active.style = await self._voice.style()
        ordered = sorted(
            active.profiles.values(), key=lambda p: p.constraint_score, reverse=True
        )
        for profile in ordered:  # most-constrained first; never blocks on replies
            ask = await self._llm.complete(
                tier="frontier",
                system=active.style,
                input=ASK_PROMPT.format(
                    name=profile.name,
                    occasion=active.session.occasion,
                    profile=profile.model_dump_json(
                        include={"cuisines", "vibe", "hard_nos", "typical_availability"}
                    ),
                ),
            )
            dm = await self._messaging.open_direct(profile.handle)
            active.dms[dm.id] = DMConversation(
                chat_id=dm.id,
                handle=profile.handle,
                history=[("beagle", ask)],
                turns=1,
            )
            await self._send_typed(dm, ask)
        active.state = "collect"
        if self.reply_timeout_s is not None:
            active.timers.append(asyncio.create_task(self._reply_timer(active)))

    async def _send_typed(self, chat: ChatRef, text: str) -> None:
        await self._messaging.set_typing(chat, True)
        await self._messaging.send_text(chat, text)
        await self._messaging.set_typing(chat, False)

    async def _reply_timer(self, active: ActiveSession) -> None:
        await asyncio.sleep(self.reply_timeout_s)
        if active.state == "collect" and active.complete_handles():
            try:
                await self._close_collect(active)  # quorum-by-timeout (FR4)
            except Exception:
                await self._abort(active)

    # ------------------------------------------- collect: multi-turn DM legs

    async def _dm_turn(self, active: ActiveSession, m: InboundMessage) -> None:
        conv = active.dms[m.chat_id]
        if conv.complete:
            return
        conv.history.append(("them", m.text))
        window = active.session.date_window
        raw = await self._llm.complete(
            tier="frontier",
            system=active.style,
            input=build_turn_prompt(
                name=active.profiles[conv.handle].name,
                occasion=active.session.occasion,
                form=active.session.member_states[conv.handle],
                history=conv.history,
                window_start=window.start.isoformat(),
                window_end=window.end.isoformat(),
            ),
        )
        turn = parse_turn(raw)
        active.session.member_states[conv.handle] = MemberState(
            availability=turn.availability,
            prefs=turn.prefs,
            hard_nos=turn.hard_nos,
            replied=True,  # live reply overrides stale profile (FR13)
        )
        if turn.is_complete or conv.turns >= DM_MAX_TURNS:
            conv.complete = True
            await self._tighten(active, replier=conv.handle, reply_text=m.text)
            if all(c.complete for c in active.dms.values()):
                await self._close_collect(active)
        else:
            conv.turns += 1
            await self._send_typed(ChatRef(id=conv.chat_id), turn.reply_text)
            conv.history.append(("beagle", turn.reply_text))

    async def _tighten(self, active: ActiveSession, *, replier: str, reply_text: str) -> None:
        """Hybrid fan-out: constrained answers sharpen the ask for the rest.

        Nudges are LLM-drafted in the group's voice so they read like the
        conversation, not a template; the template is only the fail-soft.
        """
        name = active.profiles[replier].name
        for conv in active.dms.values():
            if conv.handle == replier or conv.complete:
                continue
            try:
                nudge = await self._llm.complete(
                    tier="frontier",
                    system=active.style,
                    input=NUDGE_PROMPT.format(
                        recipient=active.profiles[conv.handle].name,
                        replier=name,
                        text=reply_text,
                    ),
                )
            except Exception:
                nudge = TIGHTEN_TEMPLATE.format(name=name, text=reply_text)
            await self._messaging.send_text(ChatRef(id=conv.chat_id), nudge)
            conv.history.append(("beagle", nudge))

    async def _close_collect(self, active: ActiveSession) -> None:
        """Collect is done — den mode votes with polls, group mode proposes."""
        if self.den_mode:
            await self._open_polls(active)
        else:
            await self._propose(active)

    # ---------------------------------------- reconcile (shared by both paths)

    async def _reconcile_slots(self, active: ActiveSession) -> None:
        active.state = "reconcile"
        session = active.session
        replied = {h: session.member_states[h] for h in active.complete_handles()}

        slots: list[Interval] | None = None
        for handle, state in replied.items():
            avail = _subtract(
                state.availability,
                await self._calendar.free_busy(handle, session.date_window),
            )
            slots = avail if slots is None else _intersect(slots, avail)
        if not slots:
            raise RuntimeError("no overlapping availability")  # → fail-closed abort
        active.chosen_slot = slots[0]

        hard_nos = [n for s in replied.values() for n in s.hard_nos]
        prefs = [p for s in replied.values() for p in s.prefs if p not in hard_nos]
        query = f"{session.occasion} — group likes: {', '.join(dict.fromkeys(prefs))}"
        if hard_nos:
            query += f"; avoid: {', '.join(dict.fromkeys(hard_nos))}"
        session.candidates = await self._venues.find(query, self._near)

    # ------------------------------- den mode: text-emulated polls over DMs

    async def _open_polls(self, active: ActiveSession) -> None:
        await self._reconcile_slots(active)
        session = active.session
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

    # ------------------------- group mode: reconcile + conversational proposal

    async def _propose(self, active: ActiveSession) -> None:
        await self._reconcile_slots(active)
        session = active.session
        top = session.candidates[0]
        active.proposal_text = await self._llm.complete(
            tier="frontier",
            system=active.style,
            input=build_proposal_prompt(
                occasion=session.occasion,
                venue=top.name,
                area=top.area,
                when=active.chosen_slot.start.strftime("%a %b %-d, %-I:%M %p"),
                names=[active.profiles[h].name for h in active.complete_handles()],
                revision=active.replan_rounds > 0,
            ),
        )
        await self._messaging.send_text(ChatRef(id=session.group_chat_id), active.proposal_text)
        active.state = "propose"
        if self.propose_timeout_s is not None:
            active.timers.append(asyncio.create_task(self._propose_timer(active)))

    async def _propose_timer(self, active: ActiveSession) -> None:
        await asyncio.sleep(self.propose_timeout_s)
        if active.state == "propose":
            try:
                await self._lock(active)  # lock on timeout with partial assents
            except Exception:
                await self._abort(active)

    async def _group_message(self, active: ActiveSession, m: InboundMessage) -> None:
        if m.handle not in active.session.member_states:
            return  # not a member of this hangout
        window = active.session.date_window
        raw = await self._llm.complete(
            tier="cheap",
            system=active.style,  # objection acks come back in the group's voice
            input=build_classify_prompt(
                name=active.profiles[m.handle].name,
                proposal=active.proposal_text,
                text=m.text,
                window_start=window.start.isoformat(),
                window_end=window.end.isoformat(),
            ),
        )
        reaction = parse_classification(raw)

        if reaction.kind == "assent":
            active.assents.add(m.handle)
            if set(active.complete_handles()) <= active.assents:
                await self._lock(active)
        elif reaction.kind == "objection":
            if active.replan_rounds == 0:
                state = active.session.member_states[m.handle]
                if reaction.availability:
                    state.availability = reaction.availability  # new conflict wins
                state.prefs = _merge_unique(state.prefs, reaction.prefs)
                state.hard_nos = _merge_unique(state.hard_nos, reaction.hard_nos)
                state.replied = True
                active.replan_rounds = 1
                active.assents.clear()
                await self._propose(active)
            else:  # one replan max — acknowledge and let the timer close it out
                await self._messaging.send_text(
                    ChatRef(id=active.session.group_chat_id),
                    reaction.reply_text or OBJECTION_ACK_FALLBACK,
                )
        # chatter: no reply, no state change (still in the message log)

    # ------------------------------------------ lock, confirm, snapshot, done

    async def _lock(self, active: ActiveSession) -> None:
        active.state = "lock"
        session = active.session
        if active.votes:  # den mode: majority of poll votes
            (winner_idx, _), = Counter(active.votes.values()).most_common(1)
            winner = session.candidates[winner_idx]
        else:  # group mode: the (re)proposed top candidate
            winner = session.candidates[0]
        attendees = active.complete_handles()
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
        await self._send_match_card(active)
        await self._snapshot_dms(active)  # session-end context capture
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

    async def _snapshot_dms(self, active: ActiveSession) -> None:
        """DM windows → profiles at session end; learnings survive aborts."""
        for conv in active.dms.values():
            try:
                await self._context.snapshot(conv.chat_id, [conv.handle])
            except Exception:
                continue  # context capture never blocks the close-out

    # --------------------------------------------------------- fail closed

    async def _abort(self, active: "ActiveSession | None") -> None:
        if active is None:
            return
        try:
            for gc in await self._group_chats(active):
                await self._messaging.send_text(gc, ABORT_TEXT)
        finally:
            await self._snapshot_dms(active)
            self._cleanup(active)

    def _cleanup(self, active: ActiveSession) -> None:
        for t in active.timers:
            t.cancel()
        self.sessions.pop(active.session.group_chat_id, None)
