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
