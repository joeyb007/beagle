"""StubLLMRouter — canned stand-in for A's Merge Gateway router.

D consumes `LLMRouter` (frozen in contracts.py). Until consolidation swaps in
A's real `MergeRouter`, this stub lets the whole D pipeline run offline: it
*simulates* a distillation / group-voice LLM with deterministic keyword
scanning. The Distiller's real work (prompt-building, JSON parsing, constraint
scoring, the never-invent guard) is exercised either way — only the model call
is faked. Same for VoiceProvider.

Branch on the `system` prompt: voice asks get a style sentence, everything
else is treated as a per-person distill and gets Profile-shaped JSON back.
"""

from __future__ import annotations

import json
import re

from ...contracts import LLMTier

# --- small lexicons the fake "model" reads out of a person's messages --------

_CUISINES = {
    "sushi": "japanese", "ramen": "japanese", "japanese": "japanese",
    "taco": "mexican", "tacos": "mexican", "burrito": "mexican", "mexican": "mexican",
    "pizza": "italian", "pasta": "italian", "italian": "italian",
    "thai": "thai", "pad thai": "thai",
    "korean": "korean", "kbbq": "korean", "bbq": "bbq",
    "burger": "american", "wings": "american",
    "dumpling": "chinese", "chinese": "chinese", "dim sum": "chinese",
    "pho": "vietnamese", "banh mi": "vietnamese",
    "indian": "indian", "curry": "indian",
    "poke": "hawaiian", "salad": "healthy", "vegan": "vegan",
}

_VIBES = {
    "chill": "chill", "lowkey": "chill", "low-key": "chill", "cozy": "cozy",
    "turnt": "party", "rowdy": "party", "dancing": "dancing", "club": "dancing",
    "fancy": "upscale", "classy": "upscale", "nice": "upscale",
    "dive": "dive-bar", "dive bar": "dive-bar",
    "outdoors": "outdoors", "outdoorsy": "outdoors", "hike": "outdoors",
    "live music": "live-music", "quiet": "quiet", "adventurous": "adventurous",
}

_PRICE = [
    (r"\b(broke|cheap|budget|cheap eats|hole in the wall)\b", "$"),
    (r"\b(mid|moderate|reasonable)\b", "$$"),
    (r"\b(fancy|splurge|treat|nice place|upscale|classy)\b", "$$$"),
]

# hard-no patterns -> normalized constraint text
_HARD_NO_PATTERNS = [
    (r"\bvegetarian\b", "no meat"),
    (r"\bvegan\b", "no animal products"),
    (r"\bgluten[- ]?free\b|\bceliac\b|\bno gluten\b", "no gluten"),
    (r"\ballerg(?:y|ic)\s+to\s+(\w+)\b", None),      # capture group 1
    (r"\bno\s+([a-z][a-z ]{2,20}?)\b(?=[.,!?]|\s|$)", None),
    (r"\bcan'?t\s+do\s+([a-z][a-z ]{2,20}?)\b(?=[.,!?]|\s|$)", None),
    (r"\bhate[s]?\s+([a-z][a-z ]{2,20}?)\b(?=[.,!?]|\s|$)", None),
]

_DAYS = r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekends?|weekdays?)"

# a taste/vibe keyword is only "positive" if some occurrence isn't negated
# ("no sushi", "over mexican", "no loud clubs" must not become likes)
_NEG = re.compile(r"\b(no|not|hate|hates|over|without|skip|anti|never)\b(?:\s+\w+){0,2}\s*$")


def _positive(text: str, kw: str) -> bool:
    """True if some mention of kw isn't within a couple words of a negator
    (so "no loud clubs" / "over mexican" don't register as likes)."""
    for m in re.finditer(re.escape(kw), text):
        if not _NEG.search(text[max(0, m.start() - 16):m.start()]):
            return True
    return False


def _scan_availability(text: str) -> str | None:
    m = re.search(r"\bonly\b[a-z'\s]{0,15}?" + _DAYS, text)
    if m:
        return f"only {m.group(1)}"
    m = re.search(r"\b(?:free|around|down)\s+(?:on\s+)?" + _DAYS, text)
    if m:
        return m.group(1)
    for phrase in ("after work", "evenings", "mornings", "late nights", "early"):
        if phrase in text:
            return phrase
    if re.search(r"\b(anytime|whenever|flexible|i'?m easy|down whenever)\b", text):
        return "flexible / anytime"
    m = re.search(r"\bbusy\s+(?:until\s+|on\s+)?" + _DAYS, text)
    if m:
        return f"busy {m.group(1)}"
    return None


def _distill_json(text: str) -> str:
    t = text.lower()

    cuisines: list[str] = []
    for kw, label in _CUISINES.items():
        if kw in t and label not in cuisines and _positive(t, kw):
            cuisines.append(label)

    vibe: list[str] = []
    for kw, label in _VIBES.items():
        if kw in t and label not in vibe and _positive(t, kw):
            vibe.append(label)

    price_band = None
    for pat, band in _PRICE:
        if re.search(pat, t):
            price_band = band  # last match wins (splurge overrides cheap)

    hard_nos: list[str] = []
    for pat, fixed in _HARD_NO_PATTERNS:
        for m in re.finditer(pat, t):
            val = fixed if fixed else (m.group(1) if m.groups() else None)
            if not val:
                continue
            val = val.strip()
            # drop scheduling false-positives like "no time" / "no plans"
            if val in {"time", "plans", "idea", "clue", "one", "way"}:
                continue
            norm = val if fixed else f"no {val}"
            if norm not in hard_nos:
                hard_nos.append(norm)

    availability = _scan_availability(t)

    # persona label from the dominant signal
    if len(hard_nos) >= 3:
        persona = "the picky one"
    elif {"party", "dancing"} & set(vibe):
        persona = "the party starter"
    elif "upscale" in vibe:
        persona = "the tastemaker"
    elif {"outdoors", "adventurous"} & set(vibe):
        persona = "the adventurer"
    elif {"chill", "cozy", "quiet"} & set(vibe):
        persona = "the chill one"
    elif availability and availability.startswith(("only", "busy")):
        persona = "the busy one"
    else:
        persona = "the flexible one"

    note_bits = []
    if cuisines:
        note_bits.append(f"leans {', '.join(cuisines[:2])}")
    if vibe:
        note_bits.append(f"{vibe[0]} energy")
    notes = "; ".join(note_bits) or None

    return json.dumps({
        "cuisines": cuisines,
        "price_band": price_band,
        "vibe": vibe,
        "hard_nos": hard_nos,
        "typical_availability": availability,
        "persona_label": persona,
        "notes": notes,
    })


def _voice_style(text: str) -> str:
    t = text.lower()
    slang = [w for w in ("lowkey", "fr", "ngl", "bet", "deadass", "lol", "lmao",
                         "sus", "vibe", "sending me", "no cap", "fam")
             if re.search(r"\b" + re.escape(w) + r"\b", t)]
    has_emoji = bool(re.search(r"[\U0001F300-\U0001FAFF☀-➿]", text))
    lower_heavy = sum(1 for c in text if c.islower()) > sum(1 for c in text if c.isupper()) * 4

    parts = ["Group voice: fast, casual iMessage banter"]
    if lower_heavy:
        parts.append("mostly lowercase")
    if slang:
        parts.append("slang like " + ", ".join(f"'{s}'" for s in slang[:4]))
    if has_emoji:
        parts.append("emoji-friendly 🔥😂")
    parts.append("warm and teasing")
    return (
        ". ".join(parts)
        + ". Keep Beagle's messages short, playful, and in-group — never corporate. "
        "Flavor only: never change the facts of the plan."
    )


class StubLLMRouter:
    """Implements the `LLMRouter` port with canned, deterministic output."""

    def __init__(self) -> None:
        self.calls: list[dict] = []  # inspectable log, mirrors real routing_log

    async def complete(
        self, *, tier: LLMTier, input: str, system: str | None = None
    ) -> str:
        self.calls.append({"tier": tier, "system": system, "input": input})
        sys_l = (system or "").lower()
        if "voice" in sys_l or "style" in sys_l or "cadence" in sys_l:
            return _voice_style(input)
        return _distill_json(input)
