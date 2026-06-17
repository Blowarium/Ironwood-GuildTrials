import type { ScheduledUpgrade } from "./guild-buildings-schedule";
import { upgradeStepKey } from "./guild-buildings-materials";

export interface SequentialCreditAllocation {
  stepKey: string;
  deposited: number;
  required: number;
  ready: boolean;
  /** The step currently holding the guild credit bank (only one at a time). */
  isActive: boolean;
}

/** Apply the full credit bank to the first upgrade step only; later steps wait their turn. */
export function buildSequentialCreditAllocations(
  upgrades: ScheduledUpgrade[],
  guildCredits: number,
): Map<string, SequentialCreditAllocation> {
  const allocations = new Map<string, SequentialCreditAllocation>();
  const bank = Math.max(0, Math.floor(guildCredits));
  let assigned = false;

  for (const step of upgrades) {
    const stepKey = upgradeStepKey(step.buildingId, step.fromLevel);
    const required = step.creditCost;
    let deposited = 0;
    let isActive = false;

    if (!assigned) {
      isActive = true;
      assigned = true;
      deposited = Math.min(bank, required);
    }

    allocations.set(stepKey, {
      stepKey,
      deposited,
      required,
      ready: deposited >= required,
      isActive,
    });
  }

  return allocations;
}

export function getSequentialCreditAllocation(
  upgrades: ScheduledUpgrade[],
  guildCredits: number,
  step: Pick<ScheduledUpgrade, "buildingId" | "fromLevel">,
): SequentialCreditAllocation {
  const stepKey = upgradeStepKey(step.buildingId, step.fromLevel);
  const map = buildSequentialCreditAllocations(upgrades, guildCredits);
  return (
    map.get(stepKey) ?? {
      stepKey,
      deposited: 0,
      required: 0,
      ready: false,
      isActive: false,
    }
  );
}
