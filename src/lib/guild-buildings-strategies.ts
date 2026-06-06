import {
  GUILD_BUILDING_ORDER,
  type GuildBuildingId,
  upgradeCreditCost,
} from "./guild-buildings-data";

export type UpgradeStrategyId =
  | "max_income"
  | "utility_first"
  | "halls_first"
  | "cheapest_next"
  | "event_rush"
  | "trial_rush";

export interface UpgradeStrategyDef {
  id: UpgradeStrategyId;
  name: string;
  description: string;
}

export const CREDIT_HALL_IDS: GuildBuildingId[] = [
  "GuildHall",
  "GuildEventHall",
  "GuildTrialHall",
];

export const UTILITY_BUILDING_IDS: GuildBuildingId[] = GUILD_BUILDING_ORDER.filter(
  (id) => !CREDIT_HALL_IDS.includes(id),
);

export const UPGRADE_STRATEGIES: UpgradeStrategyDef[] = [
  {
    id: "max_income",
    name: "Max credit income",
    description:
      "Prioritize halls with the best credit return per day waited — best long-term credit farming.",
  },
  {
    id: "halls_first",
    name: "Credit halls first",
    description: "Max Guild Hall, Event Hall, and Trial Hall before any utility building.",
  },
  {
    id: "utility_first",
    name: "Utility buildings first",
    description:
      "Upgrade Library, Bank, Storehouse, Workshop, and Armoury before credit halls — in-game perks sooner.",
  },
  {
    id: "event_rush",
    name: "Event Hall rush",
    description: "Max Event Hall as fast as possible, then switch to max-income picks.",
  },
  {
    id: "trial_rush",
    name: "Trial Hall rush",
    description: "Max Trial Hall as fast as possible, then switch to max-income picks.",
  },
  {
    id: "cheapest_next",
    name: "Cheapest next",
    description: "Always take the lowest credit-cost upgrade — spreads spending across buildings.",
  },
];

export const DEFAULT_COMPARISON_STRATEGIES: UpgradeStrategyId[] = UPGRADE_STRATEGIES.map(
  (s) => s.id,
);

export function strategyDef(id: UpgradeStrategyId): UpgradeStrategyDef {
  return UPGRADE_STRATEGIES.find((s) => s.id === id)!;
}

export function filterPendingByStrategy(
  pending: GuildBuildingId[],
  strategy: UpgradeStrategyId,
  levels: Record<GuildBuildingId, number>,
  targetLevel: number,
): GuildBuildingId[] {
  switch (strategy) {
    case "utility_first": {
      const utility = pending.filter((id) => UTILITY_BUILDING_IDS.includes(id));
      return utility.length > 0 ? utility : pending;
    }
    case "halls_first": {
      const halls = pending.filter((id) => CREDIT_HALL_IDS.includes(id));
      return halls.length > 0 ? halls : pending;
    }
    case "event_rush":
      if (levels.GuildEventHall < targetLevel) return ["GuildEventHall"];
      return pending;
    case "trial_rush":
      if (levels.GuildTrialHall < targetLevel) return ["GuildTrialHall"];
      return pending;
    default:
      return pending;
  }
}

export function pickFromPoolCheapest(
  pool: GuildBuildingId[],
  levels: Record<GuildBuildingId, number>,
): GuildBuildingId | null {
  if (pool.length === 0) return null;
  let best: GuildBuildingId | null = null;
  let bestCost = Infinity;
  for (const id of pool) {
    const cost = upgradeCreditCost(id, levels[id]);
    if (cost == null) continue;
    if (cost < bestCost) {
      bestCost = cost;
      best = id;
    }
  }
  return best ?? pool[0];
}

export function pickFromPoolBuildingOrder(pool: GuildBuildingId[]): GuildBuildingId | null {
  if (pool.length === 0) return null;
  for (const id of GUILD_BUILDING_ORDER) {
    if (pool.includes(id)) return id;
  }
  return pool[0];
}
