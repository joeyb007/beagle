import pytest
from pydantic import ValidationError

from src.agent.turns import (
    Classification, TurnResult, build_classify_prompt, build_proposal_prompt,
    build_turn_prompt, parse_classification, parse_turn,
)
from src.contracts import MemberState


def test_parse_turn_strips_fences_and_fills_defaults():
    raw = '```json\n{"availability": [], "is_complete": false, "reply_text": "which day?"}\n```'
    t = parse_turn(raw)
    assert t.reply_text == "which day?" and t.prefs == [] and not t.is_complete


def test_parse_turn_rejects_garbage():
    with pytest.raises(ValidationError):
        parse_turn("sounds good!")


def test_parse_classification_objection_carries_constraints():
    c = parse_classification(
        '{"kind": "objection", "hard_nos": ["no sushi"], "reply_text": "got it — no sushi"}'
    )
    assert c.kind == "objection" and c.hard_nos == ["no sushi"]


def test_turn_prompt_embeds_form_history_and_window():
    p = build_turn_prompt(
        name="Maya", occasion="dinner", form=MemberState(prefs=["tacos"]),
        history=[("beagle", "when works?"), ("them", "sat maybe")],
        window_start="2026-07-27T00:00:00", window_end="2026-08-03T00:00:00",
    )
    assert "Maya" in p and '"tacos"' in p and "[them]: sat maybe" in p and "JSON only" in p


def test_classify_prompt_embeds_proposal():
    p = build_classify_prompt(
        name="Rayhan", proposal="tacos el rey sat 7pm?", text="i cant do saturday",
        window_start="2026-07-27T00:00:00", window_end="2026-08-03T00:00:00",
    )
    assert "tacos el rey" in p and "i cant do saturday" in p


def test_proposal_prompt_flags_revision():
    p = build_proposal_prompt(occasion="dinner", venue="Ebisu", area="Sunset",
                              when="Sat 7pm", names=["Maya", "Rayhan"], revision=True)
    assert "Ebisu" in p and "adjust" in p.lower()
