import type { Skill } from "./constants";
import { SKILLS } from "./constants";
import catalogJson from "../../public/ironwood-action-catalog.json";

export type IronwoodCatalogAction = {
  actionId: number;
  name: string;
  level: number;
  group: string | null;
  path: string | null;
};

export type IronwoodCatalogSkill = {
  skillId: number | null;
  actions: IronwoodCatalogAction[];
};

export type IronwoodActionCatalog = {
  v: number;
  origin: string;
  skills: Record<string, IronwoodCatalogSkill>;
};

const catalog = catalogJson as IronwoodActionCatalog;

/** Sensible defaults aligned with guild trial preferences (Outskirts, Elite, Keys, pies). */
export const DEFAULT_IRONWOOD_ACTION_IDS: Partial<Record<Skill, number>> = {
  Woodcutting: 1005,
  Mining: 1015,
  Smelting: 37,
  Smithing: 272,
  Enchanting: 145,
  Farming: 1041,
  Alchemy: 92,
  Fishing: 1025,
  Cooking: 67,
  Delving: 1055,
  Imbuing: 111,
  Exploring: 865,
  "One-handed": 425,
  "Two-handed": 435,
  Ranged: 415,
  Defense: 425,
};

export function getCatalogSkill(skill: Skill): IronwoodCatalogSkill | null {
  return catalog.skills[skill] ?? null;
}

export function getCatalogActions(skill: Skill): IronwoodCatalogAction[] {
  return getCatalogSkill(skill)?.actions ?? [];
}

export function findCatalogAction(
  skill: Skill,
  actionId: number | null | undefined,
): IronwoodCatalogAction | null {
  if (actionId == null) return null;
  return getCatalogActions(skill).find((a) => a.actionId === actionId) ?? null;
}

export function defaultActionIdForSkill(skill: Skill): number | null {
  return DEFAULT_IRONWOOD_ACTION_IDS[skill] ?? null;
}

export function formatCatalogActionLabel(action: IronwoodCatalogAction): string {
  const group = action.group ? `${action.group} — ` : "";
  return `${group}${action.name} (Lv. ${action.level})`;
}

export function resolveProfileActionId(
  skill: Skill,
  stored: number | null | undefined,
): number | null {
  if (stored != null && findCatalogAction(skill, stored)) return stored;
  const fallback = defaultActionIdForSkill(skill);
  if (fallback != null && findCatalogAction(skill, fallback)) return fallback;
  const first = getCatalogActions(skill)[0];
  return first?.actionId ?? null;
}

export function catalogOrigin(): string {
  return catalog.origin || "https://ironwoodrpg.com";
}

export function allSkillsHaveCatalogActions(): boolean {
  return SKILLS.every((skill) => getCatalogActions(skill).length > 0);
}
