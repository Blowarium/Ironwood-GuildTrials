"use client";

import type { TrialSyncApplyResult } from "@/lib/ironwood-trial-sync";

export function TrialSyncResultBanner({
  result,
  weekStart,
  onDismiss,
}: {
  result: TrialSyncApplyResult;
  weekStart: string;
  onDismiss: () => void;
}) {
  const total =
    result.created.length + result.updated.length + result.unchanged.length + result.errors.length;

  if (total === 0 && result.skipped.length === 0) return null;

  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-950/30 px-3 py-2 text-sm text-slate-200 sm:px-4 sm:py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-violet-100">Ironwood trial sync applied</p>
          <p className="mt-1 text-xs text-slate-400">Week of {weekStart}</p>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-300">
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
                {result.unchanged.length} already matched
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
