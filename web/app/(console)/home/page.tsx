// Home: your social-planning assistant's desk. Beagle opens the conversation
// with a real observation and takes questions ("who's free thursday?");
// up-next and your self-editable card sit beside it; the availability heat
// map shows the week; the polaroid string closes the page.
import Link from "next/link";
import { availableBlocks } from "@/lib/availability";
import {
  googleSyncedHandles,
  groupsFor,
  listProfiles,
  photoMemories,
  upcomingDetail,
  upcomingFor,
} from "@/lib/db";
import { currentUser } from "@/lib/session";
import { StringStrip } from "@/app/string-strip";
import { HeatCrew, HeatPerson, WeekHeat } from "./week-heat";
import { PlannerChat } from "./planner-chat";
import { UpNextCard } from "./up-next-card";
import { YouCard } from "./you-card";

function daysUntil(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

export default async function Home() {
  const user = await currentUser();
  if (!user) return null; // AuthGate shows the sign-in modal

  const groups = groupsFor(user.handle);
  const upNext = upcomingFor(user.handle);
  const upDetail = upcomingDetail(user.handle);
  const memories = photoMemories(user.handle);
  const byHandle = new Map(listProfiles().map((p) => [p.handle, p]));
  const synced = googleSyncedHandles();
  const first = user.name.split(" ")[0];

  // Beagle's opening brief: one true observation, most urgent first.
  const stalest = [...groups].sort(
    (a, b) => (b.daysSince ?? 999) - (a.daysSince ?? 999)
  )[0];
  const quietLine =
    stalest && (stalest.daysSince === null || stalest.daysSince > 21)
      ? `${stalest.name} ${stalest.daysSince === null ? "still hasn't hung out" : `has been quiet for ${stalest.daysSince} days`}. want me to stir them?`
      : null;
  const nextLine = upNext ? `${upNext.place} is locked for ${daysUntil(upNext.time)}.` : null;
  const brief =
    [nextLine, quietLine].filter(Boolean).join(" ") ||
    `all quiet on my end, ${first.toLowerCase()}. what are we planning?`;
  const chips = [
    "who's free this weekend?",
    ...(stalest ? [`what should ${stalest.name} do together?`] : []),
    "how do i start a plan?",
  ];

  // whole friend graph (not just crews) so the heatmap scales with the network
  const people: HeatPerson[] = listProfiles()
    .filter((p) => !p.data.nearby && p.handle !== user.handle)
    .map((p) => ({
      name: p.name,
      blocks: availableBlocks(p.data.typical_availability ?? null),
      synced: synced.has(p.handle),
    }));
  const crews: HeatCrew[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    members: g.members.map((h) => byHandle.get(h)?.name ?? h),
  }));

  return (
    <>
      <p className="eyebrow">home</p>
      <h1 className="persona-headline">what&apos;s the move, {first}?</h1>

      <div className="home-hero">
        <PlannerChat handle={user.handle} brief={brief} chips={chips} />

        <div className="home-rail">
          {upDetail ? (
            <UpNextCard plan={upDetail} />
          ) : (
            <div className="card widget">
              <h2 style={{ marginTop: 0 }}>Up next</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                nothing locked. ask beagle to get one moving
              </p>
            </div>
          )}

          <YouCard
            you={{
              name: user.name,
              personaLabel: user.data.persona_label ?? null,
              availability: user.data.typical_availability ?? null,
              cuisines: user.data.cuisines ?? [],
              hardNos: user.data.hard_nos ?? [],
            }}
          />
        </div>
      </div>

      {people.length > 0 && <WeekHeat people={people} crews={crews} />}

      <StringStrip memories={memories} />
    </>
  );
}

export const dynamic = "force-dynamic";
