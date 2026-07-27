# Branch D — data & intelligence. See docs/branch-d.md.
#
# Concrete implementations of the D-owned ports in contracts.py. wiring.py (A)
# constructs these with the real MergeRouter injected and points them at the
# shared data.sqlite — no code changes at consolidation, just real deps.

from .context import SqliteContextUpdater
from .distiller import Distiller
from .embeddings import EmbeddingBuilder
from .gcal import GoogleCalendarProvider
from .matching import SqliteMatchingService
from .message_log import SqliteMessageLog
from .music import SqliteMusicProvider
from .refresh import SqliteProfileRefresher
from .store import SqliteProfileStore
from .voice import SqliteVoiceProvider

__all__ = [
    "Distiller",
    "EmbeddingBuilder",
    "GoogleCalendarProvider",
    "SqliteContextUpdater",
    "SqliteMatchingService",
    "SqliteMessageLog",
    "SqliteMusicProvider",
    "SqliteProfileRefresher",
    "SqliteProfileStore",
    "SqliteVoiceProvider",
]
