import {
  GUILD_BUILDINGS,
  GUILD_BUILDING_ORDER,
  type GuildBuildingId,
} from "./guild-buildings-data";
import {
  getUpgradeCoinRequirement,
  type PlannerCoinDeposits,
} from "./guild-buildings-coins";
import {
  formatMaterialName,
  getUpgradeMaterialRequirements,
  GUILD_BUILDING_MATERIALS,
  type PlannerMaterialDeposits,
  upgradeStepKey,
} from "./guild-buildings-materials";

export type IronwoodBuildingMaterialsSync = {
  buildingId: GuildBuildingId;
  /** Current in-game level (upgrade from this level → fromLevel + 1). */
  fromLevel: number;
  materials: Record<string, number>;
  /** Deposited guild coins toward this upgrade step (not guild credits). */
  coins?: number;
  source?: string;
};

export type IronwoodBuildingMaterialsSyncInput =
  | IronwoodBuildingMaterialsSync
  | IronwoodBuildingMaterialsSync[];

const BUILDING_NAME_TO_ID: Record<string, GuildBuildingId> = Object.fromEntries(
  GUILD_BUILDING_ORDER.map((id) => [GUILD_BUILDINGS[id].name, id]),
) as Record<string, GuildBuildingId>;

const MATERIAL_NAME_TO_ID = buildMaterialNameToIdMap();

function buildMaterialNameToIdMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const byLevel of Object.values(GUILD_BUILDING_MATERIALS)) {
    for (const requirements of Object.values(byLevel)) {
      for (const req of requirements) {
        map[formatMaterialName(req.id)] = req.id;
        map[req.id] = req.id;
      }
    }
  }
  return map;
}

export function normalizeBuildingMaterialsSyncInput(
  input: IronwoodBuildingMaterialsSyncInput | null | undefined,
): IronwoodBuildingMaterialsSync[] {
  if (!input) return [];
  return Array.isArray(input) ? input : [input];
}

export function mapGameBuildingNameToId(name: string): GuildBuildingId | null {
  const trimmed = name.replace(/\s+/g, " ").trim();
  return BUILDING_NAME_TO_ID[trimmed] ?? null;
}

export function mapGameMaterialNameToId(name: string): string | null {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (MATERIAL_NAME_TO_ID[trimmed]) return MATERIAL_NAME_TO_ID[trimmed];
  const compact = trimmed.replace(/\s+/g, "");
  if (MATERIAL_NAME_TO_ID[compact]) return MATERIAL_NAME_TO_ID[compact];
  return null;
}

export function mergeBuildingMaterialsSync(
  existing: PlannerMaterialDeposits,
  sync: IronwoodBuildingMaterialsSync,
): PlannerMaterialDeposits {
  const stepKey = upgradeStepKey(sync.buildingId, sync.fromLevel);
  const requirements = getUpgradeMaterialRequirements(sync.buildingId, sync.fromLevel);
  if (requirements.length === 0) return existing;

  const stepDeposits: Record<string, number> = {};

  for (const req of requirements) {
    const deposited = Math.max(0, Math.floor(Number(sync.materials[req.id]) || 0));
    if (deposited > 0) {
      stepDeposits[req.id] = Math.min(deposited, req.amount);
    }
  }

  const next = { ...existing };
  if (Object.keys(stepDeposits).length === 0) {
    delete next[stepKey];
  } else {
    next[stepKey] = stepDeposits;
  }
  return next;
}

export function mergeBuildingCoinsSync(
  existing: PlannerCoinDeposits,
  sync: IronwoodBuildingMaterialsSync,
): PlannerCoinDeposits {
  if (sync.coins == null) return existing;

  const required = getUpgradeCoinRequirement(sync.buildingId, sync.fromLevel);
  if (required == null) return existing;

  const stepKey = upgradeStepKey(sync.buildingId, sync.fromLevel);
  const deposited = Math.max(0, Math.floor(Number(sync.coins) || 0));
  const next = { ...existing };

  if (deposited <= 0) {
    delete next[stepKey];
  } else {
    next[stepKey] = Math.min(deposited, required);
  }
  return next;
}

export type BuildingMaterialsApplyStepResult = {
  buildingId: GuildBuildingId;
  fromLevel: number;
  materialCount: number;
  coinsDeposited: number;
};

export type BuildingDepositsApplyResult = {
  applied: boolean;
  steps: BuildingMaterialsApplyStepResult[];
  errors: string[];
};

export function planBuildingMaterialsApply(
  sync: IronwoodBuildingMaterialsSync | null | undefined,
  existing: PlannerMaterialDeposits | null | undefined,
  existingCoins: PlannerCoinDeposits | null | undefined = null,
): {
  nextMaterials: PlannerMaterialDeposits;
  nextCoins: PlannerCoinDeposits;
  result: BuildingDepositsApplyResult;
} {
  return planAllBuildingMaterialsApply(sync ? [sync] : [], existing, existingCoins);
}

export function planAllBuildingMaterialsApply(
  syncs: IronwoodBuildingMaterialsSyncInput | null | undefined,
  existingMaterials: PlannerMaterialDeposits | null | undefined,
  existingCoins: PlannerCoinDeposits | null | undefined = null,
): {
  nextMaterials: PlannerMaterialDeposits;
  nextCoins: PlannerCoinDeposits;
  result: BuildingDepositsApplyResult;
} {
  const normalized = normalizeBuildingMaterialsSyncInput(syncs);
  let nextMaterials = existingMaterials ? { ...existingMaterials } : {};
  let nextCoins = existingCoins ? { ...existingCoins } : {};
  const steps: BuildingMaterialsApplyStepResult[] = [];
  const errors: string[] = [];

  for (const sync of normalized) {
    if (!sync?.buildingId || sync.fromLevel < 0) continue;

    const def = GUILD_BUILDINGS[sync.buildingId];
    if (!def) {
      errors.push(`Unknown building: ${sync.buildingId}.`);
      continue;
    }
    if (sync.fromLevel >= def.maxLevel) continue;

    const materialRequirements = getUpgradeMaterialRequirements(sync.buildingId, sync.fromLevel);
    const coinRequired = getUpgradeCoinRequirement(sync.buildingId, sync.fromLevel);
    const hasMaterialSync = materialRequirements.length > 0;
    const hasCoinSync = coinRequired != null && sync.coins != null;

    if (!hasMaterialSync && !hasCoinSync) continue;

    if (hasMaterialSync) {
      nextMaterials = mergeBuildingMaterialsSync(nextMaterials, sync);
    }
    if (hasCoinSync) {
      nextCoins = mergeBuildingCoinsSync(nextCoins, sync);
    }

    const stepKey = upgradeStepKey(sync.buildingId, sync.fromLevel);
    steps.push({
      buildingId: sync.buildingId,
      fromLevel: sync.fromLevel,
      materialCount: Object.keys(nextMaterials[stepKey] ?? {}).length,
      coinsDeposited: nextCoins[stepKey] ?? 0,
    });
  }

  return {
    nextMaterials,
    nextCoins,
    result: {
      applied: steps.length > 0,
      steps,
      errors,
    },
  };
}
