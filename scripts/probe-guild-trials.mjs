/**
 * Phase 1: probe Ironwood main bundle for guild trial data model.
 * Requires cached bundle at %TEMP%/iw-main.js (same as probe-guild-buildings.mjs).
 *
 * Fetch bundle: open ironwoodrpg.com → DevTools → Sources → search main*.js,
 * or copy from network tab after hard refresh.
 */
import fs from "fs";
import os from "os";
import path from "path";

const bundlePath = path.join(os.tmpdir(), "iw-main.js");
if (!fs.existsSync(bundlePath)) {
  console.error(`Missing ${bundlePath}`);
  console.error("Download iw-main.js from ironwoodrpg.com and save to %TEMP%/iw-main.js");
  process.exit(1);
}

const s = fs.readFileSync(bundlePath, "utf8");
console.log(`Bundle: ${bundlePath} (${(s.length / 1e6).toFixed(2)} MB)\n`);

function excerpt(idx, before = 120, after = 280) {
  return s.slice(Math.max(0, idx - before), idx + after);
}

function findAll(pattern, max = 5, minIdx = 0) {
  const hits = [];
  let idx = minIdx;
  while (hits.length < max) {
    idx = s.indexOf(pattern, idx);
    if (idx < 0) break;
    hits.push(idx);
    idx += pattern.length;
  }
  return hits;
}

const needles = [
  "trialSkills$",
  "isInTrial(",
  "joinGuildTrial",
  "startGuildTrial",
  "trial.requiredExp",
  "trial.endDate",
  "trial.startDate",
  "trial.members",
  "trial.skills",
  "trialCoins",
  "guildTrialCost",
  "Trials Completed",
  "Choose a skill",
  "startDate",
  "endDate",
  "displayName",
  "skillId",
  "currentExp",
  "creditReward",
  "z.lA",
];

console.log("=== Key string hits ===\n");
for (const n of needles) {
  const hits = findAll(n, 3);
  if (!hits.length) {
    console.log(`--- ${n}: (none) ---\n`);
    continue;
  }
  for (const idx of hits) {
    console.log(`--- ${n} @ ${idx} ---`);
    console.log(excerpt(idx));
    console.log();
  }
}

// Extract isInTrial function
const isInTrialMatch = s.match(/isInTrial\([a-z],[a-z]\)\{[^\}]+\}/);
if (isInTrialMatch) {
  console.log("=== isInTrial ===");
  console.log(isInTrialMatch[0]);
  console.log();
}

// Extract trialSkills$ pipeline
const trialSkillsIdx = s.indexOf("this.trialSkills$");
if (trialSkillsIdx >= 0) {
  console.log("=== trialSkills$ pipeline ===");
  console.log(excerpt(trialSkillsIdx, 0, 650));
  console.log();
}

// Guild trial helper functions near currentExp/requiredExp
const xoIdx = s.indexOf("function Xo(");
if (xoIdx >= 0) {
  console.log("=== Guild trial helpers (Xo, Qs, gi) ===");
  console.log(s.slice(xoIdx, xoIdx + 600));
  console.log();
}

// Search member object field usage in trials tab region (~1.6M)
console.log("=== trial.members usages in guild trials region (1.58M–1.72M) ===");
let pos = 1_580_000;
let count = 0;
while ((pos = s.indexOf("trial.members", pos)) >= 0 && pos < 1_720_000 && count < 12) {
  console.log(`@ ${pos}: ${excerpt(pos, 0, 160).replace(/\n/g, " ")}`);
  pos += 13;
  count++;
}
console.log();

// Skill id order array — look for 16-element arrays of known skill enum keys
const skillEnumNeedles = ["Woodcutting", "Mining", "Smelting", "Defense"];
for (const pat of [
  /lA=\[(?:[^[\]]{5,80},){10,20}[^[\]]+\]/g,
  /\[re\.[A-Za-z]+\.Woodcutting[^\]]{0,400}\]/g,
]) {
  const m = s.match(pat);
  if (m?.length) {
    console.log(`=== Skill order pattern ${pat} ===`);
    for (const hit of m.slice(0, 2)) console.log(hit.slice(0, 400));
    console.log();
  }
}

// joinGuildTrial API body
const joinIdx = s.indexOf("joinGuildTrial");
if (joinIdx >= 0) {
  console.log("=== joinGuildTrial API ===");
  console.log(excerpt(joinIdx, 0, 350));
  console.log();
}

// User personal trial state
const userTrialIdx = s.indexOf("user.guild.trial");
if (userTrialIdx >= 0) {
  console.log("=== user.guild.trial references (first 3) ===");
  for (const idx of findAll("user.guild.trial", 3, userTrialIdx - 500)) {
    console.log(excerpt(idx, 80, 200));
    console.log();
  }
}

console.log("=== Phase 1 model summary ===");
console.log(`
guild.trial {
  startDate, endDate?, requiredExp, creditReward, expBonus,
  skills: { [skillId]: { id, currentExp } },
  members: { [displayName]: { displayName, skillId, exp, endDate } }
}

UI (Guild → Trials):
  - Header: trialResetTime$ → guild.trial end countdown
  - Per skill: currentExp / requiredExp; "Complete" when currentExp >= requiredExp
  - Per member: displayName, exp XP, duration(member.endDate) while active
  - joinGuildTrial POST { skillId }; startGuildTrial POST { guildId }

Extraction: guild component trialSkills$ + guild$ (see public/ironwood-trial-sync-probe.js)
Types: src/lib/ironwood-trial-sync.ts
`);

console.log("Done.");
