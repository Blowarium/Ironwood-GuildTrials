/**
 * Generates item icon path map and downloads icons from Ironwood assets.
 * Run: node scripts/download-item-icons.mjs
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const bundlePath = path.join(os.tmpdir(), "iw-main.js");
const materialsJson = path.join(root, "src/data/guild-building-materials.json");
const outDir = path.join(root, "public/icons/items");
const mapOut = path.join(root, "src/data/item-icon-paths.json");

const ASSET_ORIGIN = "https://ironwoodrpg.com/assets";

if (!fs.existsSync(bundlePath)) {
  console.error("Missing bundle at", bundlePath);
  process.exit(1);
}

const s = fs.readFileSync(bundlePath, "utf8");
const re = /\[n\.AM\.(\w+)\]:\{id:n\.AM\.\1[^}]*image:"([^"]+)"/g;
const gamePaths = new Map();
let m;
while ((m = re.exec(s))) {
  gamePaths.set(m[1], m[2]);
}

const materialsData = JSON.parse(fs.readFileSync(materialsJson, "utf8"));
const materialIds = new Set();
for (const byLevel of Object.values(materialsData)) {
  for (const requirements of Object.values(byLevel)) {
    for (const req of requirements) materialIds.add(req.id);
  }
}

const STATIC_ITEMS = {
  Coin: "items/coin-stack.png",
  GuildCredits: "items/credit-stack.png",
};

const iconMap = { ...STATIC_ITEMS };
for (const id of materialIds) {
  const gamePath = gamePaths.get(id);
  if (!gamePath) {
    console.warn("No icon path for", id);
    continue;
  }
  iconMap[id] = gamePath;
}

fs.mkdirSync(outDir, { recursive: true });

function localFilename(gamePath) {
  return gamePath.replace(/^items\//, "").replace(/\//g, "-");
}

const localMap = {};
for (const [id, gamePath] of Object.entries(iconMap)) {
  const filename = localFilename(gamePath);
  localMap[id] = `/icons/items/${filename}`;
  const url = `${ASSET_ORIGIN}/${gamePath}`;
  const dest = path.join(outDir, filename);
  if (fs.existsSync(dest)) {
    console.log("skip", filename);
    continue;
  }
  const res = await fetch(url);
  if (!res.ok) {
    console.error("Failed", id, url, res.status);
    process.exitCode = 1;
    continue;
  }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log("saved", filename);
}

fs.writeFileSync(mapOut, JSON.stringify(localMap, null, 2) + "\n");
console.log("Wrote", mapOut, Object.keys(localMap).length, "entries");
