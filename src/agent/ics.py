"""Build an .ics calendar invite for a locked plan — tap it in iMessage and
the hangout lands on your real calendar."""

import tempfile
from datetime import timedelta
from pathlib import Path

from src.contracts import FinalPlan

_ICS_TEMPLATE = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//beagle//hangout//EN
METHOD:PUBLISH
BEGIN:VEVENT
UID:{uid}@beagle
DTSTART:{start}
DTEND:{end}
SUMMARY:{summary}
LOCATION:{location}
DESCRIPTION:{description}
END:VEVENT
END:VCALENDAR
"""


def _stamp(dt) -> str:
    return dt.strftime("%Y%m%dT%H%M%S")


def build_ics(plan: FinalPlan, attendee_names: list[str]) -> str:
    """Write the invite to a temp file; return its path for the file send."""
    body = _ICS_TEMPLATE.format(
        uid=plan.plan_id,
        start=_stamp(plan.time),
        end=_stamp(plan.time + timedelta(hours=2)),
        summary=f"🐶 {plan.place.name}",
        location=f"{plan.place.name}{f', {plan.place.area}' if plan.place.area else ''}",
        description=f"planned by beagle — with {', '.join(attendee_names)}",
    )
    path = Path(tempfile.mkdtemp(prefix="beagle-ics-")) / "hangout.ics"
    path.write_text(body)
    return str(path)
