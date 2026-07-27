"""Turn prompts + strict parsers for the conversational flow.

The LLM judges content only — slot-filling a member's form over multi-turn
DMs, classifying group reactions to a proposal, and drafting proposal text.
The orchestrator owns all control flow; these helpers just build the prompts
and validate the JSON that comes back (pydantic raises on garbage, which the
orchestrator's fail-closed handler catches).
"""

import re
from typing import Literal

from pydantic import BaseModel

from src.contracts import Interval, MemberState

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$")

TURN_PROMPT = (
    "You are filling a scheduling form for {name} about: {occasion}.\n"
    "Current form JSON: {form}\n"
    "Conversation so far:\n{history}\n"
    "Merge the latest [them] message into the form. Resolve relative days "
    "within {window_start} .. {window_end}. Set is_complete true only when at "
    "least one availability interval AND (a pref or an explicit 'anything "
    "works') are known. Write reply_text as a short friendly follow-up "
    "question (empty string when complete).\n"
    'Respond with JSON only, exactly these keys: {{"availability": '
    '[{{"start": ISO8601, "end": ISO8601}}], "prefs": [str], "hard_nos": '
    '[str], "is_complete": bool, "reply_text": str}}.'
)

CLASSIFY_PROMPT = (
    'Beagle proposed to the group: "{proposal}"\n'
    '{name} replied: "{text}"\n'
    "Classify the reply: 'assent' (agreement/enthusiasm), 'objection' (a "
    "conflict or new constraint — also extract it into availability/prefs/"
    "hard_nos, resolving relative days within {window_start} .. {window_end}), "
    "or 'chatter' (anything else). Set reply_text only for objections: a "
    "one-line acknowledgement.\n"
    'Respond with JSON only, exactly these keys: {{"kind": '
    '"assent"|"objection"|"chatter", "availability": [{{"start": ISO8601, '
    '"end": ISO8601}}], "prefs": [str], "hard_nos": [str], '
    '"reply_text": str|null}}.'
)

PROPOSAL_PROMPT = (
    "Write 2-3 short lowercase-friendly sentences to {names} proposing "
    "{venue}{area} at {when} for {occasion}. End by asking if that works."
)

PROPOSAL_REVISION_OPENING = (
    "Open with a brief acknowledgement that you adjusted the plan based on "
    "their feedback. "
)


class TurnResult(BaseModel):
    availability: list[Interval] = []
    prefs: list[str] = []
    hard_nos: list[str] = []
    is_complete: bool = False
    reply_text: str = ""


class Classification(BaseModel):
    kind: Literal["assent", "objection", "chatter"]
    availability: list[Interval] = []
    prefs: list[str] = []
    hard_nos: list[str] = []
    reply_text: str | None = None


def _strip_fences(raw: str) -> str:
    return _FENCE_RE.sub("", raw.strip())


def build_turn_prompt(
    *,
    name: str,
    occasion: str,
    form: MemberState,
    history: list[tuple[str, str]],
    window_start: str,
    window_end: str,
) -> str:
    lines = "\n".join(f"[{who}]: {text}" for who, text in history)
    return TURN_PROMPT.format(
        name=name,
        occasion=occasion,
        form=form.model_dump_json(),
        history=lines,
        window_start=window_start,
        window_end=window_end,
    )


def build_classify_prompt(
    *, name: str, proposal: str, text: str, window_start: str, window_end: str
) -> str:
    return CLASSIFY_PROMPT.format(
        name=name,
        proposal=proposal,
        text=text,
        window_start=window_start,
        window_end=window_end,
    )


def build_proposal_prompt(
    *,
    occasion: str,
    venue: str,
    area: str | None,
    when: str,
    names: list[str],
    revision: bool,
) -> str:
    prompt = PROPOSAL_PROMPT.format(
        names=", ".join(names),
        venue=venue,
        area=f" ({area})" if area else "",
        when=when,
        occasion=occasion,
    )
    return (PROPOSAL_REVISION_OPENING + prompt) if revision else prompt


def parse_turn(raw: str) -> TurnResult:
    return TurnResult.model_validate_json(_strip_fences(raw))


def parse_classification(raw: str) -> Classification:
    return Classification.model_validate_json(_strip_fences(raw))
