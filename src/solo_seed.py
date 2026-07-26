"""Solo-test seed: make the profiles table exactly one real, allowlisted human.

Fan-out DMs every profile, and non-allowlisted targets hard-fail on the shared
line — so for a solo run the table must contain only you. Teammates get added
back via onboarding/distillation when they're awake.

Run: .venv/bin/python -m src.solo_seed "+16475550132" "Joseph"
"""

import json
import sqlite3
import sys

from src.wiring import REPO_ROOT


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit('usage: python -m src.solo_seed "+1XXXXXXXXXX" "Name"')
    handle, name = sys.argv[1], sys.argv[2]

    profile = {
        "handle": handle,
        "name": name,
        "cuisines": ["sushi", "tacos"],
        "vibe": ["low-key"],
        "hard_nos": ["clubs"],
        "typical_availability": "weekend evenings",
        "persona_label": "the planner",
        "notes": "solo test profile",
    }
    db = sqlite3.connect(REPO_ROOT / "data.sqlite")
    with db:
        db.execute("DELETE FROM profiles")
        db.execute(
            "INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, ?)",
            (handle, name, json.dumps(profile), 0.5),
        )
    rows = db.execute("SELECT handle, name FROM profiles").fetchall()
    print(f"profiles now: {rows} — fan-out will DM only this number")


if __name__ == "__main__":
    main()
