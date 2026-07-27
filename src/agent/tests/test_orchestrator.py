"""Orchestrator state machine over stub ports — group-first conversational flow.

Covers: trigger via real group membership + trigger-time snapshot, ordered
fan-out, multi-turn DM collection (clarify loop, cap, tighten), conversational
propose/objection/lock, session-end DM snapshots, message logging, guards.
"""

import asyncio

import pytest

from src.agent.orchestrator import (
    ALREADY_ON_IT,
    NOT_A_GROUP,
    Orchestrator,
)
from src.agent.stubs import (
    ScriptedLLM,
    StubArtifactStore,
    StubCalendar,
    StubContextUpdater,
    StubMatching,
    StubMessageLog,
    StubMessaging,
    StubMusic,
    StubProfileStore,
    StubVoice,
)
from src.contracts import Candidate, InboundMessage

RAYHAN, MAYA, NEWBIE = "+15550000001", "+15550000002", "+15550000003"

# --- canned LLM turn/classify JSON ------------------------------------------

RAYHAN_DONE = (
    '{"availability": [{"start": "2026-08-01T18:00:00", "end": "2026-08-01T22:00:00"}],'
    ' "prefs": ["sushi"], "hard_nos": ["clubs"], "is_complete": true, "reply_text": ""}'
)
MAYA_DONE = (  # spans into Aug 2 so the objection-replan intersection stays non-empty
    '{"availability": [{"start": "2026-08-01T19:00:00", "end": "2026-08-02T23:00:00"}],'
    ' "prefs": ["tacos"], "hard_nos": [], "is_complete": true, "reply_text": ""}'
)
VAGUE_TURN = (
    '{"availability": [], "prefs": [], "hard_nos": [],'
    ' "is_complete": false, "reply_text": "which day actually works for you?"}'
)
ASSENT = '{"kind": "assent"}'
CHATTER = '{"kind": "chatter"}'
OBJECTION = (
    '{"kind": "objection", "availability": [{"start": "2026-08-02T18:00:00",'
    ' "end": "2026-08-02T22:00:00"}], "prefs": [], "hard_nos": ["no sushi"],'
    ' "reply_text": "got it — adjusting"}'
)

PROPOSAL_TEXT = "tacos el rey sat 7pm — that work for everyone?"


class FakeVenues:
    def __init__(self, fail: bool = False):
        self.calls: list[tuple[str, str]] = []
        self.fail = fail

    async def find(self, query, near):
        if self.fail:
            raise RuntimeError("venue search down")
        self.calls.append((query, near))
        return [Candidate(name="Tacos El Rey"), Candidate(name="Ebisu Sushi")]


def scripted_llm():
    """Rules ordered: reply/classify needles first (they appear inside turn and
    classify prompts), then name-keyed opening asks, then the proposal draft."""
    return ScriptedLLM(
        rules=[
            # "free after 7" first: Maya's turn prompt may also contain Rayhan's
            # words via the tighten nudge quoted into her history
            ("free after 7", MAYA_DONE),
            ("only do saturday evening", RAYHAN_DONE),
            ("idk whenever", VAGUE_TURN),
            ("works for me", ASSENT),
            ("down!!", ASSENT),
            ("lmaooo", CHATTER),
            ("actually i cant do saturday", OBJECTION),
            ("still cant make it", OBJECTION),
            # before the name rules: the proposal prompt also contains names
            ("Tacos El Rey", PROPOSAL_TEXT),
            ("Rayhan", "yo rayhan — sat or sun? still sushi?"),
            ("Maya", "maya! tacos this weekend?"),
        ]
    )


def make_orchestrator(**overrides):
    deps = dict(
        messaging=StubMessaging(),
        llm=scripted_llm(),
        profiles=StubProfileStore(),
        context=StubContextUpdater(),
        message_log=StubMessageLog(),
        voice=StubVoice(),
        calendar=StubCalendar(),
        music=StubMusic(),
        matching=StubMatching(),
        venues=FakeVenues(),
        artifacts=StubArtifactStore(),
    )
    deps.update(overrides)
    return Orchestrator(**deps), deps


def group_msg(text, handle=RAYHAN, chat="g1"):
    return InboundMessage(handle=handle, chat_id=chat, text=text)


async def start_session(orch):
    await orch.handle_inbound(group_msg("Hey Beagle, dinner this weekend?"))
    return orch.sessions["g1"]


async def collect_all(orch):
    """Drive both DM legs to completion; returns the active session."""
    active = await start_session(orch)
    await orch.handle_inbound(
        InboundMessage(handle=RAYHAN, chat_id=f"dm-{RAYHAN}", text="only do saturday evening")
    )
    await orch.handle_inbound(
        InboundMessage(handle=MAYA, chat_id=f"dm-{MAYA}", text="free after 7")
    )
    return active


# ------------------------------------------------------------------- intake


async def test_non_trigger_message_creates_no_session():
    orch, _ = make_orchestrator()
    await orch.handle_inbound(group_msg("lol what a day"))
    assert orch.sessions == {}


async def test_trigger_uses_group_membership_and_snapshots_first():
    orch, deps = make_orchestrator()
    active = await start_session(orch)
    assert set(active.session.members) == {RAYHAN, MAYA}
    # trigger-time snapshot of the group window, before any DM went out
    assert deps["context"].snapshots[0] == ("g1", (RAYHAN, MAYA))


async def test_trigger_outside_a_group_gets_redirect_and_no_session():
    orch, deps = make_orchestrator()
    deps["messaging"].groups["solo"] = [RAYHAN]
    await orch.handle_inbound(group_msg("hey beagle", chat="solo"))
    assert "solo" not in orch.sessions
    assert (("solo", NOT_A_GROUP)) in deps["messaging"].texts


async def test_unknown_member_bootstrapped_into_session():
    orch, deps = make_orchestrator()
    deps["messaging"].groups["g1"].append(NEWBIE)
    active = await start_session(orch)
    assert NEWBIE in active.session.member_states
    assert any(c == f"dm-{NEWBIE}" for c, _ in deps["messaging"].texts)


async def test_inbound_messages_are_logged():
    orch, deps = make_orchestrator()
    await start_session(orch)
    assert deps["message_log"].rows[0] == (
        "g1", RAYHAN, "in", "Hey Beagle, dinner this weekend?"
    )


# ------------------------------------------------------------------ fan-out


async def test_fanout_dms_most_constrained_first_with_typing_and_voice():
    orch, deps = make_orchestrator()
    active = await start_session(orch)
    m = deps["messaging"]
    assert [c for c, _ in m.texts] == [f"dm-{RAYHAN}", f"dm-{MAYA}"]
    assert m.texts[0][1] == "yo rayhan — sat or sun? still sushi?"
    assert (f"dm-{RAYHAN}", True) in m.typing
    ask_calls = [c for c in deps["llm"].calls if "Rayhan" in c["input"]]
    assert "dry humor" in ask_calls[0]["system"]
    assert active.state == "collect"
    # the opening ask seeds each DM conversation history
    assert active.dms[f"dm-{RAYHAN}"].history[0] == (
        "beagle", "yo rayhan — sat or sun? still sushi?"
    )


# ----------------------------------------------------- multi-turn collection


async def test_vague_reply_gets_followup_and_member_stays_incomplete():
    orch, deps = make_orchestrator()
    active = await start_session(orch)
    await orch.handle_inbound(
        InboundMessage(handle=RAYHAN, chat_id=f"dm-{RAYHAN}", text="idk whenever")
    )
    conv = active.dms[f"dm-{RAYHAN}"]
    assert not conv.complete and conv.turns == 2
    assert "which day actually works for you?" in deps["messaging"].texts_to(f"dm-{RAYHAN}")
    assert active.state == "collect"


async def test_complete_reply_marks_member_and_tightens_others():
    orch, deps = make_orchestrator()
    active = await start_session(orch)
    await orch.handle_inbound(
        InboundMessage(handle=RAYHAN, chat_id=f"dm-{RAYHAN}", text="only do saturday evening")
    )
    assert active.dms[f"dm-{RAYHAN}"].complete
    state = active.session.member_states[RAYHAN]
    assert state.replied and state.prefs == ["sushi"]
    nudges = [t for t in deps["messaging"].texts_to(f"dm-{MAYA}") if "heads up" in t]
    assert nudges and "Rayhan" in nudges[0]
    # nudge lands in Maya's history so her turn LLM sees it
    assert ("beagle", nudges[0]) in active.dms[f"dm-{MAYA}"].history


async def test_turn_cap_forces_completion():
    orch, _ = make_orchestrator()
    active = await start_session(orch)
    for _ in range(4):
        await orch.handle_inbound(
            InboundMessage(handle=RAYHAN, chat_id=f"dm-{RAYHAN}", text="idk whenever")
        )
    assert active.dms[f"dm-{RAYHAN}"].complete


async def test_all_complete_moves_to_propose_with_drafted_message():
    orch, deps = make_orchestrator()
    active = await collect_all(orch)
    assert active.state == "propose"
    assert PROPOSAL_TEXT in deps["messaging"].texts_to("g1")
    q, near = deps["venues"].calls[0]
    assert "sushi" in q and "tacos" in q and "clubs" in q


async def test_quorum_timeout_proposes_with_partial_replies():
    orch, _ = make_orchestrator(reply_timeout_s=0.05)
    active = await start_session(orch)
    await orch.handle_inbound(
        InboundMessage(handle=RAYHAN, chat_id=f"dm-{RAYHAN}", text="only do saturday evening")
    )
    await asyncio.sleep(0.15)
    assert active.state == "propose"


# --------------------------------------------------------- propose and close


async def test_all_assents_lock_confirm_and_snapshot_dms():
    orch, deps = make_orchestrator()
    active = await collect_all(orch)
    await orch.handle_inbound(group_msg("works for me", handle=RAYHAN))
    await orch.handle_inbound(group_msg("down!!", handle=MAYA))

    cards = deps["messaging"].cards
    assert any("locked in" in c.title for _, c in cards)
    assert any("nearby" in c.title for _, c in cards)  # match card after confirm
    assert "g1" not in orch.sessions
    assert deps["artifacts"].created
    # session-end snapshots: one per DM leg, after the trigger-time group one
    dm_snaps = deps["context"].snapshots[1:]
    assert (f"dm-{RAYHAN}", (RAYHAN,)) in dm_snaps
    assert (f"dm-{MAYA}", (MAYA,)) in dm_snaps


async def test_chatter_changes_nothing():
    orch, deps = make_orchestrator()
    active = await collect_all(orch)
    sent_before = len(deps["messaging"].texts)
    await orch.handle_inbound(group_msg("lmaooo", handle=MAYA))
    assert active.state == "propose" and active.assents == set()
    assert len(deps["messaging"].texts) == sent_before


async def test_objection_replans_once_with_merged_constraints():
    orch, deps = make_orchestrator()
    active = await collect_all(orch)
    await orch.handle_inbound(group_msg("works for me", handle=MAYA))
    await orch.handle_inbound(group_msg("actually i cant do saturday", handle=RAYHAN))

    assert active.replan_rounds == 1
    assert active.assents == set()  # reset for the revised proposal
    state = active.session.member_states[RAYHAN]
    assert "no sushi" in state.hard_nos
    assert state.availability[0].start.day == 2  # availability replaced
    assert deps["messaging"].texts_to("g1").count(PROPOSAL_TEXT) == 2  # re-proposed
    assert active.state == "propose"


async def test_second_objection_gets_ack_without_replan():
    orch, deps = make_orchestrator()
    active = await collect_all(orch)
    await orch.handle_inbound(group_msg("actually i cant do saturday", handle=RAYHAN))
    await orch.handle_inbound(group_msg("still cant make it", handle=RAYHAN))

    assert active.replan_rounds == 1
    assert deps["messaging"].texts_to("g1").count(PROPOSAL_TEXT) == 2  # no third proposal
    assert "got it — adjusting" in deps["messaging"].texts_to("g1")


async def test_propose_timeout_locks_with_partial_assents():
    orch, deps = make_orchestrator(propose_timeout_s=0.05)
    await collect_all(orch)
    await orch.handle_inbound(group_msg("works for me", handle=RAYHAN))
    await asyncio.sleep(0.15)
    assert "g1" not in orch.sessions
    assert any("locked in" in c.title for _, c in deps["messaging"].cards)


async def test_non_member_group_message_ignored_during_propose():
    orch, deps = make_orchestrator()
    active = await collect_all(orch)
    await orch.handle_inbound(group_msg("works for me", handle="+19999999999"))
    assert active.assents == set() and active.state == "propose"


# ------------------------------------------------------------------- guards


async def test_reinvoke_during_active_session_says_already_on_it():
    orch, deps = make_orchestrator()
    await start_session(orch)
    await orch.handle_inbound(group_msg("hey beagle also add karaoke?", handle=MAYA))
    assert ("g1", ALREADY_ON_IT) in deps["messaging"].texts
    assert len(orch.sessions) == 1


async def test_step_failure_aborts_with_apology_and_still_snapshots_dms():
    orch, deps = make_orchestrator(venues=FakeVenues(fail=True))
    await collect_all(orch)
    assert "g1" not in orch.sessions
    apologies = [t for c, t in deps["messaging"].texts if c == "g1" and "sideways" in t]
    assert apologies
    assert (f"dm-{RAYHAN}", (RAYHAN,)) in deps["context"].snapshots
