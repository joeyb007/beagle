// Waitlist storage: phone numbers, unique, prod-ready.
//
// Two drivers behind one interface:
//   - default: the shared local SQLite (demo / dev — zero setup)
//   - production: any Postgres, selected by WAITLIST_DATABASE_URL or
//     POSTGRES_URL (Neon/Vercel/RDS all work — plain `pg` under the hood)
// Numbers normalize to E.164 before insert; the phone column is the primary
// key in both drivers, so duplicates are impossible at the storage layer.
import { db } from "./db";
import { normalizePhone } from "./phone";

const PG_URL = process.env.WAITLIST_DATABASE_URL ?? process.env.POSTGRES_URL;

// ------------------------------------------------------------------ sqlite

function sqliteEnsure() {
  const conn = db();
  // migrate the earlier email-keyed table out of the way, once
  const cols = conn.prepare("PRAGMA table_info(waitlist)").all() as { name: string }[];
  if (cols.length > 0 && !cols.some((c) => c.name === "phone")) {
    conn.exec("ALTER TABLE waitlist RENAME TO waitlist_email_legacy");
  }
  conn.exec(
    "CREATE TABLE IF NOT EXISTS waitlist (phone TEXT PRIMARY KEY, ts TEXT NOT NULL DEFAULT (datetime('now')))"
  );
  return conn;
}

// ---------------------------------------------------------------- postgres

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any = null;
async function pg() {
  if (!pool) {
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: PG_URL, max: 3 });
    await pool.query(
      "CREATE TABLE IF NOT EXISTS waitlist (phone TEXT PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now())"
    );
  }
  return pool;
}

// -------------------------------------------------------------- public api

/** Add a number to the waitlist. False = unparseable input. Idempotent. */
export async function addWaitlistPhone(raw: string): Promise<boolean> {
  const phone = normalizePhone(raw);
  if (!phone) return false;
  if (PG_URL) {
    await (await pg()).query(
      "INSERT INTO waitlist (phone) VALUES ($1) ON CONFLICT (phone) DO NOTHING",
      [phone]
    );
  } else {
    sqliteEnsure().prepare("INSERT OR IGNORE INTO waitlist (phone) VALUES (?)").run(phone);
  }
  return true;
}

/** How many unique numbers are on the list. */
export async function waitlistCount(): Promise<number> {
  if (PG_URL) {
    const res = await (await pg()).query("SELECT COUNT(*)::int AS n FROM waitlist");
    return res.rows[0].n as number;
  }
  const row = sqliteEnsure().prepare("SELECT COUNT(*) AS n FROM waitlist").get() as { n: number };
  return row.n;
}
