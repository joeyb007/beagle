"""T2: VenueSearch via a frontier LLM call through the router (FR5).

No search API key exists tonight; a frontier model proposes real venues.
Swappable behind the VenueSearch port if a real search API lands later.
"""

import json
import re

from src.contracts import Candidate, LLMRouter

_PROMPT = (
    "Suggest 2-3 real, currently-operating venues near {near} for: {query}. "
    'Reply with ONLY a JSON array: [{{"name": str, "area": str|null, '
    '"url": str|null, "note": str|null}}]. No invented venues.'
)


class WebVenueSearch:
    def __init__(self, llm: LLMRouter):
        self._llm = llm

    async def find(self, query: str, near: str) -> list[Candidate]:
        raw = await self._llm.complete(
            tier="frontier", input=_PROMPT.format(near=near, query=query)
        )
        # tolerate ```json fences``` around the array
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
        return [Candidate(**v) for v in json.loads(cleaned)]
