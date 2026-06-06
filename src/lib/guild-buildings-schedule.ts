import {
  GUILD_BUILDING_ORDER,
  GUILD_BUILDINGS,
  type GuildBuildingId,
  type GuildBuildingLevels,
  dailyQuestCreditsPerDay,
  eventCreditsPerCompletion,
  trialCreditsPerWeek,
  upgradeCreditCost,
} from "./guild-buildings-data";
import {
  CREDIT_HALL_IDS,
  DEFAULT_COMPARISON_STRATEGIES,
  UTILITY_BUILDING_IDS,
  filterPendingByStrategy,
  pickFromPoolBuildingOrder,
  pickFromPoolCheapest,
  strategyDef,
  type UpgradeStrategyId,
} from "./guild-buildings-strategies";
import { guildEventIntervalsInRange } from "./guild-events";
import {
  GUILD_DAY_MS,
  formatDailyResetLabel,
  nextDailyResetAfter,
  trialWeekResetKey,
} from "./guild-reset";
import { toISODate } from "./weeks";

const DAY_MS = GUILD_DAY_MS;

export interface GuildBuildingsScheduleInput {
  startDate?: Date;
  levels: GuildBuildingLevels;
  credits: number;
  fullDailyQuests?: boolean;
  targetLevel?: number;
  strategy?: UpgradeStrategyId;
}

export interface ScheduledUpgrade {
  buildingId: GuildBuildingId;
  fromLevel: number;
  toLevel: number;
  creditCost: number;
  date: string;
  dayOffset: number;
  creditsBefore: number;
  creditsAfter: number;
}

export interface WeeklyIncomeBreakdown {
  dailyQuests: number;
  events: number;
  trials: number;
  total: number;
}

export interface GuildBuildingsScheduleResult {
  strategy: UpgradeStrategyId;
  strategyName: string;
  upgrades: ScheduledUpgrade[];
  totalDays: number;
  completionDate: string;
  weeklyIncomeAtStart: WeeklyIncomeBreakdown;
  weeklyIncomeAtEnd: WeeklyIncomeBreakdown;
  notes: string[];
}

export interface BuildingMilestones {
  /** Day offset when each building reaches target level; null if already maxed at start. */
  byBuilding: Record<GuildBuildingId, number | null>;
  allHallsMaxDay: number | null;
  allUtilityMaxDay: number | null;
}

export interface ScenarioComparisonRow {
  strategy: UpgradeStrategyId;
  strategyName: string;
  strategyDescription: string;
  schedule: GuildBuildingsScheduleResult;
  milestones: BuildingMilestones;
}

interface SimulationState {
  levels: GuildBuildingLevels;
  credits: number;
  dayOffset: number;
  date: Date;
  trialWeekStart: number;
  paidEventEnds: Set<number>;
}

function cloneLevels(levels: GuildBuildingLevels): GuildBuildingLevels {
  return { ...levels };
}

function countActiveEventsPerWeek(at = new Date()): number {
  const rangeStart = new Date(at.getTime() - DAY_MS);
  const rangeEnd = new Date(at.getTime() + 7 * DAY_MS);
  return guildEventIntervalsInRange(rangeStart, rangeEnd).filter((i) => i.phase === "active")
    .length;
}

export function weeklyCreditIncome(
  levels: GuildBuildingLevels,
  at = new Date(),
  fullDailyQuests = true,
): WeeklyIncomeBreakdown {
  const dailyQuests = dailyQuestCreditsPerDay(levels.GuildHall, fullDailyQuests) * 7;
  const events =
    countActiveEventsPerWeek(at) * eventCreditsPerCompletion(levels.GuildEventHall);
  const trials = trialCreditsPerWeek(levels.GuildTrialHall);
  return { dailyQuests, events, trials, total: dailyQuests + events + trials };
}

function advanceOneDay(state: SimulationState, fullDailyQuests: boolean): void {
  const periodStart = state.date;
  const periodEnd = nextDailyResetAfter(periodStart);
  state.date = periodEnd;
  state.dayOffset += (periodEnd.getTime() - periodStart.getTime()) / DAY_MS;

  state.credits += dailyQuestCreditsPerDay(state.levels.GuildHall, fullDailyQuests);

  for (const interval of guildEventIntervalsInRange(periodStart, periodEnd)) {
    if (interval.phase !== "active") continue;
    const endMs = interval.endAt.getTime();
    if (endMs <= periodStart.getTime() || endMs > periodEnd.getTime()) continue;
    if (state.paidEventEnds.has(endMs)) continue;
    state.paidEventEnds.add(endMs);
    state.credits += eventCreditsPerCompletion(state.levels.GuildEventHall);
  }

  const weekKey = trialWeekResetKey(periodEnd);
  if (weekKey !== state.trialWeekStart) {
    state.credits += trialCreditsPerWeek(state.levels.GuildTrialHall);
    state.trialWeekStart = weekKey;
  }
}

function createSimulationState(input: {
  levels: GuildBuildingLevels;
  credits: number;
  startDate?: Date;
}): SimulationState {
  const startDate = input.startDate ?? new Date();
  const d = new Date(startDate);
  return {
    levels: cloneLevels(input.levels),
    credits: input.credits,
    dayOffset: 0,
    date: d,
    trialWeekStart: trialWeekResetKey(d),
    paidEventEnds: new Set(),
  };
}

function pendingUpgrades(levels: GuildBuildingLevels, targetLevel: number): GuildBuildingId[] {
  return GUILD_BUILDING_ORDER.filter((id) => levels[id] < targetLevel);
}

function isComplete(levels: GuildBuildingLevels, targetLevel: number): boolean {
  return pendingUpgrades(levels, targetLevel).length === 0;
}

function marginalWeeklyGain(id: GuildBuildingId, at: Date): number {
  const eventsPerWeek = countActiveEventsPerWeek(at);
  switch (id) {
    case "GuildHall":
      return dailyQuestCreditsPerDay(1) * 7;
    case "GuildEventHall":
      return eventsPerWeek * eventCreditsPerCompletion(1);
    case "GuildTrialHall":
      return trialCreditsPerWeek(1);
    default:
      return 0;
  }
}

function daysUntilAffordable(
  state: SimulationState,
  buildingId: GuildBuildingId,
  fullDailyQuests: boolean,
  maxDays = 3650,
): number {
  const cost = upgradeCreditCost(buildingId, state.levels[buildingId]);
  if (cost == null) return Infinity;

  const sim: SimulationState = {
    ...state,
    levels: cloneLevels(state.levels),
    paidEventEnds: new Set(state.paidEventEnds),
    date: new Date(state.date),
  };

  if (sim.credits >= cost) return 0;
  for (let d = 0; d < maxDays; d++) {
    advanceOneDay(sim, fullDailyQuests);
    if (sim.credits >= cost) return d + 1;
  }
  return Infinity;
}

function pickNextUpgrade(
  state: SimulationState,
  targetLevel: number,
  fullDailyQuests: boolean,
  strategy: UpgradeStrategyId,
): GuildBuildingId | null {
  const pending = pendingUpgrades(state.levels, targetLevel);
  if (pending.length === 0) return null;

  const pool = filterPendingByStrategy(pending, strategy, state.levels, targetLevel);

  if (strategy === "cheapest_next") {
    return pickFromPoolCheapest(pool, state.levels);
  }

  if (strategy === "utility_first" || strategy === "halls_first") {
    return pickFromPoolBuildingOrder(pool);
  }

  if (strategy === "event_rush" || strategy === "trial_rush") {
    if (pool.length === 1) return pool[0];
    return pickNextUpgradeByIncomeScore(state, fullDailyQuests, pool);
  }

  return pickNextUpgradeByIncomeScore(state, fullDailyQuests, pool);
}

function pickNextUpgradeByIncomeScore(
  state: SimulationState,
  fullDailyQuests: boolean,
  pool: GuildBuildingId[],
): GuildBuildingId | null {
  if (pool.length === 0) return null;

  let best: GuildBuildingId | null = null;
  let bestScore = -Infinity;

  for (const id of pool) {
    const gain = marginalWeeklyGain(id, state.date);
    const days = daysUntilAffordable(state, id, fullDailyQuests);
    if (!Number.isFinite(days)) continue;

    const cost = upgradeCreditCost(id, state.levels[id]) ?? 0;
    const score = gain > 0 ? gain / (days + 1) : -cost / (days + 1);

    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }

  return best ?? pool[0];
}

function applyUpgrade(
  state: SimulationState,
  buildingId: GuildBuildingId,
  fullDailyQuests: boolean,
): boolean {
  const cost = upgradeCreditCost(buildingId, state.levels[buildingId]);
  if (cost == null) return false;

  for (let guard = 0; guard < 3650; guard++) {
    if (state.credits >= cost) {
      state.credits -= cost;
      state.levels[buildingId] += 1;
      return true;
    }
    advanceOneDay(state, fullDailyQuests);
  }
  return false;
}

export function computeBuildingMilestones(
  initialLevels: GuildBuildingLevels,
  upgrades: ScheduledUpgrade[],
  targetLevel: number,
): BuildingMilestones {
  const byBuilding = {} as Record<GuildBuildingId, number | null>;

  for (const id of GUILD_BUILDING_ORDER) {
    byBuilding[id] = initialLevels[id] >= targetLevel ? 0 : null;
  }

  for (const step of upgrades) {
    if (step.toLevel >= targetLevel && byBuilding[step.buildingId] === null) {
      byBuilding[step.buildingId] = step.dayOffset;
    }
  }

  const hallDays = CREDIT_HALL_IDS.map((id) => byBuilding[id]).filter(
    (d): d is number => d !== null,
  );
  const utilityDays = UTILITY_BUILDING_IDS.map((id) => byBuilding[id]).filter(
    (d): d is number => d !== null,
  );

  return {
    byBuilding,
    allHallsMaxDay: hallDays.length === CREDIT_HALL_IDS.length ? Math.max(...hallDays) : null,
    allUtilityMaxDay:
      utilityDays.length === UTILITY_BUILDING_IDS.length ? Math.max(...utilityDays) : null,
  };
}

export function buildScenarioComparison(
  input: Omit<GuildBuildingsScheduleInput, "strategy">,
  strategies: UpgradeStrategyId[] = DEFAULT_COMPARISON_STRATEGIES,
): ScenarioComparisonRow[] {
  const targetLevel = input.targetLevel ?? 8;
  return strategies.map((strategy) => {
    const schedule = buildGuildBuildingsSchedule({ ...input, strategy });
    const def = strategyDef(strategy);
    return {
      strategy,
      strategyName: def.name,
      strategyDescription: def.description,
      schedule,
      milestones: computeBuildingMilestones(input.levels, schedule.upgrades, targetLevel),
    };
  });
}

export function buildGuildBuildingsSchedule(
  input: GuildBuildingsScheduleInput,
): GuildBuildingsScheduleResult {
  const strategy = input.strategy ?? "max_income";
  const def = strategyDef(strategy);
  const targetLevel = input.targetLevel ?? 8;
  const fullDailyQuests = input.fullDailyQuests ?? true;
  const startDate = input.startDate ?? new Date();
  const notes: string[] = [
    "Assumes full daily quest, event, and trial completion.",
    `Daily quest credits and trial week turnover at ${formatDailyResetLabel()} (Mon 02:00 opens a new trial week).`,
    "Daily quests: Guild Hall level × 20 × 13 per day.",
    "Events: Event Hall level × 400 per completed event.",
    "Trials: Trial Hall level × 50 × 16 per week.",
    "Guild Bank does not affect Guild Credits (no storage cap).",
    `Strategy: ${def.name} — ${def.description}`,
  ];

  const weeklyIncomeAtStart = weeklyCreditIncome(input.levels, startDate, fullDailyQuests);

  const state = createSimulationState({
    levels: input.levels,
    credits: input.credits,
    startDate,
  });
  const upgrades: ScheduledUpgrade[] = [];

  while (!isComplete(state.levels, targetLevel)) {
    const next = pickNextUpgrade(state, targetLevel, fullDailyQuests, strategy);
    if (!next) break;

    const fromLevel = state.levels[next];
    const creditCost = upgradeCreditCost(next, fromLevel)!;
    const creditsBefore = state.credits;

    if (!applyUpgrade(state, next, fullDailyQuests)) {
      notes.push("Could not schedule further upgrades within the simulation horizon.");
      break;
    }

    upgrades.push({
      buildingId: next,
      fromLevel,
      toLevel: fromLevel + 1,
      creditCost,
      date: toISODate(state.date),
      dayOffset: state.dayOffset,
      creditsBefore,
      creditsAfter: state.credits,
    });
  }

  const weeklyIncomeAtEnd = weeklyCreditIncome(state.levels, state.date, fullDailyQuests);
  const completionDate =
    upgrades.length > 0 ? upgrades[upgrades.length - 1].date : toISODate(startDate);

  return {
    strategy,
    strategyName: def.name,
    upgrades,
    totalDays: state.dayOffset,
    completionDate,
    weeklyIncomeAtStart,
    weeklyIncomeAtEnd,
    notes,
  };
}

export function levelsAfterUpgrades(
  initialLevels: GuildBuildingLevels,
  upgrades: ScheduledUpgrade[],
  maxDayOffset: number,
): GuildBuildingLevels {
  const levels = cloneLevels(initialLevels);
  for (const step of upgrades) {
    if (step.dayOffset <= maxDayOffset) {
      levels[step.buildingId] = step.toLevel;
    }
  }
  return levels;
}

export function weeklyIncomeAtDayOffset(
  initialLevels: GuildBuildingLevels,
  upgrades: ScheduledUpgrade[],
  dayOffset: number,
  startDate: Date = new Date(),
  fullDailyQuests = true,
): WeeklyIncomeBreakdown {
  const levels = levelsAfterUpgrades(initialLevels, upgrades, dayOffset);
  const at = new Date(startDate.getTime() + dayOffset * DAY_MS);
  return weeklyCreditIncome(levels, at, fullDailyQuests);
}

export function parseLevelsFromForm(value: GuildBuildingLevels): GuildBuildingLevels {
  const out = { ...value };
  for (const id of GUILD_BUILDING_ORDER) {
    out[id] = Math.max(0, Math.min(GUILD_BUILDINGS[id].maxLevel, Math.floor(out[id] || 0)));
  }
  return out;
}

export function daysFromToday(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

export function eventsPerWeek(at = new Date()): number {
  return countActiveEventsPerWeek(at);
}

export {
  DEFAULT_COMPARISON_STRATEGIES,
  UPGRADE_STRATEGIES,
  type UpgradeStrategyId,
} from "./guild-buildings-strategies";
export {
  DEFAULT_GUILD_BUILDING_LEVELS,
  DEFAULT_GUILD_CREDITS,
  formatCredits,
  totalRemainingUpgradeCredits,
  type GuildBuildingLevels,
} from "./guild-buildings-data";
