// Home widgets: up-next hangout, co-attendance stats, on-this-day memory.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeEach, expect, test } from "vitest";

import { onThisDay, peopleStats, upcomingFor } from "../lib/db";

let dbPath: string;

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), "beagle-")), "data.sqlite");
  new Database(dbPath).exec(readFileSync(join(__dirname, "../../schema.sql"), "utf8"));
  process.env.DATABASE_PATH = dbPath;
  const conn = new Database(dbPath);
  const ins = conn.prepare("INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, '{}', 0)");
  ins.run("+me", "Joseph");
  ins.run("+2", "Maya");
  ins.run("+3", "Sam");
});

function seedArtifact(planId: string, time: string, attendees: string[], photos: string[] = []) {
  new Database(dbPath)
    .prepare(
      "INSERT INTO artifacts (plan_id, place, time, attendees, playlist, photos) VALUES (?, ?, ?, ?, '[]', ?)"
    )
    .run(planId, JSON.stringify({ name: planId }), time, JSON.stringify(attendees), JSON.stringify(photos));
}

test("upcomingFor returns the soonest future hangout with co-attendee names", () => {
  seedArtifact("past", "2020-01-01T19:00:00", ["+me", "+2"]);
  seedArtifact("later", "2099-06-01T19:00:00", ["+me", "+3"]);
  seedArtifact("soon", "2099-01-01T19:00:00", ["+me", "+2"]);
  seedArtifact("not-mine", "2098-01-01T19:00:00", ["+3"]);
  const up = upcomingFor("+me");
  expect(up?.plan_id).toBe("soon");
  expect(up?.others).toEqual(["Maya"]);
});

test("upcomingFor is null with nothing scheduled", () => {
  seedArtifact("past", "2020-01-01T19:00:00", ["+me"]);
  expect(upcomingFor("+me")).toBeNull();
});

test("peopleStats finds most-seen friend and the one longest unseen", () => {
  seedArtifact("a1", "2024-01-01T19:00:00", ["+me", "+2"]);
  seedArtifact("a2", "2024-02-01T19:00:00", ["+me", "+2"]);
  seedArtifact("a3", "2023-05-01T19:00:00", ["+me", "+3"]);
  seedArtifact("future", "2099-01-01T19:00:00", ["+me", "+3"]); // future never counts
  const stats = peopleStats("+me");
  expect(stats.mostSeen).toMatchObject({ name: "Maya", count: 2 });
  expect(stats.longestUnseen).toMatchObject({ name: "Sam", lastTime: "2023-05-01T19:00:00" });
});

test("peopleStats handles a solo history gracefully", () => {
  seedArtifact("solo", "2024-01-01T19:00:00", ["+me"]);
  const stats = peopleStats("+me");
  expect(stats.mostSeen).toBeNull();
  expect(stats.longestUnseen).toBeNull();
});

test("onThisDay picks the past photo closest to today's calendar date", () => {
  const now = new Date();
  const near = new Date(now);
  near.setFullYear(now.getFullYear() - 2);
  near.setDate(near.getDate() - 3); // ~3 days off today's month/day, years ago
  seedArtifact("near", near.toISOString().slice(0, 19), ["+me", "+2"], ["/uploads/near.svg"]);
  seedArtifact("far", `${now.getFullYear() - 1}-01-15T19:00:00`, ["+me"], ["/uploads/far.svg"]);
  seedArtifact("no-photos", now.toISOString().slice(0, 19), ["+me"]);
  const memory = onThisDay("+me");
  expect(memory?.plan_id).toBe("near");
  expect(memory?.src).toBe("/uploads/near.svg");
  expect(memory?.others).toEqual(["Maya"]);
});

test("onThisDay is null with no photographed past hangouts", () => {
  seedArtifact("future", "2099-01-01T19:00:00", ["+me"], ["/uploads/x.svg"]);
  expect(onThisDay("+me")).toBeNull();
});
