// Downloads the demo photo set into public/uploads (skips files that exist).
// The original 13 scenery names came from an earlier generation; the shot-*
// set fills out the wider world so no two events share an image.
import { existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "public", "uploads");
mkdirSync(dir, { recursive: true });

const SHOT_IDS = [10, 11, 12, 13, 15, 16, 17, 18, 28, 29, 33, 37, 49, 50, 55, 58, 76, 85, 95, 98, 102, 103];
for (const id of SHOT_IDS) {
  const file = join(dir, `shot-${id}.jpg`);
  if (existsSync(file)) continue;
  execFileSync("curl", ["-sL", "-o", file, `https://picsum.photos/id/${id}/900/700.jpg`]);
  console.log(`fetched shot-${id}.jpg`);
}
console.log("photo set complete");
