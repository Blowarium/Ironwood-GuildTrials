/**
 * Generates public/guild-buildings-data.json from Ironwood main bundle.
 * Requires %TEMP%/iw-main.js
 *
 * Run: node scripts/generate-guild-buildings-data.mjs
 */
import fs from "fs";
import os from "os";
import path from "path";

const bundlePath = path.join(os.tmpdir(), "iw-main.js");
if (!fs.existsSync(bundlePath)) {
  console.error("Bundle not found at", bundlePath);
  process.exit(1);
}

const s = fs.readFileSync(bundlePath, "utf8");

const BUILDINGS = [
  "GuildHall",
  "GuildLibrary",
  "GuildBank",
  "GuildStorehouse",
  "GuildWorkshop",
  "GuildArmoury",
  "GuildEventHall",
  "GuildTrialHall",
];

const DISPLAY_NAMES = {
  GuildHall: "Guild Hall",
  GuildLibrary: "Guild Library",
  GuildBank: "Guild Bank",
  GuildStorehouse: "Guild Storehouse",
  GuildWorkshop: "Guild Workshop",
  GuildArmoury: "Guild Armoury",
  GuildEventHall: "Guild Event Hall",
  GuildTrialHall: "Guild Trial Hall",
};

function extractVnBlock() {
  const start = s.indexOf("vn={[n.dZ.GuildHall]");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + 3; i < start + 50000; i++) {
    if (s[i] === "{") depth++;
    if (s[i] === "}") {
      depth--;
      if (depth === 0) return s.slice(start + 3, i);
    }
  }
  return null;
}

const vnBlock = extractVnBlock();
if (!vnBlock) {
  console.error("Could not extract vn building block");
  process.exit(1);
}

const buildings = {};
for (const id of BUILDINGS) {
  const marker = `[n.dZ.${id}]:`;
  const bi = vnBlock.indexOf(marker);
  if (bi < 0) {
    console.warn("Missing", id);
    continue;
  }
  const chunk = vnBlock.slice(bi, bi + 2500);
  const requirements = {};
  for (const m of chunk.matchAll(/(\d+):\{level:(\d+),coins:(\d+(?:e\d+)?),credits:(\d+(?:e\d+)?)/g)) {
    requirements[Number(m[1])] = {
      playerLevel: Number(m[2]),
      coins: Number(m[3]),
      credits: Number(m[4]),
    };
  }
  const materials = {};
  const matStart = chunk.indexOf("materials:{");
  if (matStart >= 0) {
    const matEnd = chunk.indexOf("}},[n.dZ.", matStart);
    const matChunk = chunk.slice(matStart + 11, matEnd > 0 ? matEnd : matStart + 3000);
    for (const m of matChunk.matchAll(/(\d+):\[(.*?)\](?=,\d+:|$)/gs)) {
      const items = [];
      for (const im of m[2].matchAll(/\{id:n\.AM\.(\w+),amount:(\d+(?:e\d+)?)\}/g)) {
        items.push({ id: im[1], amount: Number(im[2]) });
      }
      materials[Number(m[1])] = items;
    }
  }
  buildings[id] = {
    id,
    name: DISPLAY_NAMES[id],
    maxLevel: 8,
    requirements,
    materials,
  };
}

const data = {
  source: "ironwood-main-bundle",
  generatedAt: new Date().toISOString(),
  constants: {
    dailyQuestMultiplier: 20,
    dailyQuestTierCount: 13,
    eventCreditsPerLevel: 400,
    trialCreditsPerSkill: 50,
    guildTrialSkillsPerWeek: 16,
    guildEventDurationHours: 48,
    guildEventCooldownHours: 36,
  },
  creditFormulas: {
    dailyQuestsPerDay: "guildHallLevel * 20 * 13",
    eventPerCompletion: "eventHallLevel * 400",
    trialWeekly: "trialHallLevel * 50 * 16",
  },
  buildings,
};

const outPath = path.join(process.cwd(), "public/guild-buildings-data.json");
const materialsPath = path.join(process.cwd(), "src/data/guild-building-materials.json");
fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
const materialsOnly = Object.fromEntries(
  Object.entries(buildings).map(([id, def]) => [id, def.materials ?? {}]),
);
fs.writeFileSync(materialsPath, JSON.stringify(materialsOnly, null, 2));
console.log("Wrote", outPath);
console.log("Wrote", materialsPath);
for (const id of BUILDINGS) {
  const levels = Object.keys(buildings[id]?.requirements ?? {}).length;
  console.log(`  ${id}: ${levels} upgrade steps`);
}
