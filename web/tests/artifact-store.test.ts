// lib/artifact-store.ts — web-side ArtifactStore over the shared artifacts table.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeEach, expect, test } from "vitest";

import { ArtifactStore } from "../lib/artifact-store";

let dbPath: string;

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), "beagle-")), "data.sqlite");
  new Database(dbPath).exec(readFileSync(join(__dirname, "../../schema.sql"), "utf8"));
  process.env.DATABASE_PATH = dbPath;
});

function insertAgentStyleRow() {
  // exactly the shape the agent's Python SqliteArtifactStore writes at plan-lock
  new Database(dbPath)
    .prepare(
      "INSERT INTO artifacts (plan_id, place, time, attendees, playlist) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      "plan-agent-1",
      JSON.stringify({ name: "Ebisu Sushi", area: "Inner Sunset", url: null, note: null }),
      "2026-08-01T19:00:00",
      JSON.stringify(["+15550000001", "+15550000002"]),
      JSON.stringify([{ title: "Blend Opener", artist: "The Stubs", url: null }])
    );
}

test("reads an artifact row the agent wrote (cross-language seam)", () => {
  insertAgentStyleRow();
  const a = new ArtifactStore().get("plan-agent-1")!;
  expect(a.place.name).toBe("Ebisu Sushi");
  expect(a.attendees).toHaveLength(2);
  expect(a.playlist[0].artist).toBe("The Stubs");
  expect(a.photos).toEqual([]);
  expect(a.isKeepsake).toBe(false);
});

test("create + get round-trips through the web side", () => {
  const store = new ArtifactStore();
  store.create(
    { plan_id: "p2", place: { name: "Tacos El Rey" }, time: "2026-08-02T19:00:00", attendees: ["+1555"] },
    [{ title: "t", artist: "a" }]
  );
  expect(store.get("p2")!.place.name).toBe("Tacos El Rey");
});

test("addPhotos appends and flips to keepsake state", () => {
  insertAgentStyleRow();
  const store = new ArtifactStore();
  store.addPhotos("plan-agent-1", ["/uploads/a.jpg"]);
  store.addPhotos("plan-agent-1", ["/uploads/b.jpg"]);
  const a = store.get("plan-agent-1")!;
  expect(a.photos).toEqual(["/uploads/a.jpg", "/uploads/b.jpg"]);
  expect(a.isKeepsake).toBe(true);
});

test("list surfaces newest first for the hangouts index", () => {
  insertAgentStyleRow();
  const store = new ArtifactStore();
  store.create(
    { plan_id: "p3", place: { name: "Later Spot" }, time: "2026-08-03T19:00:00", attendees: [] },
    []
  );
  expect(store.list()[0].plan_id).toBe("p3");
});
