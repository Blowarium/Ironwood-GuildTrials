"use client";

import { GameDataSyncPanel } from "./GameDataSyncPanel";

export function GameDataSyncModal({
  open,
  onClose,
  returnUrl,
  staffUnlocked,
  helperReady,
  onHelperReadyChange,
  autoSyncActive,
  lastAutoSyncAt,
}: {
  open: boolean;
  onClose: () => void;
  returnUrl: string;
  staffUnlocked: boolean;
  helperReady?: boolean;
  onHelperReadyChange?: (ready: boolean) => void;
  autoSyncActive?: boolean;
  lastAutoSyncAt?: Date | null;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-2 sm:items-center sm:p-4">
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-violet-500/30 bg-[#131f36] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-sync-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-700/50 px-4 py-3">
          <h2 id="game-sync-title" className="text-base font-semibold text-violet-100">
            Sync game data
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-4 py-3">
          <GameDataSyncPanel
            returnUrl={returnUrl}
            staffUnlocked={staffUnlocked}
            helperReady={helperReady}
            onHelperReadyChange={onHelperReadyChange}
            autoSyncActive={autoSyncActive}
            lastAutoSyncAt={lastAutoSyncAt}
            embedded
          />
        </div>
      </div>
    </div>
  );
}
