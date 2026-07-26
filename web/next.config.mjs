// Load the repo-root .env so the agent and the web app share one env file.
// Next only auto-loads web/.env*; the OAuth client ids/secrets live one level up.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootEnv = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
try {
  for (const line of readFileSync(rootEnv, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
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
