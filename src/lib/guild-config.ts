import type { Member } from "./constants";
import {
  DEFAULT_GUILD_BUILDING_LEVELS,
  DEFAULT_GUILD_CREDITS,
  type GuildBuildingId,
  type GuildBuildingLevels,
} from "./guild-buildings-data";
import {
  DEFAULT_PREFERRED_BUILDING_STRATEGY,
  parsePreferredBuildingStrategy,
  type UpgradeStrategyId,
} from "./guild-buildings-strategies";
import { projectGuildCreditsAtDate } from "./guild-buildings-schedule";
import {
  normalizeMaterialDeposits,
  parsePlannerMaterialDepositsJson,
  type PlannerMaterialDeposits,
} from "./guild-buildings-materials";
import {
  normalizeCoinDeposits,
  parsePlannerCoinDepositsJson,
  type PlannerCoinDeposits,
} from "./guild-buildings-coins";

const CREDIT_HALL_IDS: GuildBuildingId[] = ["GuildHall", "GuildEventHall", "GuildTrialHall"];

export interface GuildConfig {
  guild_hall_level: number;
  guild_event_hall_level: number;
  trial_hall_level: number;
  preferred_building_strategy: UpgradeStrategyId;
  planner_credits: number | null;
  planner_credits_as_of: string | null;
  planner_levels: Partial<GuildBuildingLevels> | null;
  planner_material_deposits: PlannerMaterialDeposits | null;
  planner_coin_deposits: PlannerCoinDeposits | null;
  updated_at: string;
  updated_by: Member | null;
}

export const DEFAULT_GUILD_CONFIG: GuildConfig = {
  guild_hall_level: DEFAULT_GUILD_BUILDING_LEVELS.GuildHall,
  guild_event_hall_level: DEFAULT_GUILD_BUILDING_LEVELS.GuildEventHall,
  trial_hall_level: DEFAULT_GUILD_BUILDING_LEVELS.GuildTrialHall,
  preferred_building_strategy: DEFAULT_PREFERRED_BUILDING_STRATEGY,
  planner_credits: null,
  planner_credits_as_of: null,
  planner_levels: null,
  planner_material_deposits: null,
  planner_coin_deposits: null,
  updated_at: new Date().toISOString(),
  updated_by: null,
};

export type GuildConfigUpdate = {
  guildHallLevel?: number;
  eventHallLevel?: number;
  trialHallLevel?: number;
  preferredBuildingStrategy?: UpgradeStrategyId;
  plannerCredits?: number;
  plannerLevels?: Partial<GuildBuildingLevels>;
  plannerMaterialDeposits?: PlannerMaterialDeposits;
  plannerCoinDeposits?: PlannerCoinDeposits;
};

export function creditHallLevelsFromConfig(
  config: GuildConfig | null,
): Pick<GuildBuildingLevels, "GuildHall" | "GuildEventHall" | "GuildTrialHall"> {
  return {
    GuildHall: config?.guild_hall_level ?? DEFAULT_GUILD_CONFIG.guild_hall_level,
    GuildEventHall: config?.guild_event_hall_level ?? DEFAULT_GUILD_CONFIG.guild_event_hall_level,
    GuildTrialHall: config?.trial_hall_level ?? DEFAULT_GUILD_CONFIG.trial_hall_level,
  };
}

export function mergeBuildingLevelsWithConfig(
  localLevels: GuildBuildingLevels,
  config: GuildConfig | null,
): GuildBuildingLevels {
  return { ...localLevels, ...creditHallLevelsFromConfig(config) };
}

export function plannerBuildingLevelsFromConfig(
  config: GuildConfig | null,
  localFallback: GuildBuildingLevels,
): GuildBuildingLevels {
  const merged = { ...DEFAULT_GUILD_BUILDING_LEVELS, ...localFallback };
  if (config?.planner_levels) {
    for (const [id, level] of Object.entries(config.planner_levels) as [GuildBuildingId, number][]) {
      if (CREDIT_HALL_IDS.includes(id)) continue;
      if (typeof level === "number" && Number.isFinite(level)) {
        merged[id] = Math.max(0, Math.min(8, Math.floor(level)));
      }
    }
  }
  return mergeBuildingLevelsWithConfig(merged, config);
}

export function plannerCreditsFromConfig(
  config: GuildConfig | null,
  localFallback: number,
): number {
  if (config?.planner_credits != null && Number.isFinite(config.planner_credits)) {
    return Math.max(0, Math.floor(config.planner_credits));
  }
  return localFallback;
}

export function plannerCreditsAsOfFromConfig(config: GuildConfig | null): Date {
  if (config?.planner_credits_as_of) {
    const parsed = new Date(config.planner_credits_as_of);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (config?.updated_at) {
    const parsed = new Date(config.updated_at);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function resolvedPlannerCredits(
  config: GuildConfig | null,
  levels: GuildBuildingLevels,
  localFallback: number,
  at: Date = new Date(),
): number {
  const anchor = plannerCreditsFromConfig(config, localFallback);
  const asOf = plannerCreditsAsOfFromConfig(config);
  return projectGuildCreditsAtDate(anchor, levels, asOf, at);
}

export function stripCreditHallsFromLevels(
  levels: GuildBuildingLevels,
): Partial<GuildBuildingLevels> {
  const copy = { ...levels };
  for (const id of CREDIT_HALL_IDS) delete copy[id];
  return copy;
}

export function parsePlannerLevelsJson(raw: unknown): Partial<GuildBuildingLevels> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Partial<GuildBuildingLevels>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as Partial<GuildBuildingLevels>;
      return typeof parsed === "object" && parsed ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeGuildConfigRow(row: Partial<GuildConfig> & Record<string, unknown>): GuildConfig {
  return {
    guild_hall_level: Number(row.guild_hall_level) || DEFAULT_GUILD_CONFIG.guild_hall_level,
    guild_event_hall_level:
      Number(row.guild_event_hall_level) || DEFAULT_GUILD_CONFIG.guild_event_hall_level,
    trial_hall_level: Number(row.trial_hall_level) || DEFAULT_GUILD_CONFIG.trial_hall_level,
    preferred_building_strategy: parsePreferredBuildingStrategy(row.preferred_building_strategy),
    planner_credits:
      row.planner_credits == null ? null : Math.max(0, Math.floor(Number(row.planner_credits))),
    planner_credits_as_of:
      row.planner_credits_as_of == null ? null : String(row.planner_credits_as_of),
    planner_levels: parsePlannerLevelsJson(row.planner_levels),
    planner_material_deposits: parsePlannerMaterialDepositsJson(row.planner_material_deposits),
    planner_coin_deposits: parsePlannerCoinDepositsJson(row.planner_coin_deposits),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    updated_by: (row.updated_by as Member | null) ?? null,
  };
}
