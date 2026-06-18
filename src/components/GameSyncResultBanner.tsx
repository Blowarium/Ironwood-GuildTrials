"use client";

import type { GameSyncApplyResult } from "@/lib/ironwood-game-sync";
import { gameSyncResultHasVisibleContent } from "@/lib/game-sync-session";

export function GameSyncResultBanner({
  result,
  weekStart,
  onDismiss,
}: {
  result: GameSyncApplyResult;
  weekStart: string;
  onDismiss: () => void;
}) {
  const hasContent = gameSyncResultHasVisibleContent(result);

  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-950/30 px-3 py-2 text-sm text-slate-200 sm:px-4 sm:py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-violet-100">
            {hasContent ? "Game data sync applied" : "Game data sync complete"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Week of {weekStart}
            {result.payloadSource ? ` · source ${result.payloadSource}` : ""}
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-300">
            {!hasContent && (
              <li className="text-slate-500">
                No signup, completion, or building deposit changes.
              </li>
            )}
            {result.created.length > 0 && (
              <li>
                <span className="text-emerald-300">{result.created.length} scheduled</span>
                {" — "}
                {result.created.join(", ")}
              </li>
            )}
            {result.updated.length > 0 && (
              <li>
                <span className="text-sky-300">{result.updated.length} updated</span>
                {" — "}
                {result.updated.join(", ")}
              </li>
            )}
            {result.unchanged.length > 0 && (
              <li className="text-slate-500">
                {result.unchanged.length} signup{result.unchanged.length === 1 ? "" : "s"} already matched
              </li>
            )}
            {result.completionsMarked.length > 0 && (
              <li>
                <span className="text-emerald-300">
                  {result.completionsMarked.length} skill
                  {result.completionsMarked.length === 1 ? "" : "s"} marked done
                </span>
                {" — "}
                {result.completionsMarked.join(", ")}
              </li>
            )}
            {result.completionsUnmarked.length > 0 && (
              <li>
                <span className="text-amber-300">
                  {result.completionsUnmarked.length} skill
                  {result.completionsUnmarked.length === 1 ? "" : "s"} unmarked
                </span>
                {" — "}
                {result.completionsUnmarked.join(", ")}
              </li>
            )}
            {result.skipped.map((s) => (
              <li key={s.displayName} className="text-amber-300/90">
                Skipped {s.displayName}: {s.reason}
              </li>
            ))}
            {result.errors.map((e) => (
              <li key={e.member} className="text-red-300">
                {e.member}: {e.error}
              </li>
            ))}
            {result.buildingMaterialsApplied?.map((step) => (
              <li key={`${step.buildingId}:${step.fromLevel}`}>
                <span className="text-emerald-300">Building deposits synced</span>
                {" — "}
                {step.buildingId} Lv.{step.fromLevel} → {step.fromLevel + 1}
                {step.materialCount > 0 || step.coinsDeposited > 0 ? (
                  <>
                    {" "}
                    (
                    {[
                      step.materialCount > 0
                        ? `${step.materialCount} material${step.materialCount === 1 ? "" : "s"}`
                        : null,
                      step.coinsDeposited > 0
                        ? `${step.coinsDeposited.toLocaleString()} coins`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    )
                  </>
                ) : (
                  <span className="text-slate-500"> (none deposited)</span>
                )}
              </li>
            ))}
            {result.buildingMaterialsError && (
              <li className="text-amber-300">{result.buildingMaterialsError}</li>
            )}
            {result.completionErrors.map((e) => (
              <li key={e.skill} className="text-red-300">
                {e.skill} completion: {e.error}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs text-slate-400 hover:text-slate-200"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
