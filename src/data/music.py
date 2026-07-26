"""T6 — MusicProvider: group-blended, occasion-tuned playlist (FR22-25).

Per handle we pull a genre taste: real Spotify `user-top-read` when a token
exists (lazy `spotipy`), else a fallback derived from the person's distilled
vibe so the harness composes a real, varied tracklist offline. Tastes are
blended, tuned to the occasion's energy, and a tracklist is **composed** from a
built-in catalog — we never write to anyone's Spotify account. `taste_vector`
exposes the per-person genre vector the matching engine (T7/T8) fuses.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote

from ..contracts import Track
from .db import connect
from .embeddings import GENRE_VOCAB, taste_to_vector

# distilled vibe -> genres, so a no-token person still gets a taste offline
_VIBE_GENRES = {
    "chill": ["indie", "r&b", "ambient", "folk"],
    "cozy": ["folk", "indie", "ambient"],
    "quiet": ["ambient", "classical", "jazz"],
    "party": ["edm", "house", "pop", "reggaeton", "hip hop"],
    "dancing": ["house", "edm", "pop", "funk"],
    "upscale": ["jazz", "soul", "classical"],
    "outdoors": ["folk", "country", "indie"],
    "adventurous": ["indie", "rock", "afrobeat"],
    "dive-bar": ["rock", "punk", "alternative"],
    "live-music": ["rock", "soul", "funk"],
}

# occasion -> target energy (0 calm … 1 hype)
_OCCASION_ENERGY = [
    (("party", "birthday", "club", "night out", "celebrate", "rave", "bday"), 0.85),
    (("bar", "drinks", "happy hour", "pregame"), 0.65),
    (("hike", "walk", "park", "outdoors", "beach", "picnic"), 0.5),
    (("dinner", "brunch", "coffee", "study", "movie", "chill", "cozy", "lunch"), 0.35),
]

# (title, artist, genre, energy) — genres are from GENRE_VOCAB
_CATALOG = [
    ("Blinding Lights", "The Weeknd", "pop", 0.80),
    ("Levitating", "Dua Lipa", "pop", 0.75),
    ("As It Was", "Harry Styles", "pop", 0.60),
    ("Electric Feel", "MGMT", "indie", 0.60),
    ("Sofia", "Clairo", "indie", 0.45),
    ("The Less I Know the Better", "Tame Impala", "indie", 0.60),
    ("Mr. Brightside", "The Killers", "rock", 0.80),
    ("Everlong", "Foo Fighters", "rock", 0.85),
    ("Do I Wanna Know?", "Arctic Monkeys", "alternative", 0.60),
    ("Somebody Told Me", "The Killers", "alternative", 0.75),
    ("SICKO MODE", "Travis Scott", "hip hop", 0.80),
    ("Alright", "Kendrick Lamar", "hip hop", 0.65),
    ("HUMBLE.", "Kendrick Lamar", "rap", 0.80),
    ("Nonstop", "Drake", "rap", 0.70),
    ("Best Part", "Daniel Caesar", "r&b", 0.35),
    ("Come Through and Chill", "Miguel", "r&b", 0.40),
    ("Valerie", "Amy Winehouse", "soul", 0.60),
    ("Ain't No Mountain High Enough", "Marvin Gaye", "soul", 0.70),
    ("Midnight City", "M83", "electronic", 0.70),
    ("Strobe", "deadmau5", "electronic", 0.60),
    ("One More Time", "Daft Punk", "house", 0.85),
    ("Losing It", "FISHER", "house", 0.85),
    ("Opus", "Eric Prydz", "techno", 0.80),
    ("Titanium", "David Guetta", "edm", 0.85),
    ("Wake Me Up", "Avicii", "edm", 0.80),
    ("Take Five", "Dave Brubeck", "jazz", 0.40),
    ("So What", "Miles Davis", "jazz", 0.35),
    ("Clair de Lune", "Claude Debussy", "classical", 0.20),
    ("The Night We Met", "Lord Huron", "folk", 0.35),
    ("Ho Hey", "The Lumineers", "folk", 0.50),
    ("Tennessee Whiskey", "Chris Stapleton", "country", 0.45),
    ("The Bones", "Maren Morris", "country", 0.50),
    ("Vivir Mi Vida", "Marc Anthony", "latin", 0.75),
    ("Tití Me Preguntó", "Bad Bunny", "reggaeton", 0.80),
    ("Con Altura", "Rosalía", "reggaeton", 0.80),
    ("Dynamite", "BTS", "k-pop", 0.80),
    ("How You Like That", "BLACKPINK", "k-pop", 0.85),
    ("Enter Sandman", "Metallica", "metal", 0.85),
    ("American Idiot", "Green Day", "punk", 0.85),
    ("Uptown Funk", "Mark Ronson", "funk", 0.80),
    ("September", "Earth, Wind & Fire", "funk", 0.80),
    ("Essence", "Wizkid", "afrobeat", 0.60),
    ("Weightless", "Marconi Union", "ambient", 0.10),
    ("An Ending (Ascent)", "Brian Eno", "ambient", 0.15),
]

_VOCAB = set(GENRE_VOCAB)


def _occasion_energy(occasion: str) -> float:
    o = (occasion or "").lower()
    for keys, energy in _OCCASION_ENERGY:
        if any(k in o for k in keys):
            return energy
    return 0.55


def _track_url(title: str, artist: str) -> str:
    return "https://open.spotify.com/search/" + quote(f"{title} {artist}")


class SqliteMusicProvider:
    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db = db_path

    # -- taste sourcing -------------------------------------------------------

    def _spotify_taste(self, access_token: str) -> dict[str, float] | None:
        try:
            import spotipy  # lazy — only when a real token exists
            sp = spotipy.Spotify(auth=access_token)
            top = sp.current_user_top_artists(limit=20)
        except Exception:
            return None
        weights: dict[str, float] = {}
        for rank, artist in enumerate(top.get("items", [])):
            w = 1.0 / (1 + rank)
            for raw in artist.get("genres", []):
                for g in GENRE_VOCAB:
                    if g in raw:  # "indie pop" -> indie & pop
                        weights[g] = weights.get(g, 0.0) + w
        return weights or None

    def _fallback_taste(self, handle: str) -> dict[str, float]:
        """Derive a taste from the person's distilled vibe (offline-friendly)."""
        conn = connect(self._db)
        try:
            row = conn.execute(
                "SELECT json FROM profiles WHERE handle = ?", (handle,)
            ).fetchone()
        finally:
            conn.close()
        weights: dict[str, float] = {"pop": 0.3, "indie": 0.3}
        if row:
            vibe = json.loads(row["json"]).get("vibe", [])
            for v in vibe:
                for g in _VIBE_GENRES.get(v, []):
                    weights[g] = weights.get(g, 0.0) + 1.0
        return weights

    def _taste_for(self, handle: str) -> dict[str, float]:
        conn = connect(self._db)
        try:
            row = conn.execute(
                "SELECT access_token FROM oauth_tokens "
                "WHERE handle = ? AND provider = 'spotify'",
                (handle,),
            ).fetchone()
        finally:
            conn.close()
        if row:
            taste = self._spotify_taste(row["access_token"])
            if taste:
                return taste
        return self._fallback_taste(handle)

    # -- ports ----------------------------------------------------------------

    async def taste_vector(self, handle: str) -> list[float]:
        """Per-person genre vector for matching (extends the port, used by T7/T8)."""
        return taste_to_vector(self._taste_for(handle)).astype(float).tolist()

    async def blend_playlist(self, handles: list[str], occasion: str) -> list[Track]:
        blended: dict[str, float] = {}
        for h in handles:
            for genre, w in self._taste_for(h).items():
                if genre in _VOCAB:
                    blended[genre] = blended.get(genre, 0.0) + w
        total = sum(blended.values()) or 1.0
        blended = {g: w / total for g, w in blended.items()}

        target = _occasion_energy(occasion)
        scored = []
        for title, artist, genre, energy in _CATALOG:
            taste_w = blended.get(genre, 0.05)          # floor lets occasion shine
            fit = 1.0 - abs(energy - target)
            scored.append((taste_w * fit, title, artist, genre))
        scored.sort(key=lambda x: x[0], reverse=True)

        tracks, per_artist = [], {}
        for _, title, artist, _genre in scored:
            if per_artist.get(artist, 0) >= 1:          # variety: 1 per artist
                continue
            per_artist[artist] = per_artist.get(artist, 0) + 1
            tracks.append(Track(title=title, artist=artist, url=_track_url(title, artist)))
            if len(tracks) >= 12:
                break
        return tracks
