"""Den mode: no group chat needed — Beagle broadcasts the group experience
across every member's DM (shared-line groups are blocked server-side)."""

from src.agent.stubs import ScriptedLLM
from src.agent.tests.test_orchestrator import (
    FakeVenues,
    MAYA_STATE,
    RAYHAN_STATE,
    make_orchestrator,
)
from src.contracts import InboundMessage, PollVote


def den_orchestrator():
    llm = ScriptedLLM(
        rules=[
            ("Rayhan", "yo rayhan — sat or sun? still sushi?"),
            ("Maya", "maya! tacos this weekend?"),
            ("only do saturday evening", RAYHAN_STATE),
            ("free after 7", MAYA_STATE),
        ]
    )
    return make_orchestrator(llm=llm, venues=FakeVenues(), den_mode=True)


async def test_den_mode_runs_the_whole_loop_over_member_dms():
    orch, deps = den_orchestrator()
    m = deps["messaging"]

    # invoked from a member's DM — no group chat exists anywhere
    await orch.handle_inbound(
        InboundMessage(handle="+15550000002", chat_id="dm-+15550000002",
                       text="Hey Beagle, let's hang this weekend")
    )
    await orch.handle_inbound(
        InboundMessage(handle="+15550000001", chat_id="dm-+15550000001",
                       text="i can only do saturday evening, sushi pls, no clubs")
    )
    await orch.handle_inbound(
        InboundMessage(handle="+15550000002", chat_id="dm-+15550000002",
                       text="free after 7, tacos obviously")
    )

    active = orch.sessions["dm-+15550000002"]
    assert active.state == "vote"
    # the poll landed in EVERY member's DM, not one chat
    assert {c for c, _ in m.polls} == {"dm-+15550000001", "dm-+15550000002"}
    assert len(active.poll_ids) == 2

    # each member votes on their own copy; the tally is shared
    id_by_chat = {chat: f"poll-{i + 1}" for i, (chat, _) in enumerate(m.polls)}
    await orch.handle_poll_vote(
        PollVote(poll_id=id_by_chat["dm-+15550000001"], handle="+15550000001", option_index=1)
    )
    await orch.handle_poll_vote(
        PollVote(poll_id=id_by_chat["dm-+15550000002"], handle="+15550000002", option_index=1)
    )

    # locked: confirm card, celebration, and the .ics broadcast to BOTH DMs
    card_chats = {c for c, _ in m.cards}
    assert {"dm-+15550000001", "dm-+15550000002"} <= card_chats
    assert {c for c, *_ in m.celebrations} == {"dm-+15550000001", "dm-+15550000002"}
    assert {c for c, _ in m.files} == {"dm-+15550000001", "dm-+15550000002"}
    # no group rename attempted in a DM
    assert all(name is None for _, _, name, _ in m.celebrations)
    # session complete
    assert "dm-+15550000002" not in orch.sessions
