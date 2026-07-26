"""T3 — Distiller: one cheap LLM call per person → a Profile (+ constraint_score).

Rule (FR12): fill only supported fields, None/[] if unknown, **never invent**.
We enforce that guard on the way out — only known keys survive, price_band is
validated, blanks collapse to null. The Distiller does not touch the store or
embeddings; the pipeline (harness / consolidation) adds vectors and persists.
"""

from __future__ import annotations

import json
import re

from ..contracts import LLMRouter, Profile
from .importer import PersonMessages

_PRICE_BANDS = {"$", "$$", "$$$"}

_SYSTEM = (
    "You are Beagle's profile distiller. From one person's group-chat messages, "
    "extract a compact hangout profile. Return ONLY a JSON object with keys: "
    "cuisines (list of strings), price_band ('$' | '$$' | '$$$' | null), "
    "vibe (list), hard_nos (list of dealbreakers), "
    "typical_availability (short string | null), persona_label (short string | null), "
    "notes (short string | null). Fill ONLY fields clearly supported by the "
    "messages; use null or [] when unknown; never invent."
)


def _extract_json(raw: str) -> dict:
    """Tolerate code fences / prose around the JSON object."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        raw = raw[start : end + 1]
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else {}
    except json.JSONDecodeError:
        return {}


def _clean_list(v) -> list[str]:
    if not isinstance(v, list):
        return []
    out, seen = [], set()
    for item in v:
        s = str(item).strip().lower()
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _clean_str(v) -> str | None:
    if not isinstance(v, str):
        return None
    s = v.strip()
    return s or None


def compute_constraint_score(p: Profile) -> float:
    """PRD §9 — how hard this person is to satisfy; drives fan-out order.
    Higher = message them first (their answer prunes the solution space most)."""
    score = 0.0
    score += min(len(p.hard_nos) * 0.15, 0.45)  # each dealbreaker prunes options

    avail = (p.typical_availability or "").lower()
    if avail:
        if any(k in avail for k in ("only", "busy", "after work", "late night")):
            score += 0.30  # tight, single-window availability
        elif any(k in avail for k in ("flexible", "anytime", "whenever", "easy")):
            score += 0.0   # wide open — never the bottleneck
        else:
            score += 0.12  # a specific-ish day/time

    persona = (p.persona_label or "").lower()
    if "picky" in persona or "busy" in persona:
        score += 0.12
    if p.price_band == "$$$":
        score += 0.08  # upscale-only narrows the venue set

    return round(min(score, 1.0), 3)


class Distiller:
    def __init__(self, llm: LLMRouter) -> None:
        self._llm = llm

    async def distill(self, person: PersonMessages) -> Profile:
        prompt = f"Person: {person.name}\nMessages:\n{person.blob}"
        raw = await self._llm.complete(tier="cheap", input=prompt, system=_SYSTEM)
        data = _extract_json(raw)

        price = data.get("price_band")
        price = price if price in _PRICE_BANDS else None

        profile = Profile(
            handle=person.handle,
            name=person.name,
            cuisines=_clean_list(data.get("cuisines")),
            price_band=price,
            vibe=_clean_list(data.get("vibe")),
            hard_nos=_clean_list(data.get("hard_nos")),
            typical_availability=_clean_str(data.get("typical_availability")),
            persona_label=_clean_str(data.get("persona_label")),
            notes=_clean_str(data.get("notes")),
        )
        profile.constraint_score = compute_constraint_score(profile)
        return profile
