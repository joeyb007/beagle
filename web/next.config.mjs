// Load the repo-root .env so the agent and the web app share one env file.
// Next only auto-loads web/.env*; the OAuth client ids/secrets live one level up.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const line of readFileSync(join(repoRoot, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      let value = m[2].replace(/^["']|["']$/g, "");
      // relative paths in the root .env are relative to the repo root, not web/
      if (m[1].endsWith("_PATH") && (value.startsWith("./") || value.startsWith("../"))) {
        value = join(repoRoot, value);
      }
      process.env[m[1]] = value;
    }
  }
} catch {
  // no root .env — fine, everything degrades to demo mode
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
