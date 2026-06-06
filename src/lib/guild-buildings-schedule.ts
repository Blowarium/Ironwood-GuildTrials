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
  upgrades: ScheduledUpgrade[];
  totalDays: number;
  completionDate: string;
  weeklyIncomeAtStart: WeeklyIncomeBreakdown;
  weeklyIncomeAtEnd: WeeklyIncomeBreakdown;
  notes: string[];
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
): GuildBuildingId | null {
  const pending = pendingUpgrades(state.levels, targetLevel);
  if (pending.length === 0) return null;

  let best: GuildBuildingId | null = null;
  let bestScore = -Infinity;

  for (const id of pending) {
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

  return best ?? pending[0];
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

export function buildGuildBuildingsSchedule(
  input: GuildBuildingsScheduleInput,
): GuildBuildingsScheduleResult {
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
    "Upgrade order favors Event Hall, Trial Hall, and Guild Hall early for compounding income.",
  ];

  const weeklyIncomeAtStart = weeklyCreditIncome(input.levels, startDate, fullDailyQuests);

  const state = createSimulationState({
    levels: input.levels,
    credits: input.credits,
    startDate,
  });
  const upgrades: ScheduledUpgrade[] = [];

  while (!isComplete(state.levels, targetLevel)) {
    const next = pickNextUpgrade(state, targetLevel, fullDailyQuests);
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
    upgrades,
    totalDays: state.dayOffset,
    completionDate,
    weeklyIncomeAtStart,
    weeklyIncomeAtEnd,
    notes,
  };
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
  DEFAULT_GUILD_BUILDING_LEVELS,
  DEFAULT_GUILD_CREDITS,
  formatCredits,
  totalRemainingUpgradeCredits,
  type GuildBuildingLevels,
} from "./guild-buildings-data";
