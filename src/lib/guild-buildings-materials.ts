import type { GuildBuildingId } from "./guild-buildings-data";
import type { ScheduledUpgrade } from "./guild-buildings-schedule";
import materialsJson from "@/data/guild-building-materials.json";

export interface GuildMaterialRequirement {
  id: string;
  amount: number;
}

export type GuildBuildingMaterialsByLevel = Record<string, GuildMaterialRequirement[]>;

export const GUILD_BUILDING_MATERIALS = materialsJson as Record<
  GuildBuildingId,
  GuildBuildingMaterialsByLevel
>;

/** Deposited amounts keyed by upgrade step, then material id. */
export type PlannerMaterialDeposits = Record<string, Record<string, number>>;

export function upgradeStepKey(buildingId: GuildBuildingId, fromLevel: number): string {
  return `${buildingId}:${fromLevel}`;
}

export function formatMaterialName(materialId: string): string {
  return materialId
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\D)(\d+)/g, "$1 $2")
    .trim();
}

export function formatMaterialAmount(amount: number): string {
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function getUpgradeMaterialRequirements(
  buildingId: GuildBuildingId,
  fromLevel: number,
): GuildMaterialRequirement[] {
  return GUILD_BUILDING_MATERIALS[buildingId]?.[String(fromLevel)] ?? [];
}

export interface MaterialProgressItem {
  id: string;
  name: string;
  required: number;
  deposited: number;
  complete: boolean;
}

export interface UpgradeMaterialsProgress {
  stepKey: string;
  items: MaterialProgressItem[];
  completeCount: number;
  totalCount: number;
  isComplete: boolean;
}

export function getUpgradeMaterialsProgress(
  step: Pick<ScheduledUpgrade, "buildingId" | "fromLevel">,
  deposits: PlannerMaterialDeposits | null | undefined,
): UpgradeMaterialsProgress {
  const stepKey = upgradeStepKey(step.buildingId, step.fromLevel);
  const stepDeposits = deposits?.[stepKey] ?? {};
  const requirements = getUpgradeMaterialRequirements(step.buildingId, step.fromLevel);

  const items = requirements.map((req) => {
    const deposited = Math.max(0, Math.floor(Number(stepDeposits[req.id]) || 0));
    return {
      id: req.id,
      name: formatMaterialName(req.id),
      required: req.amount,
      deposited: Math.min(deposited, req.amount),
      complete: deposited >= req.amount,
    };
  });

  return {
    stepKey,
    items,
    completeCount: items.filter((item) => item.complete).length,
    totalCount: items.length,
    isComplete: items.length > 0 && items.every((item) => item.complete),
  };
}

export function parsePlannerMaterialDepositsJson(raw: unknown): PlannerMaterialDeposits | null {
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

  const out: PlannerMaterialDeposits = {};
  for (const [stepKey, materials] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof materials !== "object" || !materials || Array.isArray(materials)) continue;
    const step: Record<string, number> = {};
    for (const [materialId, amount] of Object.entries(materials as Record<string, unknown>)) {
      const n = Math.max(0, Math.floor(Number(amount)));
      if (Number.isFinite(n) && n > 0) step[materialId] = n;
    }
    if (Object.keys(step).length > 0) out[stepKey] = step;
  }
  return out;
}

export function normalizeMaterialDeposits(
  deposits: PlannerMaterialDeposits | null | undefined,
): PlannerMaterialDeposits {
  return deposits ? { ...deposits } : {};
}

export function setMaterialDeposit(
  deposits: PlannerMaterialDeposits,
  stepKey: string,
  materialId: string,
  amount: number,
): PlannerMaterialDeposits {
  const next = { ...deposits, [stepKey]: { ...deposits[stepKey] } };
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (value <= 0) {
    delete next[stepKey][materialId];
    if (Object.keys(next[stepKey]).length === 0) delete next[stepKey];
  } else {
    next[stepKey][materialId] = value;
  }
  return next;
}

export function markStepMaterialsReady(
  deposits: PlannerMaterialDeposits,
  step: Pick<ScheduledUpgrade, "buildingId" | "fromLevel">,
): PlannerMaterialDeposits {
  const stepKey = upgradeStepKey(step.buildingId, step.fromLevel);
  const requirements = getUpgradeMaterialRequirements(step.buildingId, step.fromLevel);
  const stepDeposits: Record<string, number> = {};
  for (const req of requirements) {
    stepDeposits[req.id] = req.amount;
  }
  return { ...deposits, [stepKey]: stepDeposits };
}

export function clearStepMaterials(
  deposits: PlannerMaterialDeposits,
  stepKey: string,
): PlannerMaterialDeposits {
  const next = { ...deposits };
  delete next[stepKey];
  return next;
}
