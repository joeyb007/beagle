// lib/db.ts — typed reader/writer over the shared SQLite seam (schema.sql).
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeEach, expect, test } from "vitest";

import {
  addImport,
  ensureProfile,
  getProfile,
  listMatches,
  listProfiles,
  listRoutingLog,
  updateProfile,
  upsertToken,
} from "../lib/db";

let dbPath: string;

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), "beagle-")), "data.sqlite");
  const schema = readFileSync(join(__dirname, "../../schema.sql"), "utf8");
  const db = new Database(dbPath);
  db.exec(schema);
  db.prepare(
    "INSERT INTO profiles (handle, name, json, constraint_score) VALUES (?, ?, ?, ?)"
  ).run(
    "+15550000001",
    "Rayhan",
    JSON.stringify({ handle: "+15550000001", name: "Rayhan", cuisines: ["sushi"], hard_nos: ["clubs"] }),
    0.9
  );
  db.prepare(
    "INSERT INTO matches (handle, match_name, score, reasons, is_sample) VALUES (?, ?, ?, ?, 1)"
  ).run("+15550000001", "Sam", 0.92, JSON.stringify(["also loves tacos"]));
  db.prepare(
    "INSERT INTO routing_log (model, tier, cost_estimate, latency_ms) VALUES (?, ?, ?, ?)"
  ).run("small-1", "cheap", 0.0002, 340);
  db.close();
  process.env.DATABASE_PATH = dbPath;
});

test("listProfiles returns parsed profile json with score", () => {
  const profiles = listProfiles();
  expect(profiles).toHaveLength(1);
  expect(profiles[0].name).toBe("Rayhan");
  expect(profiles[0].data.cuisines).toEqual(["sushi"]);
  expect(profiles[0].constraint_score).toBe(0.9);
});

test("updateProfile persists edited fields (the trust surface)", () => {
  updateProfile("+15550000001", {
    name: "Rayhan A.",
    data: { cuisines: ["sushi", "korean"], hard_nos: [] },
    constraint_score: 0.4,
  });
  const p = getProfile("+15550000001")!;
  expect(p.name).toBe("Rayhan A.");
  expect(p.data.cuisines).toContain("korean");
  expect(p.data.hard_nos).toEqual([]);
  expect(p.constraint_score).toBe(0.4);
});

test("addImport writes pending raw text for D to distill", () => {
  addImport("maya: tacos friday?\nrayhan: cant, gym");
  const row = new Database(dbPath)
    .prepare("SELECT raw_text, status FROM imports")
    .get() as { raw_text: string; status: string };
  expect(row.raw_text).toContain("tacos friday");
  expect(row.status).toBe("pending");
});

test("upsertToken writes then overwrites a provider token", () => {
  upsertToken("+15550000001", "spotify", { access_token: "a1", refresh_token: "r1" });
  upsertToken("+15550000001", "spotify", { access_token: "a2", refresh_token: "r2" });
  const row = new Database(dbPath)
    .prepare("SELECT access_token FROM oauth_tokens WHERE handle=? AND provider=?")
    .get("+15550000001", "spotify") as { access_token: string };
  expect(row.access_token).toBe("a2");
});

test("listMatches and listRoutingLog surface seeded rows", () => {
  expect(listMatches()[0]).toMatchObject({
    match_name: "Sam",
    is_sample: true,
    reasons: ["also loves tacos"],
  });
  expect(listRoutingLog()[0]).toMatchObject({ model: "small-1", tier: "cheap" });
});

test("ensureProfile provisions by number and upgrades placeholder names only", () => {
  ensureProfile("+16475550000");                       // first sign-in, no name
  expect(getProfile("+16475550000")?.name).toBe("+16475550000");
  ensureProfile("+16475550000", "Joey");               // placeholder upgraded
  expect(getProfile("+16475550000")?.name).toBe("Joey");
  ensureProfile("+16475550000", "Someone Else");       // real name never clobbered
  expect(getProfile("+16475550000")?.name).toBe("Joey");
});
