"""Seed fixtures for the offline harness and the matching demo.

- SAMPLE_CHAT   — a real-feeling group chat with 5 distinct personalities, so the
                  distiller yields varied profiles and a meaningful fan-out order.
- SAMPLE_REPLIES — the session's collected fan-out replies A hands to refresh().
- POOL          — labeled sample people for matching (is_sample=True), spread over
                  taste and distance so radius + cosine both visibly do work.
"""

from __future__ import annotations

SAMPLE_CHAT = """\
Rayhan (+15551110001): ok i can only do saturday, weekdays are dead for me
Rayhan (+15551110001): no sushi please i had it twice this week already
Rayhan (+15551110001): and keep it cheap im broke lol
Mia (+15551110002): im down whenever honestly
Mia (+15551110002): we should go dancing 🔥🔥
Mia (+15551110002): tacos then a dive bar?? that would be so fun
Theo (+15551110003): id prefer somewhere nice, fancy vibes
Theo (+15551110003): no mexican im kinda over it tbh
Theo (+15551110003): cant do mondays i have work
Theo (+15551110003): im vegetarian btw so keep that in mind
Lena (+15551110004): lowkey just wanna get ramen and chill
Lena (+15551110004): cozy spots >>>
Lena (+15551110004): im pretty flexible on days
Priya (+15551110005): can we do something outdoors? a hike maybe
Priya (+15551110005): im free weekends
Priya (+15551110005): no loud clubs pls
"""

# What comes back during the live fan-out; drives the plan-lock batch refresh.
SAMPLE_REPLIES = [
    {"handle": "+15551110001", "text": "im free saturday now, works great. and honestly down for ramen too"},
    {"handle": "+15551110002", "text": "tacos then dancing 🔥 im free friday"},
]

# Labeled sample pool for matching. lat/lon around a demo origin (San Francisco).
POOL = [
    {"name": "Maya",   "lat": 37.7802, "lon": -122.4100,
     "cuisines": ["japanese", "healthy"], "vibe": ["chill", "cozy"],
     "genres": ["indie", "r&b"], "persona": "the chill one"},
    {"name": "Diego",  "lat": 37.7602, "lon": -122.4300,
     "cuisines": ["mexican"], "vibe": ["party", "dancing"],
     "genres": ["reggaeton", "house"], "persona": "the party starter"},
    {"name": "Priya G.", "lat": 37.7901, "lon": -122.4000,
     "cuisines": ["indian", "italian"], "vibe": ["upscale"],
     "genres": ["jazz", "soul"], "persona": "the tastemaker"},
    {"name": "Sam",    "lat": 37.7500, "lon": -122.4500,
     "cuisines": ["american", "healthy"], "vibe": ["outdoors", "adventurous"],
     "genres": ["folk", "country"], "persona": "the adventurer"},
    {"name": "Jordan", "lat": 37.7700, "lon": -122.4200,
     "cuisines": ["american", "bbq"], "vibe": ["dive-bar"],
     "genres": ["rock", "punk"], "persona": "the wildcard"},
    {"name": "Aisha",  "lat": 37.7800, "lon": -122.4400,
     "cuisines": ["american"], "vibe": ["chill"],
     "genres": ["hip hop", "r&b"], "persona": "the tastemaker"},
    {"name": "Marcus", "lat": 37.7300, "lon": -122.4100,
     "cuisines": ["japanese", "thai"], "vibe": ["chill", "quiet"],
     "genres": ["ambient", "indie"], "persona": "the chill one"},
    {"name": "Leo",    "lat": 37.8044, "lon": -122.2712,   # Oakland (~15 km)
     "cuisines": ["italian"], "vibe": ["cozy"],
     "genres": ["indie", "folk"], "persona": "the chill one"},
    {"name": "Nina",   "lat": 37.3382, "lon": -121.8863,   # San Jose (~65 km)
     "cuisines": ["korean"], "vibe": ["party"],
     "genres": ["k-pop", "edm"], "persona": "the party starter"},
]

# Demo origin the querying user is anchored to for the radius prefilter.
DEMO_ORIGIN = (37.7749, -122.4194)
