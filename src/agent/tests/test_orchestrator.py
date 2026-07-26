"""T3-T12: Orchestrator state machine over stub ports."""

import pytest

from src.agent.orchestrator import Orchestrator
from src.agent.stubs import (
    ScriptedLLM,
    StubArtifactStore,
    StubCalendar,
    StubMatching,
    StubMessaging,
    StubMusic,
    StubProfileStore,
    StubRefresher,
    StubVoice,
)
from src.contracts import InboundMessage


def make_orchestrator(**overrides):
    deps = dict(
        messaging=StubMessaging(),
        llm=ScriptedLLM(
            rules=[
                ("Rayhan", "yo rayhan — sat or sun? still sushi?"),
                ("Maya", "maya! tacos this weekend?"),
            ]
        ),
        profiles=StubProfileStore(),
        refresher=StubRefresher(),
        voice=StubVoice(),
        calendar=StubCalendar(),
        music=StubMusic(),
        matching=StubMatching(),
        venues=None,  # filled per-test when the loop reaches reconcile
        artifacts=StubArtifactStore(),
    )
    deps.update(overrides)
    return Orchestrator(**deps), deps


@pytest.fixture
def group_invoke():
    return InboundMessage(
        handle="+15550000002", chat_id="g1", text="Hey Beagle, let's hang this weekend"
    )


# ---------------------------------------------------------------- T4: invoke


async def test_non_trigger_message_creates_no_session():
    orch, _ = make_orchestrator()
    await orch.handle_inbound(
        InboundMessage(handle="+15550000002", chat_id="g1", text="lol what a day")
    )
    assert orch.sessions == {}


async def test_trigger_creates_session_keyed_to_group_chat(group_invoke):
    orch, _ = make_orchestrator()
    await orch.handle_inbound(group_invoke)
    assert "g1" in orch.sessions
    session = orch.sessions["g1"].session
    assert session.group_chat_id == "g1"
    assert set(session.members) == {"+15550000001", "+15550000002"}


# ------------------------------------------------- T5: ordered hybrid fan-out


async def test_fanout_dms_most_constrained_first_with_typing_and_voice(group_invoke):
    orch, deps = make_orchestrator()
    await orch.handle_inbound(group_invoke)

    m = deps["messaging"]
    # Rayhan (0.9) before Maya (0.2), each in their own DM
    assert [c for c, _ in m.texts] == ["dm-+15550000001", "dm-+15550000002"]
    assert m.texts[0][1] == "yo rayhan — sat or sun? still sushi?"
    # typing bubble on before each DM
    assert ("dm-+15550000001", True) in m.typing
    # voice style flows into the ask generation as the system prompt
    ask_calls = [c for c in deps["llm"].calls if "Rayhan" in c["input"]]
    assert "dry humor" in ask_calls[0]["system"]
    # non-blocking fan-out: state is already collecting, nobody has replied
    assert orch.sessions["g1"].state == "collect"


# --------------------------------------------- T6: collect + T7: reconcile

RAYHAN_STATE = (
    '{"availability": [{"start": "2026-08-01T18:00:00", "end": "2026-08-01T22:00:00"}],'
    ' "prefs": ["sushi"], "hard_nos": ["clubs"]}'
)
MAYA_STATE = (
    '{"availability": [{"start": "2026-08-01T19:00:00", "end": "2026-08-01T23:00:00"}],'
    ' "prefs": ["tacos"], "hard_nos": []}'
)


class FakeVenues:
    def __init__(self):
        self.calls: list[tuple[str, str]] = []

    async def find(self, query, near):
        from src.contracts import Candidate

        self.calls.append((query, near))
        return [Candidate(name="Tacos El Rey"), Candidate(name="Ebisu Sushi")]


def collecting_orchestrator():
    """Orchestrator whose LLM parses the two members' replies into canned states."""
    llm = ScriptedLLM(
        rules=[
            ("Rayhan", "yo rayhan — sat or sun? still sushi?"),
            ("Maya", "maya! tacos this weekend?"),
            ("only do saturday evening", RAYHAN_STATE),
            ("free after 7", MAYA_STATE),
        ]
    )
    return make_orchestrator(llm=llm, venues=FakeVenues())


async def test_reply_is_parsed_cheap_and_tightens_unanswered(group_invoke):
    orch, deps = collecting_orchestrator()
    await orch.handle_inbound(group_invoke)

    await orch.handle_inbound(
        InboundMessage(
            handle="+15550000001",
            chat_id="dm-+15550000001",
            text="i can only do saturday evening, sushi pls, no clubs",
        )
    )

    state = orch.sessions["g1"].session.member_states["+15550000001"]
    assert state.replied is True
    assert state.prefs == ["sushi"]
    # parse ran on the cheap tier
    parse_calls = [c for c in deps["llm"].calls if "only do saturday evening" in c["input"]]
    assert parse_calls and all(c["tier"] == "cheap" for c in parse_calls)
    # hybrid fan-out: Maya (unanswered) gets a tightening nudge mentioning Rayhan's reply
    maya_texts = deps["messaging"].texts_to("dm-+15550000002")
    assert any("saturday" in t.lower() for t in maya_texts[1:])
    # still collecting — quorum not met
    assert orch.sessions["g1"].state == "collect"


async def test_quorum_triggers_reconcile_and_group_poll(group_invoke):
    orch, deps = collecting_orchestrator()
    await orch.handle_inbound(group_invoke)

    await orch.handle_inbound(
        InboundMessage(
            handle="+15550000001",
            chat_id="dm-+15550000001",
            text="i can only do saturday evening, sushi pls, no clubs",
        )
    )
    await orch.handle_inbound(
        InboundMessage(
            handle="+15550000002",
            chat_id="dm-+15550000002",
            text="free after 7, tacos obviously",
        )
    )

    active = orch.sessions["g1"]
    assert active.state == "vote"
    # deterministic reconcile: prefs unioned, hard-nos surfaced as exclusions
    query, near = deps["venues"].calls[0]
    assert "sushi" in query and "tacos" in query
    assert "clubs" in query
    assert near == "San Francisco"
    # candidates went to a native poll in the ORIGINATING group chat
    assert len(deps["messaging"].polls) == 1
    poll_chat, poll = deps["messaging"].polls[0]
    assert poll_chat == "g1"
    assert poll.options == ["Tacos El Rey", "Ebisu Sushi"]
    # availability intersection: sat 19:00-22:00 overlap chosen
    assert active.chosen_slot.start.hour == 19
    assert active.chosen_slot.end.hour == 22


# ------------------- T8-T12: vote, lock+confirm, match card, refresh, abort

import asyncio

from src.contracts import PollVote


async def voted_orchestrator(**overrides):
    """Run the loop up to the vote state."""
    orch, deps = collecting_orchestrator()
    for k, v in overrides.items():
        setattr(orch, f"_{k}", v)
    await orch.handle_inbound(
        InboundMessage(handle="+15550000002", chat_id="g1", text="Hey Beagle, let's hang this weekend")
    )
    await orch.handle_inbound(
        InboundMessage(handle="+15550000001", chat_id="dm-+15550000001",
                       text="i can only do saturday evening, sushi pls, no clubs")
    )
    await orch.handle_inbound(
        InboundMessage(handle="+15550000002", chat_id="dm-+15550000002",
                       text="free after 7, tacos obviously")
    )
    assert orch.sessions["g1"].state == "vote"
    return orch, deps


async def test_all_votes_lock_plan_confirm_card_artifact_match_refresh():
    orch, deps = await voted_orchestrator()
    poll_id = orch.sessions["g1"].session.poll_id

    await orch.handle_poll_vote(PollVote(poll_id=poll_id, handle="+15550000001", option_index=1))
    await orch.handle_poll_vote(PollVote(poll_id=poll_id, handle="+15550000002", option_index=1))

    m = deps["messaging"]
    # T9: confirm card in the group chat names the winner
    assert m.cards[0][0] == "g1"
    assert "Ebisu Sushi" in (m.cards[0][1].title + m.cards[0][1].body)
    # T9: artifact persisted with plan + blended playlist
    created = deps["artifacts"].created
    assert len(created) == 1
    assert created[0].place.name == "Ebisu Sushi"
    assert len(created[0].playlist) == 2
    assert created[0].attendees == ["+15550000001", "+15550000002"]
    # T11: match card follows the confirm card
    assert len(m.cards) == 2
    assert "Sam (sample)" in (m.cards[1][1].title + m.cards[1][1].body)
    # T12: refresher got the raw replies at lock
    (replies,) = deps["refresher"].refreshed_with
    assert {r.handle for r in replies} == {"+15550000001", "+15550000002"}
    assert any("saturday" in r.text for r in replies)
    # session complete and cleaned up
    assert "g1" not in orch.sessions


async def test_majority_tally_picks_winner():
    orch, deps = await voted_orchestrator()
    poll_id = orch.sessions["g1"].session.poll_id
    await orch.handle_poll_vote(PollVote(poll_id=poll_id, handle="+15550000001", option_index=0))
    await orch.handle_poll_vote(PollVote(poll_id=poll_id, handle="+15550000002", option_index=0))
    assert deps["artifacts"].created[0].place.name == "Tacos El Rey"


async def test_unknown_poll_vote_is_ignored():
    orch, deps = await voted_orchestrator()
    await orch.handle_poll_vote(PollVote(poll_id="poll-999", handle="+15550000001", option_index=0))
    assert orch.sessions["g1"].state == "vote"  # unchanged


async def test_reply_timeout_reconciles_with_partial_replies(group_invoke):
    orch, deps = collecting_orchestrator()
    orch.reply_timeout_s = 0.02
    await orch.handle_inbound(group_invoke)
    await orch.handle_inbound(
        InboundMessage(handle="+15550000001", chat_id="dm-+15550000001",
                       text="i can only do saturday evening, sushi pls, no clubs")
    )
    assert orch.sessions["g1"].state == "collect"
    await asyncio.sleep(0.08)
    # proceeded on quorum-by-timeout with just Rayhan
    assert orch.sessions["g1"].state == "vote"
    assert len(deps["messaging"].polls) == 1


async def test_vote_timeout_locks_with_partial_votes():
    orch, deps = await voted_orchestrator()
    orch.vote_timeout_s = 0.02
    # re-arm the timer path by simulating one vote then waiting
    poll_id = orch.sessions["g1"].session.poll_id
    await orch.handle_poll_vote(PollVote(poll_id=poll_id, handle="+15550000001", option_index=1))
    await asyncio.sleep(0.08)
    assert deps["artifacts"].created[0].place.name == "Ebisu Sushi"


async def test_step_failure_aborts_with_friendly_group_message(group_invoke):
    class BrokenVenues:
        async def find(self, query, near):
            raise RuntimeError("search down")

    orch, deps = collecting_orchestrator()
    orch._venues = BrokenVenues()
    await orch.handle_inbound(group_invoke)
    await orch.handle_inbound(
        InboundMessage(handle="+15550000001", chat_id="dm-+15550000001",
                       text="i can only do saturday evening, sushi pls, no clubs")
    )
    await orch.handle_inbound(
        InboundMessage(handle="+15550000002", chat_id="dm-+15550000002",
                       text="free after 7, tacos obviously")
    )

    # T10: friendly abort in the group chat, session dropped, no crash
    group_texts = deps["messaging"].texts_to("g1")
    assert group_texts and "try again" in group_texts[-1].lower()
    assert "g1" not in orch.sessions


# ---------------- solo mode: the DM with the line doubles as the group chat


async def test_solo_dm_doubles_as_group_chat():
    """One allowlisted human: invoke chat == fan-out DM == poll chat."""
    from src.agent.stubs import StubProfileStore as SPS
    from src.contracts import Profile

    solo_profile = Profile(handle="+16475550132", name="Joseph", cuisines=["sushi"],
                           constraint_score=0.5)
    llm = ScriptedLLM(rules=[
        ("Joseph", "yo joseph — sat or sun?"),
        ("only do saturday evening", RAYHAN_STATE),
    ])
    orch, deps = make_orchestrator(llm=llm, venues=FakeVenues(),
                                   profiles=SPS([solo_profile]))
    dm_chat = "dm-+16475550132"  # StubMessaging.open_direct returns this id

    # invoke arrives in the SAME chat the fan-out DM will use
    await orch.handle_inbound(InboundMessage(
        handle="+16475550132", chat_id=dm_chat, text="Hey Beagle, let's hang"))
    assert dm_chat in orch.sessions
    assert orch.sessions[dm_chat].state == "collect"

    # the reply in that same chat is collected, not ignored
    await orch.handle_inbound(InboundMessage(
        handle="+16475550132", chat_id=dm_chat,
        text="i can only do saturday evening, sushi pls, no clubs"))
    active = orch.sessions[dm_chat]
    assert active.state == "vote"           # quorum of 1 → straight to poll
    assert deps["messaging"].polls[0][0] == dm_chat  # poll lands in the DM


# ---------------- agentic collect: Beagle decides when a member is done

VAGUE_ENVELOPE = (
    '{"availability": [], "prefs": [], "hard_nos": [],'
    ' "complete": false, "follow_up": "ok but like — friday or saturday?"}'
)
COMPLETE_AFTER_VAGUE = (
    '{"availability": [{"start": "2026-08-01T18:00:00", "end": "2026-08-01T22:00:00"}],'
    ' "prefs": ["sushi"], "hard_nos": [], "complete": true, "follow_up": null}'
)


async def test_incomplete_reply_triggers_follow_up_not_quorum(group_invoke):
    llm = ScriptedLLM(rules=[
        ("Rayhan", "yo rayhan"), ("Maya", "maya!"),
        ("idk whenever tbh", VAGUE_ENVELOPE),
    ])
    orch, deps = make_orchestrator(llm=llm, venues=FakeVenues())
    await orch.handle_inbound(group_invoke)

    await orch.handle_inbound(InboundMessage(
        handle="+15550000001", chat_id="dm-+15550000001", text="idk whenever tbh"))

    state = orch.sessions["g1"].session.member_states["+15550000001"]
    assert state.replied is False  # not done with them yet
    # the follow-up Beagle generated went to their DM
    assert deps["messaging"].texts_to("dm-+15550000001")[-1] == "ok but like — friday or saturday?"
    assert orch.sessions["g1"].state == "collect"


async def test_full_transcript_reparse_merges_split_messages(group_invoke):
    llm = ScriptedLLM(rules=[
        ("Rayhan", "yo rayhan"), ("Maya", "maya!"),
        # second call sees BOTH messages in the transcript -> complete state
        ("oh and sushi pls", COMPLETE_AFTER_VAGUE),
        ("idk whenever tbh", VAGUE_ENVELOPE),
        ("free after 7", MAYA_STATE),
    ])
    orch, deps = make_orchestrator(llm=llm, venues=FakeVenues())
    await orch.handle_inbound(group_invoke)

    await orch.handle_inbound(InboundMessage(
        handle="+15550000001", chat_id="dm-+15550000001", text="idk whenever tbh"))
    await orch.handle_inbound(InboundMessage(
        handle="+15550000001", chat_id="dm-+15550000001", text="oh and sushi pls"))

    state = orch.sessions["g1"].session.member_states["+15550000001"]
    assert state.replied is True
    assert state.prefs == ["sushi"]  # derived from the whole conversation
    # the completeness call saw the full transcript, not just the last message
    final_call = [c for c in deps["llm"].calls if "oh and sushi pls" in c["input"]][-1]
    assert "idk whenever tbh" in final_call["input"]


async def test_follow_up_cap_forces_completion(group_invoke):
    llm = ScriptedLLM(rules=[
        ("Rayhan", "yo rayhan"), ("Maya", "maya!"),
        ("hmmm", VAGUE_ENVELOPE),  # LLM never satisfied
    ])
    orch, deps = make_orchestrator(llm=llm, venues=FakeVenues())
    orch.max_follow_ups = 2
    await orch.handle_inbound(group_invoke)

    for _ in range(3):  # replies keep coming, LLM keeps saying incomplete
        await orch.handle_inbound(InboundMessage(
            handle="+15550000001", chat_id="dm-+15550000001", text="hmmm"))

    state = orch.sessions["g1"].session.member_states["+15550000001"]
    assert state.replied is True  # cap hit -> take what exists and move on
    follow_ups = [t for t in deps["messaging"].texts_to("dm-+15550000001")
                  if t == "ok but like — friday or saturday?"]
    assert len(follow_ups) == 2  # exactly max_follow_ups, no runaway
