"""Beagle's spoken side: ElevenLabs TTS -> audio file -> iMessage voice bubble.

No ELEVENLABS_API_KEY -> `synthesize` returns None and callers skip the voice
beat; the text always goes regardless.
"""

import os
import tempfile
from pathlib import Path

import httpx

DEFAULT_VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # "Rachel"
_API = "https://api.elevenlabs.io/v1/text-to-speech"


class VoiceNotes:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        voice_id: str = DEFAULT_VOICE,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._api_key = api_key
        self._voice_id = voice_id
        self._transport = transport

    @property
    def enabled(self) -> bool:
        return bool(self._api_key)

    async def synthesize(self, text: str) -> str | None:
        """Text -> mp3 file path, or None when disabled / the API fails."""
        if not self._api_key:
            return None
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=30) as client:
                resp = await client.post(
                    f"{_API}/{self._voice_id}",
                    headers={"xi-api-key": self._api_key},
                    json={
                        "text": text,
                        "model_id": "eleven_turbo_v2_5",
                        "voice_settings": {"stability": 0.45, "similarity_boost": 0.7},
                    },
                )
                resp.raise_for_status()
        except Exception as e:
            print(f"[voice] synthesis failed (text still goes): {e}")
            return None
        path = Path(tempfile.mkdtemp(prefix="beagle-voice-")) / "note.mp3"
        path.write_bytes(resp.content)
        return str(path)
