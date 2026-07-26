"""Voice notes: ElevenLabs TTS when a key exists, silent no-op otherwise."""

import httpx
import pytest

from src.agent.voice_notes import VoiceNotes


async def test_no_api_key_means_no_voice_and_no_crash():
    vn = VoiceNotes(api_key=None)
    assert vn.enabled is False
    assert await vn.synthesize("hey") is None


async def test_synthesize_writes_audio_file_from_api_bytes(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        assert "text-to-speech" in str(request.url)
        assert request.headers["xi-api-key"] == "k-123"
        return httpx.Response(200, content=b"FAKE-MP3-BYTES")

    vn = VoiceNotes(api_key="k-123", transport=httpx.MockTransport(handler))
    path = await vn.synthesize("it's happening — omakase saturday 🎉")

    assert path is not None and path.endswith(".mp3")
    assert open(path, "rb").read() == b"FAKE-MP3-BYTES"


async def test_api_failure_degrades_to_none(tmp_path):
    vn = VoiceNotes(
        api_key="k-123",
        transport=httpx.MockTransport(lambda r: httpx.Response(401, content=b"no")),
    )
    assert await vn.synthesize("hello") is None
