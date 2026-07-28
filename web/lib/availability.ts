// Availability text -> weekday indexes (0=Mon .. 6=Sun) for the day-pill strip.
// Deliberately heuristic: the source is a distilled free-text field.

const ALL = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [0, 1, 2, 3, 4];
const WEEKEND = [5, 6];

const DAY_WORDS: [string, number][] = [
  ["monday", 0], ["tuesday", 1], ["wednesday", 2], ["thursday", 3],
  ["friday", 4], ["saturday", 5], ["sunday", 6],
];

export function availableDays(text: string | null | undefined): number[] {
  if (!text) return [];
  const t = text.toLowerCase();
  const named = DAY_WORDS.filter(([w]) => t.includes(w)).map(([, i]) => i);
  if (named.length) return named;
  if (t.includes("weekend")) return WEEKEND;
  if (t.includes("weekday")) return WEEKDAYS;
  if (t.includes("evening") || t.includes("night") || t.includes("whenever") || t.includes("most"))
    return ALL;
  return ALL; // something was said but unparseable -> assume flexible
}

export const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

// Availability text -> hour blocks per day, for the week heatmap.
// Returns [day, startHour, endHour) triples (0=Mon .. 6=Sun, 24h clock).
export type HourBlock = [number, number, number];

export function availableBlocks(text: string | null | undefined): HourBlock[] {
  if (!text) return [];
  const t = text.toLowerCase();
  const days = availableDays(text);

  // time-of-day window from the phrasing
  let start = 11;
  let end = 22; // sensible default when only days are known
  const after = t.match(/after\s+(\d{1,2})\s*(pm|am)?/);
  if (after) {
    const h = parseInt(after[1], 10);
    start = after[2] === "am" ? h : h < 12 ? h + 12 : h;
    end = 23;
  } else if (t.includes("after work")) {
    start = 18; end = 22;
  } else if (t.includes("late night")) {
    start = 21; end = 24;
  } else if (t.includes("evening") || t.includes("night")) {
    start = 17; end = 23;
  } else if (t.includes("morning")) {
    start = 8; end = 12;
  } else if (t.includes("afternoon")) {
    start = 12; end = 17;
  } else if (t.includes("anytime") || t.includes("whenever") || t.includes("flexible")) {
    start = 10; end = 23;
  }
  if (end <= start) end = Math.min(start + 3, 24);
  return days.map((d) => [d, start, end] as HourBlock);
}
