import { GUILD_BUILDINGS, type GuildBuildingId } from "./guild-buildings-data";
import type { ScheduledUpgrade } from "./guild-buildings-schedule";
import { upgradeStepKey } from "./guild-buildings-materials";

/** Deposited guild coins keyed by upgrade step. */
export type PlannerCoinDeposits = Record<string, number>;

export function getUpgradeCoinRequirement(
  buildingId: GuildBuildingId,
  fromLevel: number,
): number | null {
  const coins = GUILD_BUILDINGS[buildingId]?.requirements[fromLevel]?.coins;
  return coins == null ? null : coins;
}

export interface UpgradeCoinsProgress {
  stepKey: string;
  required: number;
  deposited: number;
  isComplete: boolean;
}

export function getUpgradeCoinsProgress(
  step: Pick<ScheduledUpgrade, "buildingId" | "fromLevel">,
  deposits: PlannerCoinDeposits | null | undefined,
): UpgradeCoinsProgress | null {
  const required = getUpgradeCoinRequirement(step.buildingId, step.fromLevel);
  if (required == null) return null;

  const stepKey = upgradeStepKey(step.buildingId, step.fromLevel);
  const deposited = Math.max(0, Math.floor(Number(deposits?.[stepKey]) || 0));

  return {
    stepKey,
    required,
    deposited: Math.min(deposited, required),
    isComplete: deposited >= required,
  };
}

export function parsePlannerCoinDepositsJson(raw: unknown): PlannerCoinDeposits | null {
  if (raw == null) return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof parsed !== "object" || !parsed || Array.isArray(parsed)) return null;

  const out: PlannerCoinDeposits = {};
  for (const [stepKey, amount] of Object.entries(parsed as Record<string, unknown>)) {
    const n = Math.max(0, Math.floor(Number(amount)));
    if (Number.isFinite(n) && n > 0) out[stepKey] = n;
  }
  return out;
}

export function normalizeCoinDeposits(
  deposits: PlannerCoinDeposits | null | undefined,
): PlannerCoinDeposits {
  return deposits ? { ...deposits } : {};
}

export function setCoinDeposit(
  deposits: PlannerCoinDeposits,
  stepKey: string,
  amount: number,
): PlannerCoinDeposits {
  const next = { ...deposits };
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (value <= 0) delete next[stepKey];
  else next[stepKey] = value;
  return next;
}

export function markStepCoinsReady(
  deposits: PlannerCoinDeposits,
  step: Pick<ScheduledUpgrade, "buildingId" | "fromLevel">,
): PlannerCoinDeposits {
  const required = getUpgradeCoinRequirement(step.buildingId, step.fromLevel);
  if (required == null) return deposits;
  const stepKey = upgradeStepKey(step.buildingId, step.fromLevel);
  return { ...deposits, [stepKey]: required };
}

export function clearStepCoins(
  deposits: PlannerCoinDeposits,
  stepKey: string,
): PlannerCoinDeposits {
  const next = { ...deposits };
  delete next[stepKey];
  return next;
}
