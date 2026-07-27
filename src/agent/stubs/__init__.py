"""Stubs for every port A consumes (branch doc: consume interfaces + stubs).

Used by src/agent/tests/ and the acceptance harness. Swapped for real
implementations in wiring.py at consolidation — never imported from there.
"""

from src.agent.stubs.stubs import (
    ScriptedLLM,
    StubArtifactStore,
    StubCalendar,
    StubContextUpdater,
    StubMatching,
    StubMessageLog,
    StubMessaging,
    StubMusic,
    StubProfileStore,
    StubRefresher,
    StubVoice,
)

__all__ = [
    "ScriptedLLM",
    "StubArtifactStore",
    "StubCalendar",
    "StubContextUpdater",
    "StubMatching",
    "StubMessageLog",
    "StubMessaging",
    "StubMusic",
    "StubProfileStore",
    "StubRefresher",
    "StubVoice",
]
