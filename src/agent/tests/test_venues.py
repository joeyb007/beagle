"""T2: WebVenueSearch — frontier LLM call → 2-3 parsed Candidates."""

from src.agent.venues import WebVenueSearch

VENUES_JSON = """[
  {"name": "Tacos El Rey", "area": "Mission", "url": "https://example.com/rey", "note": "cheap, open late"},
  {"name": "Blue Plate", "area": "Bernal", "note": "cozy American"}
]"""


class CapturingLLM:
    def __init__(self, response: str):
        self.response = response
        self.calls: list[dict] = []

    async def complete(self, *, tier, input, system=None):
        self.calls.append({"tier": tier, "input": input, "system": system})
        return self.response


async def test_parses_llm_json_into_candidates():
    llm = CapturingLLM(VENUES_JSON)
    venues = WebVenueSearch(llm)

    out = await venues.find("casual tacos dinner", near="San Francisco")

    assert [c.name for c in out] == ["Tacos El Rey", "Blue Plate"]
    assert out[0].area == "Mission"
    assert out[0].url == "https://example.com/rey"
    assert out[1].url is None
    # query and location both reach the model; frontier tier per branch doc
    assert llm.calls[0]["tier"] == "frontier"
    assert "casual tacos dinner" in llm.calls[0]["input"]
    assert "San Francisco" in llm.calls[0]["input"]


async def test_tolerates_markdown_fenced_json():
    llm = CapturingLLM(f"```json\n{VENUES_JSON}\n```")
    out = await WebVenueSearch(llm).find("coffee", near="Oakland")
    assert len(out) == 2
