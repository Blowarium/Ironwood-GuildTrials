/**
 * Sanity check — run: npx tsx scripts/test-schedule-suggestions.ts
 */
import { SKILLS, MEMBERS, type Skill } from "../src/lib/constants";
import { buildOptimalSchedule } from "../src/lib/schedule-optimizer";
import { buildProfilesMap, normalizeProfile } from "../src/lib/member-profile";
import { getWeekDays, getWeekStart } from "../src/lib/weeks";

const weekStart = getWeekStart(new Date(), 0);
const weekDays = getWeekDays(weekStart);
const hallLevel = 5;

function makeProfile(
  member: string,
  prefOrder: Skill[],
  xp = 50000,
  locked: Skill[] = [],
) {
  const rankBySkill = new Map(prefOrder.map((s, i) => [s, i + 1]));
  return normalizeProfile({
    member_name: member,
    skills: SKILLS.map((skill) => ({
      skill,
      xp_per_hour: locked.includes(skill) ? null : xp,
      preference_rank: rankBySkill.get(skill) ?? null,
      ironwood_action_id: null,
      skill_locked: locked.includes(skill),
    })),
    updated_at: new Date().toISOString(),
    updated_by: null,
    preferences_customized: true,
  });
}

const amudoPrefs: Skill[] = [
  "Cooking",
  "Smithing",
  "Mining",
  "Woodcutting",
  "Farming",
  "Alchemy",
  "Delving",
  "Ranged",
];

const profiles = buildProfilesMap([
  makeProfile("pomu", ["Woodcutting", "Mining", "Fishing"], 67734 / 24 / 0.05),
  makeProfile("AmudoBun", amudoPrefs, 34225 / 24 / 0.05),
  makeProfile("neppocc", ["Delving", "Mining", "Woodcutting"], 37200 / 24 / 0.05),
  makeProfile("LecheurDeCul", ["Enchanting", "Imbuing", "Alchemy"], 0),
  ...MEMBERS.filter(
    (m) => !["AmudoBun", "neppocc", "LecheurDeCul"].includes(m),
  ).map((m) =>
    makeProfile(m, [...SKILLS].slice(0, 8) as Skill[], 50000),
  ),
]);

const scheduled: { member: string; skill: Skill }[] = [
  { member: "pomu", skill: "Woodcutting" },
  { member: "Waterwraith", skill: "Alchemy" },
  { member: "Abrams", skill: "Cooking" },
  { member: "SouthernComfort", skill: "Defense" },
  { member: "LecheurDeCul", skill: "Enchanting" },
  { member: "Visionaire", skill: "Exploring" },
  { member: "Begitte", skill: "Farming" },
  { member: "Bombura", skill: "Fishing" },
  { member: "Blowarium", skill: "Imbuing" },
  { member: "LotusChan", skill: "Mining" },
  { member: "pikachu1986", skill: "One-handed" },
  { member: "NutshellToo", skill: "Smelting" },
  { member: "Buttstaff", skill: "Smithing" },
  { member: "Acol", skill: "Two-handed" },
  { member: "Boemibal", skill: "Exploring" },
  { member: "neppocc", skill: "Delving" },
];

const signups = scheduled.map((row, i) => ({
  id: i + 1,
  week_start: weekStart,
  member_name: row.member,
  skill: row.skill,
  planned_date: weekDays[i % 7]!,
  status: "planned" as const,
  planned_start_at: `${weekDays[i % 7]}T12:00:00.000Z`,
  last_edited_by: row.member,
  created_at: "",
  updated_at: "",
}));

const allMembers = [...MEMBERS, "pomu"];
const plan = buildOptimalSchedule(
  profiles,
  signups,
  weekDays,
  hallLevel,
  allMembers,
  new Set(),
);

const amudo = plan.suggestions.find((s) => s.member === "AmudoBun");
console.log("Suggestions:", plan.suggestions.length);
console.log(
  "AmudoBun →",
  amudo ? `${amudo.skill} (pref ${amudo.preferenceRank})` : "NONE",
);

if (amudo?.skill === "Woodcutting") {
  console.error("FAIL: AmudoBun should not get Woodcutting");
  process.exit(1);
}

const unscheduled = allMembers.length - signups.length;
if (plan.suggestions.length !== unscheduled) {
  console.error(
    `FAIL: expected ${unscheduled} gap-filling suggestions, got ${plan.suggestions.length}`,
  );
  process.exit(1);
}
if (!amudo) {
  console.error("FAIL: AmudoBun should receive a gap-filling suggestion");
  process.exit(1);
}

// Overflow: all 16 skills on planner → top preference wins
const overflowMembers = allMembers.filter((m) => !scheduled.map((s) => s.member).includes(m));
const overflowAssignees = [...MEMBERS, "pomu"].filter((m) => m !== "AmudoBun");
const fullScheduled = SKILLS.map((skill, i) => ({
  id: 100 + i,
  week_start: weekStart,
  member_name: overflowAssignees[i]!,
  skill,
  planned_date: weekDays[i % 7]!,
  status: "planned" as const,
  planned_start_at: `${weekDays[i % 7]}T12:00:00.000Z`,
  last_edited_by: overflowAssignees[i]!,
  created_at: "",
  updated_at: "",
}));

const overflowPlan = buildOptimalSchedule(
  profiles,
  fullScheduled,
  weekDays,
  hallLevel,
  allMembers,
  new Set(),
);

console.log("Overflow suggestions:", overflowPlan.suggestions.length);
const amudoOverflow = overflowPlan.suggestions.find((s) => s.member === "AmudoBun");
console.log(
  "Overflow AmudoBun →",
  amudoOverflow ? `${amudoOverflow.skill} (pref ${amudoOverflow.preferenceRank})` : "NONE",
);
if (amudoOverflow?.skill !== "Cooking") {
  console.error("FAIL: overflow should suggest AmudoBun top pref Cooking");
  process.exit(1);
}

const unscheduledCount = allMembers.length - fullScheduled.length;
if (overflowPlan.suggestions.length !== unscheduledCount) {
  console.error(
    `FAIL: expected ${unscheduledCount} overflow suggestions, got ${overflowPlan.suggestions.length}`,
  );
  process.exit(1);
}

console.log("OK");
