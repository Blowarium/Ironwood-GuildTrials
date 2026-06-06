"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Member } from "@/lib/constants";
import { saveGuildConfig } from "@/lib/api-client";
import {
  GUILD_BUILDING_ORDER,
  GUILD_BUILDINGS,
  type GuildBuildingId,
  type GuildBuildingLevels,
  formatCoins,
  formatCredits,
  totalRemainingUpgradeCredits,
  weeklyGuildBankCoins,
  DEFAULT_GUILD_MEMBER_COUNT,
} from "@/lib/guild-buildings-data";
import type { GuildConfig } from "@/lib/guild-config";
import {
  mergeBuildingLevelsWithConfig,
  plannerBuildingLevelsFromConfig,
  plannerCreditsFromConfig,
  stripCreditHallsFromLevels,
} from "@/lib/guild-config";
import {
  buildScenarioComparison,
  DEFAULT_GUILD_BUILDING_LEVELS,
  DEFAULT_GUILD_CREDITS,
  eventsPerWeek,
  type UpgradeStrategyId,
  weeklyCreditIncome,
} from "@/lib/guild-buildings-schedule";
import { DEFAULT_PREFERRED_BUILDING_STRATEGY } from "@/lib/guild-buildings-strategies";
import {
  clearStepMaterials,
  markStepMaterialsReady,
  normalizeMaterialDeposits,
  setMaterialDeposit,
  upgradeStepKey,
  type PlannerMaterialDeposits,
} from "@/lib/guild-buildings-materials";
import { formatDailyResetLabel } from "@/lib/guild-reset";
import { GuildCreditHallSettings } from "./GuildCreditHallSettings";
import { GuildBuildingsScenarioCompare } from "./GuildBuildingsScenarioCompare";
import { GuildUpgradePathPanel } from "./GuildUpgradePathPanel";

const STORAGE_KEY = "ironwood-guild-buildings-state";

const CREDIT_HALL_IDS: GuildBuildingId[] = ["GuildHall", "GuildEventHall", "GuildTrialHall"];

function loadLocalBuildingLevels(): GuildBuildingLevels {
  if (typeof window === "undefined") return DEFAULT_GUILD_BUILDING_LEVELS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GUILD_BUILDING_LEVELS;
    const parsed = JSON.parse(raw) as { levels: GuildBuildingLevels };
    return { ...DEFAULT_GUILD_BUILDING_LEVELS, ...parsed.levels };
  } catch {
    return DEFAULT_GUILD_BUILDING_LEVELS;
  }
}

function loadLocalCredits(): number {
  if (typeof window === "undefined") return DEFAULT_GUILD_CREDITS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GUILD_CREDITS;
    const parsed = JSON.parse(raw) as { credits: number };
    return Number(parsed.credits) || DEFAULT_GUILD_CREDITS;
  } catch {
    return DEFAULT_GUILD_CREDITS;
  }
}

function IncomeRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-200">{formatCredits(value)}/wk</span>
    </div>
  );
}

function BuildingIncomeStats({
  incomeNow,
  bankCoinsNow,
  layout = "stack",
}: {
  incomeNow: ReturnType<typeof weeklyCreditIncome>;
  bankCoinsNow: number;
  layout?: "stack" | "grid";
}) {
  const cards = (
    <>
      <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
        <p className="text-sm font-medium text-white">Weekly income (now)</p>
        <div className="mt-2 space-y-1">
          <IncomeRow label="Daily quests" value={incomeNow.dailyQuests} />
          <IncomeRow
            label={`Events (~${eventsPerWeek()} active/wk)`}
            value={incomeNow.events}
          />
          <IncomeRow label="Trials (16 skills)" value={incomeNow.trials} />
          <div className="border-t border-slate-700/50 pt-1">
            <IncomeRow label="Total credits" value={incomeNow.total} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-yellow-900/30 bg-yellow-950/15 p-4">
        <p className="text-sm font-medium text-yellow-100">Guild Bank coins (now)</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {DEFAULT_GUILD_MEMBER_COUNT} members × level × 1,000 × 13 / day
        </p>
        <p className="mt-2 text-lg font-semibold text-yellow-200">
          {formatCoins(bankCoinsNow)}/wk
        </p>
        <p className="text-xs text-slate-500">Paid to players, not Guild Credits</p>
      </div>
    </>
  );

  if (layout === "grid") {
    return <div className="grid gap-4 sm:grid-cols-2">{cards}</div>;
  }

  return <div className="space-y-3">{cards}</div>;
}

export function GuildBuildingsView({
  guildConfig,
  currentUser,
  canEditHalls,
  onGuildConfigSaved,
}: {
  guildConfig: GuildConfig | null;
  currentUser: Member;
  canEditHalls: boolean;
  onGuildConfigSaved: (config: GuildConfig) => void;
}) {
  const preferredStrategy =
    guildConfig?.preferred_building_strategy ?? DEFAULT_PREFERRED_BUILDING_STRATEGY;

  const [localLevels, setLocalLevels] = useState<GuildBuildingLevels>(loadLocalBuildingLevels);
  const [credits, setCredits] = useState(loadLocalCredits);
  const [detailStrategy, setDetailStrategy] = useState<UpgradeStrategyId>(preferredStrategy);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [materialDeposits, setMaterialDeposits] = useState<PlannerMaterialDeposits>(() =>
    normalizeMaterialDeposits(guildConfig?.planner_material_deposits),
  );
  const [materialSaveMessage, setMaterialSaveMessage] = useState<string | null>(null);
  const materialSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMaterialDeposits(normalizeMaterialDeposits(guildConfig?.planner_material_deposits));
  }, [guildConfig?.planner_material_deposits]);

  useEffect(() => {
    if (!canEditHalls || !guildConfig) return;
    if (guildConfig.planner_levels) {
      setLocalLevels((prev) => ({
        ...DEFAULT_GUILD_BUILDING_LEVELS,
        ...prev,
        ...guildConfig.planner_levels,
      }));
    }
    if (guildConfig.planner_credits != null) {
      setCredits(guildConfig.planner_credits);
    }
  }, [canEditHalls, guildConfig]);

  useEffect(() => {
    if (canEditHalls) {
      setDetailStrategy(preferredStrategy);
    }
  }, [preferredStrategy, canEditHalls]);

  const levels = useMemo(() => {
    if (canEditHalls) {
      return mergeBuildingLevelsWithConfig(localLevels, guildConfig);
    }
    return plannerBuildingLevelsFromConfig(guildConfig, DEFAULT_GUILD_BUILDING_LEVELS);
  }, [canEditHalls, localLevels, guildConfig]);

  const effectiveCredits = useMemo(() => {
    if (canEditHalls) return credits;
    return plannerCreditsFromConfig(guildConfig, DEFAULT_GUILD_CREDITS);
  }, [canEditHalls, credits, guildConfig]);

  const scenarios = useMemo(
    () => buildScenarioComparison({ levels, credits: effectiveCredits }),
    [levels, effectiveCredits],
  );

  const activeStrategy = canEditHalls ? detailStrategy : preferredStrategy;

  const detailScenario = useMemo(
    () => scenarios.find((row) => row.strategy === activeStrategy) ?? scenarios[0],
    [scenarios, activeStrategy],
  );

  const incomeNow = useMemo(() => weeklyCreditIncome(levels), [levels]);
  const bankCoinsNow = useMemo(() => weeklyGuildBankCoins(levels.GuildBank), [levels.GuildBank]);
  const remainingCredits = useMemo(() => totalRemainingUpgradeCredits(levels), [levels]);

  const mechanicsItems = useMemo(
    () => [
      `Guild credits — daily quests: Guild Hall level × 20 × 13 — paid at ${formatDailyResetLabel()}`,
      `Guild credits — events: Event Hall level × 400 per completed event (~${eventsPerWeek()}/wk active)`,
      `Guild credits — trials: Trial Hall level × 50 × 16 per week — Mon ${formatDailyResetLabel()}`,
      `Player coins — Guild Bank: level × 1,000 × 13 per member per day (${DEFAULT_GUILD_MEMBER_COUNT} members each receive the full amount)`,
      "Upgrade costs (credits): 100 → 1k → 5k → 10k → 25k → 50k → 100k → 150k",
      ...detailScenario.schedule.notes,
    ],
    [detailScenario.schedule.notes],
  );

  function updateLevel(id: GuildBuildingId, value: number) {
    if (CREDIT_HALL_IDS.includes(id)) return;
    setLocalLevels((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(8, Math.floor(value) || 0)),
    }));
  }

  async function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        levels: stripCreditHallsFromLevels(localLevels),
        credits,
      }),
    );
    setSaveMessage(null);
    const { config: saved, error } = await saveGuildConfig(
      {
        plannerCredits: credits,
        plannerLevels: stripCreditHallsFromLevels(localLevels),
      },
      currentUser,
    );
    if (error) {
      setSaveMessage(error);
      return;
    }
    if (saved) {
      onGuildConfigSaved(saved);
      setSaveMessage("Building levels saved for the guild.");
    }
  }

  function resetDefaults() {
    setLocalLevels(DEFAULT_GUILD_BUILDING_LEVELS);
    setCredits(DEFAULT_GUILD_CREDITS);
    localStorage.removeItem(STORAGE_KEY);
  }

  async function savePreferredPath() {
    const { config: saved, error } = await saveGuildConfig(
      { preferredBuildingStrategy: detailStrategy },
      currentUser,
    );
    if (error) throw new Error(error);
    if (saved) onGuildConfigSaved(saved);
  }

  const persistMaterialDeposits = useCallback(
    (next: PlannerMaterialDeposits) => {
      if (!canEditHalls) return;
      if (materialSaveTimerRef.current) clearTimeout(materialSaveTimerRef.current);
      materialSaveTimerRef.current = setTimeout(async () => {
        setMaterialSaveMessage(null);
        const { config: saved, error } = await saveGuildConfig(
          { plannerMaterialDeposits: next },
          currentUser,
        );
        if (error) {
          setMaterialSaveMessage(error);
          return;
        }
        if (saved) onGuildConfigSaved(saved);
      }, 500);
    },
    [canEditHalls, currentUser, onGuildConfigSaved],
  );

  function findUpgradeStep(stepKey: string) {
    return detailScenario.schedule.upgrades.find(
      (step) => upgradeStepKey(step.buildingId, step.fromLevel) === stepKey,
    );
  }

  function handleMaterialDepositChange(stepKey: string, materialId: string, amount: number) {
    const next = setMaterialDeposit(materialDeposits, stepKey, materialId, amount);
    setMaterialDeposits(next);
    persistMaterialDeposits(next);
  }

  function handleMarkStepMaterialsReady(stepKey: string) {
    const step = findUpgradeStep(stepKey);
    if (!step) return;
    const next = markStepMaterialsReady(materialDeposits, step);
    setMaterialDeposits(next);
    persistMaterialDeposits(next);
  }

  function handleClearStepMaterials(stepKey: string) {
    const next = clearStepMaterials(materialDeposits, stepKey);
    setMaterialDeposits(next);
    persistMaterialDeposits(next);
  }

  const materialPanelProps = {
    materialDeposits,
    canEditMaterials: canEditHalls,
    onMaterialDepositChange: canEditHalls ? handleMaterialDepositChange : undefined,
    onMarkStepMaterialsReady: canEditHalls ? handleMarkStepMaterialsReady : undefined,
    onClearStepMaterials: canEditHalls ? handleClearStepMaterials : undefined,
  };

  if (!canEditHalls) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
          <h2 className="text-base font-semibold text-white">Guild Buildings — Upgrade Plan</h2>
          <p className="mt-1 text-sm text-slate-400">
            Official upgrade path set by guild officers, based on current building levels and guild
            credits.
          </p>
        </div>

        <BuildingIncomeStats incomeNow={incomeNow} bankCoinsNow={bankCoinsNow} layout="grid" />

        <GuildUpgradePathPanel
          detailScenario={detailScenario}
          remainingCredits={remainingCredits}
          selectedStrategy={preferredStrategy}
          preferredStrategy={preferredStrategy}
          canSelectStrategy={false}
          canSetPreferred={false}
          preferredUpdatedBy={guildConfig?.updated_by}
          preferredUpdatedAt={guildConfig?.updated_at}
          showMechanics
          mechanicsItems={mechanicsItems}
          {...materialPanelProps}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
        <h2 className="text-base font-semibold text-white">Guild Buildings — Credit Planner</h2>
        <p className="mt-1 text-sm text-slate-400">
          Optimal upgrade path to max all buildings, assuming full daily quests, events, and
          trials. Credit formulas from in-game guild building mechanics.
        </p>
      </div>

      <GuildCreditHallSettings
        config={guildConfig}
        actorMember={currentUser}
        canEdit={canEditHalls}
        onSaved={onGuildConfigSaved}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-white">Current buildings</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveState}
                className="rounded-md bg-slate-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-600"
              >
                Save
              </button>
              <button
                type="button"
                onClick={resetDefaults}
                className="rounded-md border border-slate-600 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Reset to alliance defaults
              </button>
            </div>
          </div>
          {saveMessage && (
            <p
              className={`mb-3 text-xs ${saveMessage.includes("Could not") || saveMessage.includes("required") ? "text-red-300" : "text-emerald-300"}`}
            >
              {saveMessage}
            </p>
          )}

          <div className="mb-4">
            <label className="text-xs text-slate-400">Guild credits in bank</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={credits}
                onChange={(e) => setCredits(Math.max(0, Number(e.target.value) || 0))}
                className="w-32 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {GUILD_BUILDING_ORDER.map((id) => {
              const def = GUILD_BUILDINGS[id];
              const lv = levels[id];
              const maxed = lv >= def.maxLevel;
              const fromConfig = CREDIT_HALL_IDS.includes(id);
              return (
                <label
                  key={id}
                  className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2"
                >
                  <span className="text-sm text-slate-200">
                    {def.name}
                    {fromConfig && (
                      <span className="ml-1 text-xs text-slate-500">(officer setting)</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={def.maxLevel}
                      value={lv}
                      disabled={fromConfig || (maxed && id === "GuildHall")}
                      onChange={(e) => updateLevel(id, Number(e.target.value))}
                      className="w-14 rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-right text-sm text-white disabled:opacity-50"
                    />
                    <span className="text-xs text-slate-500">/ {def.maxLevel}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <BuildingIncomeStats incomeNow={incomeNow} bankCoinsNow={bankCoinsNow} />
      </div>

      <GuildBuildingsScenarioCompare levels={levels} scenarios={scenarios} />

      <GuildUpgradePathPanel
        detailScenario={detailScenario}
        remainingCredits={remainingCredits}
        selectedStrategy={detailStrategy}
        preferredStrategy={preferredStrategy}
        onSelectStrategy={setDetailStrategy}
        canSelectStrategy
        canSetPreferred
        onSavePreferred={savePreferredPath}
        preferredUpdatedBy={guildConfig?.updated_by}
        preferredUpdatedAt={guildConfig?.updated_at}
        actorMember={currentUser}
        showMechanics
        mechanicsItems={mechanicsItems}
        {...materialPanelProps}
      />
      {materialSaveMessage && (
        <p className="text-xs text-red-300">{materialSaveMessage}</p>
      )}
    </div>
  );
}
