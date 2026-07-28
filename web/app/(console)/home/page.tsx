// Home: your social-planning assistant's desk. Beagle opens the conversation
// with a real observation and takes questions ("who's free thursday?");
// up-next and your self-editable card sit beside it; the availability heat
// map shows the week; the polaroid string closes the page.
import Link from "next/link";
import { availableDays } from "@/lib/availability";
import {
  googleSyncedHandles,
  groupsFor,
  listProfiles,
  photoMemories,
  upcomingFor,
} from "@/lib/db";
import { currentUser } from "@/lib/session";
import { StringStrip } from "@/app/string-strip";
import { AvailabilityGrid, GridCrew } from "./availability-grid";
import { PlannerChat } from "./planner-chat";
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

  const crews: GridCrew[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    members: g.members.map((h) => {
      const p = byHandle.get(h);
      return {
        name: p?.name ?? h,
        days: availableDays(p?.data.typical_availability ?? null),
        synced: synced.has(h),
      };
    }),
  }));

  return (
    <>
      <p className="eyebrow">home</p>
      <h1 className="persona-headline">what&apos;s the move, {first}?</h1>

      <div className="home-hero">
        <PlannerChat handle={user.handle} brief={brief} chips={chips} />

        <div className="home-rail">
          <div className="card widget">
            <h2 style={{ marginTop: 0 }}>Up next</h2>
            {upNext ? (
              <>
                <p className="widget-big">{upNext.place}</p>
                <p className="muted" style={{ margin: "2px 0 8px" }}>
                  {daysUntil(upNext.time)}
                  {upNext.others.length > 0 && <> · with {upNext.others.join(" & ")}</>}
                </p>
                <Link href={`/hangouts/${upNext.plan_id}`}>see the plan →</Link>
              </>
            ) : (
              <p className="muted" style={{ marginBottom: 0 }}>
                nothing locked. ask beagle to get one moving
              </p>
            )}
          </div>

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

      {crews.length > 0 && <AvailabilityGrid crews={crews} />}

      <StringStrip memories={memories} />
    </>
  );
}

export const dynamic = "force-dynamic";
