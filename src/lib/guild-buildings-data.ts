/** Guild building upgrade costs and credit mechanics (from Ironwood client bundle). */

export type GuildBuildingId =
  | "GuildHall"
  | "GuildLibrary"
  | "GuildBank"
  | "GuildStorehouse"
  | "GuildWorkshop"
  | "GuildArmoury"
  | "GuildEventHall"
  | "GuildTrialHall";

export interface BuildingUpgradeStep {
  playerLevel: number;
  coins: number;
  credits: number;
}

export interface GuildBuildingDef {
  id: GuildBuildingId;
  name: string;
  maxLevel: number;
  /** Key = current level (0-based); value = cost to reach next level. */
  requirements: Record<number, BuildingUpgradeStep>;
}

export const GUILD_BUILDING_ORDER: GuildBuildingId[] = [
  "GuildHall",
  "GuildLibrary",
  "GuildBank",
  "GuildStorehouse",
  "GuildWorkshop",
  "GuildArmoury",
  "GuildEventHall",
  "GuildTrialHall",
];

/** Shared credit cost ladder for all guild buildings (Lv N → N+1). */
export const UPGRADE_CREDIT_LADDER = [
  100, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 150_000,
] as const;

function ladderRequirements(coinBase: number): Record<number, BuildingUpgradeStep> {
  const playerLevels = [25, 50, 75, 100, 125, 150, 175, 200];
  const coinMultipliers = [1, 2, 5, 10, 20, 40, 80, 100];
  const req: Record<number, BuildingUpgradeStep> = {};
  for (let i = 0; i < 8; i++) {
    req[i] = {
      playerLevel: playerLevels[i],
      coins: coinBase * coinMultipliers[i],
      credits: UPGRADE_CREDIT_LADDER[i],
    };
  }
  return req;
}

/** Hall / Event / Trial buildings use 250k coin base; others use 500k. */
export const GUILD_BUILDINGS: Record<GuildBuildingId, GuildBuildingDef> = {
  GuildHall: {
    id: "GuildHall",
    name: "Guild Hall",
    maxLevel: 8,
    requirements: ladderRequirements(250_000),
  },
  GuildLibrary: {
    id: "GuildLibrary",
    name: "Guild Library",
    maxLevel: 8,
    requirements: ladderRequirements(500_000),
  },
  GuildBank: {
    id: "GuildBank",
    name: "Guild Bank",
    maxLevel: 8,
    requirements: ladderRequirements(500_000),
  },
  GuildStorehouse: {
    id: "GuildStorehouse",
    name: "Guild Storehouse",
    maxLevel: 8,
    requirements: ladderRequirements(500_000),
  },
  GuildWorkshop: {
    id: "GuildWorkshop",
    name: "Guild Workshop",
    maxLevel: 8,
    requirements: ladderRequirements(500_000),
  },
  GuildArmoury: {
    id: "GuildArmoury",
    name: "Guild Armoury",
    maxLevel: 8,
    requirements: ladderRequirements(500_000),
  },
  GuildEventHall: {
    id: "GuildEventHall",
    name: "Guild Event Hall",
    maxLevel: 8,
    requirements: ladderRequirements(250_000),
  },
  GuildTrialHall: {
    id: "GuildTrialHall",
    name: "Guild Trial Hall",
    maxLevel: 8,
    requirements: ladderRequirements(250_000),
  },
};

export const GUILD_CREDIT_CONSTANTS = {
  /** Daily guild quest credits: Guild Hall level × 20 × 13 */
  dailyQuestMultiplier: 20,
  dailyQuestTierCount: 13,
  /** Event completion: Event Hall level × 400 */
  eventCreditsPerLevel: 400,
  /** Weekly trials: Trial Hall level × 50 × 16 */
  trialCreditsPerSkill: 50,
  guildTrialSkillsPerWeek: 16,
} as const;

/** Daily guild quest coins per member from Guild Bank: level × 1000 × 13 */
export const GUILD_BANK_COIN_CONSTANTS = {
  dailyQuestMultiplier: 1000,
  dailyQuestTierCount: 13,
} as const;

/** Alliance size for total coin payouts (each member receives the per-member amount). */
export const DEFAULT_GUILD_MEMBER_COUNT = 25;

export interface GuildBuildingLevels {
  GuildHall: number;
  GuildLibrary: number;
  GuildBank: number;
  GuildStorehouse: number;
  GuildWorkshop: number;
  GuildArmoury: number;
  GuildEventHall: number;
  GuildTrialHall: number;
}

export const DEFAULT_GUILD_BUILDING_LEVELS: GuildBuildingLevels = {
  GuildHall: 8,
  GuildLibrary: 8,
  GuildBank: 4,
  GuildStorehouse: 7,
  GuildWorkshop: 7,
  GuildArmoury: 7,
  GuildEventHall: 6,
  GuildTrialHall: 5,
};

export const DEFAULT_GUILD_CREDITS = 13_060;

export function upgradeCreditCost(buildingId: GuildBuildingId, currentLevel: number): number | null {
  const def = GUILD_BUILDINGS[buildingId];
  if (currentLevel >= def.maxLevel) return null;
  return def.requirements[currentLevel]?.credits ?? null;
}

export function dailyQuestCreditsPerDay(guildHallLevel: number, allQuestsComplete = true): number {
  if (!allQuestsComplete || guildHallLevel <= 0) return 0;
  const { dailyQuestMultiplier, dailyQuestTierCount } = GUILD_CREDIT_CONSTANTS;
  return guildHallLevel * dailyQuestMultiplier * dailyQuestTierCount;
}

export function trialCreditsPerWeek(trialHallLevel: number): number {
  const { guildTrialSkillsPerWeek, trialCreditsPerSkill } = GUILD_CREDIT_CONSTANTS;
  return trialHallLevel * trialCreditsPerSkill * guildTrialSkillsPerWeek;
}

/** Full event completion credits (Event Hall level at event end). */
export function eventCreditsPerCompletion(eventHallLevel: number): number {
  return eventHallLevel * GUILD_CREDIT_CONSTANTS.eventCreditsPerLevel;
}

/** Coins paid to each member per day when daily quests are complete. */
export function guildBankCoinsPerMemberPerDay(
  guildBankLevel: number,
  allQuestsComplete = true,
): number {
  if (!allQuestsComplete || guildBankLevel <= 0) return 0;
  const { dailyQuestMultiplier, dailyQuestTierCount } = GUILD_BANK_COIN_CONSTANTS;
  return guildBankLevel * dailyQuestMultiplier * dailyQuestTierCount;
}

/** Total coins paid to all members per day (each member receives the per-member amount). */
export function guildBankCoinsGuildTotalPerDay(
  guildBankLevel: number,
  memberCount = DEFAULT_GUILD_MEMBER_COUNT,
  allQuestsComplete = true,
): number {
  return guildBankCoinsPerMemberPerDay(guildBankLevel, allQuestsComplete) * memberCount;
}

export function weeklyGuildBankCoins(
  guildBankLevel: number,
  memberCount = DEFAULT_GUILD_MEMBER_COUNT,
  allQuestsComplete = true,
): number {
  return guildBankCoinsGuildTotalPerDay(guildBankLevel, memberCount, allQuestsComplete) * 7;
}

export function formatCoins(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function totalRemainingUpgradeCredits(levels: GuildBuildingLevels): number {
  let total = 0;
  for (const id of GUILD_BUILDING_ORDER) {
    const def = GUILD_BUILDINGS[id];
    for (let lv = levels[id]; lv < def.maxLevel; lv++) {
      total += def.requirements[lv]?.credits ?? 0;
    }
  }
  return total;
}

export function formatCredits(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
