"""T7 — Multi-modal embeddings: fuse text/taste + music + image → profile_vector.

Three modality blocks, fixed dims so every profile (and every seeded match-pool
candidate) is comparable under cosine:

    text  (64)  deterministic feature-hash of the distilled profile
    music (24)  genre-space taste vector (from MusicProvider, T6)
    image (32)  CLIP embedding of profile/hangout photos, projected down

The text block is a dependency-light hash (offline, reproducible) so the harness
is fast and deterministic. The image block lazily loads CLIP via
`sentence-transformers` only when real photos are supplied; with none (the
isolation case) it is zeros and the fused vector rests on text+music. Blocks are
individually L2-normalized, weighted, concatenated, then normalized as a whole.
"""

from __future__ import annotations

import hashlib

import numpy as np

TEXT_DIM = 64
IMAGE_DIM = 32

# canonical genre space — index positions are the music-vector dimensions
GENRE_VOCAB = [
    "pop", "indie", "rock", "alternative", "hip hop", "rap", "r&b", "soul",
    "electronic", "house", "techno", "edm", "jazz", "classical", "folk",
    "country", "latin", "reggaeton", "k-pop", "metal", "punk", "funk",
    "afrobeat", "ambient",
]
MUSIC_DIM = len(GENRE_VOCAB)
_GENRE_INDEX = {g: i for i, g in enumerate(GENRE_VOCAB)}

PROFILE_DIM = TEXT_DIM + MUSIC_DIM + IMAGE_DIM

# fuse weights: taste-heavy but text-anchored
W_TEXT, W_MUSIC, W_IMAGE = 0.5, 0.3, 0.2

_clip_model = None          # lazy CLIP handle
_img_projection = None      # fixed 512 -> IMAGE_DIM projection


def _stable_hash(token: str) -> int:
    """Process-independent hash (Python's builtin hash is salted)."""
    return int.from_bytes(hashlib.md5(token.encode("utf-8")).digest()[:4], "big")


def _l2(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v


def text_vector(tokens: list[str], dim: int = TEXT_DIM) -> np.ndarray:
    """Signed feature-hashing of tokens into a normalized dense vector."""
    v = np.zeros(dim, dtype=np.float32)
    for tok in tokens:
        tok = tok.strip().lower()
        if not tok:
            continue
        h = _stable_hash(tok)
        v[h % dim] += 1.0 if (h >> 16) & 1 else -1.0
    return _l2(v)


def profile_tokens(
    cuisines: list[str], vibe: list[str], hard_nos: list[str],
    persona: str | None = None, price_band: str | None = None,
    notes: str | None = None,
) -> list[str]:
    """Flatten a profile's discrete signals into weighted tokens (repeat = weight)."""
    toks: list[str] = []
    for c in cuisines:
        toks += [f"cuisine:{c}"] * 2      # taste weighs double
    toks += [f"vibe:{v}" for v in vibe]
    toks += [f"no:{n}" for n in hard_nos]
    if persona:
        toks += [f"persona:{w}" for w in persona.lower().split()]
    if price_band:
        toks.append(f"price:{price_band}")
    if notes:
        toks += [f"note:{w}" for w in notes.lower().split()[:8]]
    return toks


def taste_to_vector(genre_weights: dict[str, float]) -> np.ndarray:
    """Map a genre→weight distribution onto the canonical genre space."""
    v = np.zeros(MUSIC_DIM, dtype=np.float32)
    for genre, w in genre_weights.items():
        idx = _GENRE_INDEX.get(genre.strip().lower())
        if idx is not None:
            v[idx] += float(w)
    return _l2(v)


def _load_clip():
    global _clip_model
    if _clip_model is None:
        from sentence_transformers import SentenceTransformer  # lazy, heavy
        _clip_model = SentenceTransformer("clip-ViT-B-32")
    return _clip_model


def _projection() -> np.ndarray:
    global _img_projection
    if _img_projection is None:
        rng = np.random.default_rng(1234)  # fixed seed → reproducible reduction
        _img_projection = rng.standard_normal((512, IMAGE_DIM)).astype(np.float32)
    return _img_projection


def image_vector(photo_paths: list[str] | None) -> np.ndarray:
    """CLIP-embed photos and project to IMAGE_DIM. Empty / unavailable → zeros."""
    if not photo_paths:
        return np.zeros(IMAGE_DIM, dtype=np.float32)
    try:
        from PIL import Image
        model = _load_clip()
        imgs = [Image.open(p).convert("RGB") for p in photo_paths]
        emb = np.asarray(model.encode(imgs))          # (n, 512)
        pooled = emb.mean(axis=0)                       # (512,)
        return _l2(pooled @ _projection())              # (IMAGE_DIM,)
    except Exception:
        return np.zeros(IMAGE_DIM, dtype=np.float32)    # stay green offline


def fuse(text_v: np.ndarray, music_v: np.ndarray, image_v: np.ndarray) -> list[float]:
    """Weighted concat of the three normalized modality blocks → unit vector."""
    parts = [
        _l2(text_v.astype(np.float32)) * W_TEXT,
        _l2(music_v.astype(np.float32)) * W_MUSIC,
        _l2(image_v.astype(np.float32)) * W_IMAGE,
    ]
    return _l2(np.concatenate(parts)).astype(float).tolist()


def cosine(a: list[float] | np.ndarray, b: list[float] | np.ndarray) -> float:
    a, b = np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


class EmbeddingBuilder:
    """Builds and attaches music_vector / image_vector / profile_vector on a Profile.

    `music` is any object exposing `async taste_vector(handle) -> list[float]`
    (D's SqliteMusicProvider); injected so there's no import cycle.
    """

    def __init__(self, music=None) -> None:
        self._music = music

    async def build(self, profile, photos: list[str] | None = None):
        text_v = text_vector(profile_tokens(
            profile.cuisines, profile.vibe, profile.hard_nos,
            profile.persona_label, profile.price_band, profile.notes,
        ))

        if self._music is not None:
            music_v = np.asarray(await self._music.taste_vector(profile.handle),
                                 dtype=np.float32)
        else:
            music_v = np.zeros(MUSIC_DIM, dtype=np.float32)

        image_v = image_vector(photos)

        profile.music_vector = music_v.astype(float).tolist()
        profile.image_vector = image_v.astype(float).tolist() if photos else None
        profile.profile_vector = fuse(text_v, music_v, image_v)
        return profile
