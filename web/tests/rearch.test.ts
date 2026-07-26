// Re-arch data layer: groups, photos-of-person, visibility/notes, availability pills.
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeEach, expect, test } from "vitest";

import {
  createGroup,
  createSpark,
  photoMemories,
  getGroup,
  listGroupsWithHangouts,
  photosOf,
  setArtifactNote,
  setArtifactVisibility,
} from "../lib/db";
import { availableDays } from "../lib/availability";
import { ArtifactStore } from "../lib/artifact-store";

let dbPath: string;

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), "beagle-")), "data.sqlite");
  new Database(dbPath).exec(readFileSync(join(__dirname, "../../schema.sql"), "utf8"));
  process.env.DATABASE_PATH = dbPath;
});

function seedArtifact(planId: string, time: string, attendees: string[], photos: string[] = [], groupId?: number) {
  new Database(dbPath)
    .prepare(
      "INSERT INTO artifacts (plan_id, place, time, attendees, playlist, photos, group_id) VALUES (?, ?, ?, ?, '[]', ?, ?)"
    )
    .run(planId, JSON.stringify({ name: planId }), time, JSON.stringify(attendees), JSON.stringify(photos), groupId ?? null);
}

test("createGroup + listGroupsWithHangouts computes last and upcoming", () => {
  const id = createGroup("the gang", ["+1", "+2"]);
  seedArtifact("past", "2020-01-01T19:00:00", ["+1", "+2"], [], id);
  seedArtifact("future", "2099-01-01T19:00:00", ["+1", "+2"], [], id);
  const groups = listGroupsWithHangouts();
  expect(groups).toHaveLength(1);
  expect(groups[0].name).toBe("the gang");
  expect(groups[0].members).toEqual(["+1", "+2"]);
  expect(groups[0].lastHangout?.plan_id).toBe("past");
  expect(groups[0].upcomingHangout?.plan_id).toBe("future");
  expect(getGroup(id)?.name).toBe("the gang");
});

test("photosOf returns photos only from hangouts the person attended", () => {
  seedArtifact("mine", "2024-01-01T19:00:00", ["+1", "+2"], ["/uploads/a.jpg", "/uploads/b.jpg"]);
  seedArtifact("not-mine", "2024-01-02T19:00:00", ["+3"], ["/uploads/c.jpg"]);
  expect(photosOf("+1")).toEqual(["/uploads/a.jpg", "/uploads/b.jpg"]);
});

test("visibility toggles and note persists on the artifact", () => {
  seedArtifact("p1", "2024-01-01T19:00:00", ["+1"]);
  setArtifactVisibility("p1", "public");
  setArtifactNote("p1", "the night the karaoke machine broke");
  const a = new ArtifactStore().get("p1")!;
  expect(a.visibility).toBe("public");
  expect(a.note).toBe("the night the karaoke machine broke");
});

test("availableDays maps availability text to weekday indexes (0=Mon)", () => {
  expect(availableDays("weekends only")).toEqual([5, 6]);
  expect(availableDays("most evenings")).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(availableDays("after 8pm on weekdays")).toEqual([0, 1, 2, 3, 4]);
  expect(availableDays(null)).toEqual([]);
});

test("photoMemories returns photos with their hangout context", () => {
  new Database(dbPath)
    .prepare("INSERT OR REPLACE INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, 0)")
    .run("+2", "Maya", JSON.stringify({ handle: "+2", name: "Maya" }));
  seedArtifact("m1", "2026-07-18T19:00:00", ["+1", "+2"], ["/uploads/a.svg", "/uploads/b.svg"]);
  new Database(dbPath).prepare("UPDATE artifacts SET note = ? WHERE plan_id = 'm1'").run("wild night");
  const memories = photoMemories("+1");
  expect(memories).toHaveLength(2);
  expect(memories[0]).toMatchObject({
    src: "/uploads/a.svg",
    plan_id: "m1",
    place: "m1",
    note: "wild night",
    others: ["Maya"],
  });
});

test("createSpark inserts a pending spark for the agent to send", () => {
  seedArtifact("s1", "2026-07-18T19:00:00", ["+1"]);
  createSpark("s1", "+1");
  const row = new Database(dbPath)
    .prepare("SELECT plan_id, requested_by, status FROM sparks")
    .get() as { plan_id: string; requested_by: string; status: string };
  expect(row).toMatchObject({ plan_id: "s1", requested_by: "+1", status: "pending" });
});
