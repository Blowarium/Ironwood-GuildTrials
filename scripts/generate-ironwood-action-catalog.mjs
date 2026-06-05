/**
 * Generates public/ironwood-action-catalog.json from Ironwood main bundle.
 * Requires %TEMP%/iw-main.js
 *
 * Run: node scripts/generate-ironwood-action-catalog.mjs
 */
import fs from "fs";
import os from "os";
import path from "path";

const GUILD_SKILLS = [
  ["Woodcutting", "Woodcutting"],
  ["Mining", "Mining"],
  ["Smelting", "Smelting"],
  ["Smithing", "Smithing"],
  ["Enchanting", "Enchanting"],
  ["Farming", "Farming"],
  ["Alchemy", "Alchemy"],
  ["Fishing", "Fishing"],
  ["Cooking", "Cooking"],
  ["Delving", "Delving"],
  ["Imbuing", "Imbuing"],
  ["Exploring", "Exploring"],
  ["One-handed", "OneHanded"],
  ["Two-handed", "TwoHanded"],
  ["Ranged", "Ranged"],
  ["Defense", "Defense"],
];

const COMBAT_SKILLS = new Set(["One-handed", "Two-handed", "Ranged", "Defense"]);

const bundlePath = path.join(os.tmpdir(), "iw-main.js");
if (!fs.existsSync(bundlePath)) {
  console.error("Bundle not found at", bundlePath);
  process.exit(1);
}

const s = fs.readFileSync(bundlePath, "utf8");

function extractEnum(name) {
  const marker = `${name}=(()=>{return(d=${name}||(${name}={}))`;
  const start = s.indexOf(marker);
  if (start < 0) return new Map();
  const end = s.indexOf("var d})(),", start);
  const block = end > start ? s.slice(start, end) : s.slice(start, start + 500000);
  const map = new Map();
  for (const m of block.matchAll(/\.(\w+)="(\d+)"/g)) {
    map.set(m[1], Number(m[2]));
  }
  return map;
}

const skillIds = extractEnum("e");
/** Route/action IDs — use z only; te uses different numbering and must not be merged. */
const actionIds = extractEnum("z");

const xvMetaRe = /\[n\.Xv\.(\w+)\]:\{id:n\.Xv\.\1,name:"([^"]+)",[^}]*level:(\d+)/g;
const nAMetaRe =
  /\[n\.nA\.(\w+)\]:\{id:n\.nA\.\1,name:"([^"]+)",[^}]*level:(\d+),skill:n\.AT\.(\w+)/g;

const actionMeta = new Map();
for (const m of s.matchAll(xvMetaRe)) {
  if (!actionMeta.has(m[1])) {
    actionMeta.set(m[1], { name: m[2], level: Number(m[3]) });
  }
}
for (const m of s.matchAll(nAMetaRe)) {
  actionMeta.set(m[1], { name: m[2], level: Number(m[3]), skillKey: m[4] });
}

function humanizeKey(key) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d+)/g, "$1 $2")
    .trim();
}

function metaForKey(key) {
  const meta = actionMeta.get(key);
  if (meta) return { name: meta.name, level: meta.level };
  const tail = key.match(/(\d+)$/);
  return { name: humanizeKey(key), level: tail ? Number(tail[1]) : 1 };
}

function findSkillBlockEnd(startIdx) {
  const re = /,\[n\.AT\.\w+\]:/g;
  re.lastIndex = startIdx + 40;
  const m = re.exec(s);
  return m ? m.index + 1 : startIdx + 15000;
}

function extractSkillBlock(skillName) {
  const needle = `name:"${skillName}",image:"misc/`;
  let idx = 0;
  while ((idx = s.indexOf(needle, idx)) >= 0) {
    const sliceStart = idx;
    const head = s.slice(sliceStart, sliceStart + 400);
    if (!head.includes("color:") || !head.includes("actions:")) {
      idx += needle.length;
      continue;
    }
    const end = findSkillBlockEnd(sliceStart);
    return s.slice(sliceStart, end);
  }
  return "";
}

function walkActionGroups(block, groups, prefix) {
  let searchFrom = 0;
  while (searchFrom < block.length) {
    const nameIdx = block.indexOf('{name:"', searchFrom);
    if (nameIdx < 0) break;
    const groupNameMatch = block.slice(nameIdx).match(/^\{name:"([^"]+)"/);
    if (!groupNameMatch) break;
    const groupName = groupNameMatch[1];
    const label = prefix ? `${prefix} › ${groupName}` : groupName;
    const chunk = block.slice(nameIdx, nameIdx + 6000);
    const actionsMatch = chunk.match(/actions:\[([^\]]*)\]/);
    if (actionsMatch) {
      for (const key of actionsMatch[1].matchAll(/n\.Xv\.(\w+)/g)) {
        groups.set(key[1], label);
      }
    }
    const nestedIdx = chunk.indexOf("actionGroups:[");
    if (nestedIdx >= 0) {
      const nestedEnd = chunk.indexOf("}]}", nestedIdx);
      if (nestedEnd > nestedIdx) {
        walkActionGroups(chunk.slice(nestedIdx, nestedEnd), groups, label);
      }
    }
    searchFrom = nameIdx + groupName.length + 10;
  }
}

function buildActionsFromKeys(keys, skillId, groupLabels) {
  const seen = new Set();
  const actions = [];
  for (const key of keys) {
    const actionId = actionIds.get(key);
    if (actionId == null || seen.has(actionId)) continue;
    seen.add(actionId);
    const meta = metaForKey(key);
    actions.push({
      actionId,
      name: meta.name,
      level: meta.level,
      group: groupLabels.get(key) || null,
      path: skillId != null ? `/skill/${skillId}/action/${actionId}` : null,
    });
  }
  actions.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  return actions;
}

function extractSharedCombatActions() {
  const btStart = s.indexOf('Bt=[{name:"Forest"');
  if (btStart < 0) return { keys: [], groupLabels: new Map() };
  let depth = 0;
  let btEnd = -1;
  for (let i = btStart; i < btStart + 20000; i++) {
    if (s[i] === "[") depth++;
    if (s[i] === "]") {
      depth--;
      if (depth === 0) {
        btEnd = i + 1;
        break;
      }
    }
  }
  const btBlock = btEnd > btStart ? s.slice(btStart, btEnd) : "";
  const groupLabels = new Map();
  walkActionGroups(btBlock, groupLabels, "");
  const keys = [...btBlock.matchAll(/n\.Xv\.(\w+)/g)].map((x) => x[1]);
  return { keys, groupLabels };
}

const combatShared = extractSharedCombatActions();
const catalog = {
  v: 1,
  generatedAt: new Date().toISOString(),
  origin: "https://ironwoodrpg.com",
  skills: {},
};

for (const [displayName, enumKey] of GUILD_SKILLS) {
  const skillId = skillIds.get(enumKey) ?? null;
  let actions = [];

  if (COMBAT_SKILLS.has(displayName) && combatShared.keys?.length) {
    actions = buildActionsFromKeys(combatShared.keys, skillId, combatShared.groupLabels);
  } else {
    const block = extractSkillBlock(displayName);
    if (!block) {
      console.warn("Missing block:", displayName);
    } else {
      const groupLabels = new Map();
      walkActionGroups(block, groupLabels, "");
      const keys = [...block.matchAll(/\{id:n\.Xv\.(\w+)\}/g)].map((x) => x[1]);
      actions = buildActionsFromKeys(keys, skillId, groupLabels);
    }
  }

  catalog.skills[displayName] = { skillId, actions };
  console.log(displayName, actions.length, "actions");
}

const outPath = path.join(process.cwd(), "public", "ironwood-action-catalog.json");
fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2));
console.log("Wrote", outPath);
