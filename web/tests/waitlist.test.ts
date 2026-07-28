// Waitlist writes from the public landing page — phone-keyed, unique, with a
// count for the operator. Sqlite driver (the default) under test.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeEach, expect, test } from "vitest";

import { addWaitlistPhone, waitlistCount } from "../lib/waitlist";

let dbPath: string;

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), "beagle-wl-")), "data.sqlite");
  process.env.DATABASE_PATH = dbPath;
});

function rows(): { phone: string }[] {
  return new Database(dbPath).prepare("SELECT phone FROM waitlist").all() as { phone: string }[];
}

test("numbers normalize to E.164 and stay unique", async () => {
  expect(await addWaitlistPhone("6475550132")).toBe("added");
  expect(await addWaitlistPhone("(647) 555-0132")).toBe("duplicate"); // same number, other format
  expect(await addWaitlistPhone("+1 647 555 0132")).toBe("duplicate");
  expect(rows()).toEqual([{ phone: "+16475550132" }]);
  expect(await waitlistCount()).toBe(1);
});

test("garbage input is rejected without writing", async () => {
  expect(await addWaitlistPhone("not a number")).toBe("invalid");
  expect(await addWaitlistPhone("12345")).toBe("invalid");
  expect(await waitlistCount()).toBe(0);
});

test("counts distinct numbers", async () => {
  await addWaitlistPhone("6475550132");
  await addWaitlistPhone("9295550252");
  await addWaitlistPhone("6475550132");
  expect(await waitlistCount()).toBe(2);
});

test("migrates a legacy email-keyed table out of the way", async () => {
  const db = new Database(dbPath);
  db.exec("CREATE TABLE waitlist (email TEXT PRIMARY KEY, ts TEXT)");
  db.prepare("INSERT INTO waitlist (email) VALUES (?)").run("old@example.com");
  db.close();

  expect(await addWaitlistPhone("6475550132")).toBe("added");
  expect(rows()).toEqual([{ phone: "+16475550132" }]);
  const legacy = new Database(dbPath)
    .prepare("SELECT email FROM waitlist_email_legacy")
    .all() as { email: string }[];
  expect(legacy).toEqual([{ email: "old@example.com" }]); // nothing lost
});
