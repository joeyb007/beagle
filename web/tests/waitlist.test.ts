// Waitlist writes from the public landing page.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeEach, expect, test } from "vitest";

import { addWaitlistEmail } from "../lib/db";

let dbPath: string;

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), "beagle-")), "data.sqlite");
  const schema = readFileSync(join(__dirname, "../../schema.sql"), "utf8");
  const db = new Database(dbPath);
  db.exec(schema);
  db.close();
  process.env.DATABASE_PATH = dbPath;
});

function rows(): { email: string }[] {
  return new Database(dbPath).prepare("SELECT email FROM waitlist").all() as { email: string }[];
}

test("valid email is normalized and inserted", () => {
  expect(addWaitlistEmail("  Maya@Example.COM ")).toBe(true);
  expect(rows()).toEqual([{ email: "maya@example.com" }]);
});

test("duplicate email is idempotent success", () => {
  expect(addWaitlistEmail("maya@example.com")).toBe(true);
  expect(addWaitlistEmail("maya@example.com")).toBe(true);
  expect(rows()).toHaveLength(1);
});

test("junk email is rejected and not stored", () => {
  expect(addWaitlistEmail("not-an-email")).toBe(false);
  expect(addWaitlistEmail("")).toBe(false);
  expect(rows()).toHaveLength(0);
});

test("works even against a pre-waitlist database (table created on demand)", () => {
  const db = new Database(dbPath);
  db.exec("DROP TABLE waitlist");
  db.close();
  expect(addWaitlistEmail("max@example.com")).toBe(true);
  expect(rows()).toEqual([{ email: "max@example.com" }]);
});
