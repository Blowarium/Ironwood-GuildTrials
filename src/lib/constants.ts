export const GUILD_NAME = "Ironwood Guild";

export const SKILLS = [
  "Woodcutting",
  "Mining",
  "Smelting",
  "Smithing",
  "Enchanting",
  "Farming",
  "Alchemy",
  "Fishing",
  "Cooking",
  "Delving",
  "Imbuing",
  "Exploring",
  "One-handed",
  "Two-handed",
  "Ranged",
  "Defense",
] as const;

export type Skill = (typeof SKILLS)[number];

export const MEMBERS = [
  "Blowarium",
  "neppocc",
  "Esclss",
  "Bombura",
  "Waterwraith",
  "Begitte",
  "AmudoBun",
  "Visionaire",
  "GeoPapPiano",
  "NutshellToo",
  "SouthernComfort",
  "TiMasse",
  "Beastin",
  "LotusChan",
  "Buttstaff",
  "Brandon2383",
  "hasteful",
  "Acol",
  "Boemibal",
  "Tagra",
  "Fio",
  "LecheurDeCul",
  "jlruppa",
  "pikachu1986",
  "Abrams",
] as const;

export type Member = (typeof MEMBERS)[number];

export const TRIAL_STATUSES = ["planned", "active", "completed"] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

export const STATUS_LABELS: Record<TrialStatus, string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
};

export const STATUS_STYLES: Record<TrialStatus, string> = {
  planned: "bg-slate-700/80 text-slate-200",
  active: "bg-sky-600/40 text-sky-100 ring-1 ring-sky-400/50",
  completed: "bg-emerald-600/30 text-emerald-200 ring-1 ring-emerald-500/40",
};

/** Weekly planner trial block colors by effective status. */
export const TRIAL_BLOCK_STYLES: Record<TrialStatus, string> = {
  planned: "border-slate-600/60 bg-slate-800/90 hover:bg-slate-700/90",
  active: "border-sky-400/60 bg-sky-900/85 hover:bg-sky-900",
  completed: "border-emerald-500/50 bg-emerald-900/75 hover:bg-emerald-900/85",
};

export const SKILL_COLORS: Record<Skill, string> = {
  Woodcutting: "#4ade80",
  Mining: "#a78bfa",
  Smelting: "#fb923c",
  Smithing: "#f87171",
  Enchanting: "#c084fc",
  Farming: "#86efac",
  Alchemy: "#f472b6",
  Fishing: "#38bdf8",
  Cooking: "#fbbf24",
  Delving: "#94a3b8",
  Imbuing: "#e879f9",
  Exploring: "#fcd34d",
  "One-handed": "#60a5fa",
  "Two-handed": "#3b82f6",
  Ranged: "#34d399",
  Defense: "#64748b",
};

export const MEMBER_STORAGE_KEY = "ironwood-trials-member";
export const GUIDE_DISMISSED_STORAGE_KEY = "ironwood-trials-guide-dismissed";

export const ALREADY_ASSIGNED_MSG = "You already have an assignment this week.";
