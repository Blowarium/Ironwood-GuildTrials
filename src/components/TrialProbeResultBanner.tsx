"use client";

import type { IronwoodTrialProbeReport } from "@/lib/ironwood-trial-sync";

function diagLine(label: string, ok: boolean | number, detail?: string) {
  const value =
    typeof ok === "boolean" ? (ok ? "yes" : "no") : String(ok);
  return (
    <li className={ok ? "text-slate-300" : "text-amber-300/90"}>
      {label}: <span className="font-mono">{value}</span>
      {detail ? <span className="text-slate-500"> — {detail}</span> : null}
    </li>
  );
}

export function TrialProbeResultBanner({
  report,
  onDismiss,
}: {
  report: IronwoodTrialProbeReport;
  onDismiss: () => void;
}) {
  const d = report.diagnostics;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-slate-200 sm:px-4 sm:py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-100">Ironwood trial data probe</p>
          <p className="mt-1 text-xs text-slate-400">
            Ran {new Date(report.importedAt).toLocaleString()} — read-only diagnostics
          </p>

          <ul className="mt-2 space-y-0.5 text-xs">
            {diagLine("capture hook installed", d.captureHookInstalled)}
            {diagLine("Trials tab active (UI)", d.trialsTabActive ?? false)}
            {d.navigationMethod != null && (
              <li className="text-slate-300">
                Navigation method: <span className="font-mono">{d.navigationMethod}</span>
              </li>
            )}
            {diagLine("DOM skill headers visible", d.domSkillHeadersFound ?? 0)}
            {diagLine("DOM member XP lines", d.domMemberXpLinesFound ?? 0)}
            {diagLine("DOM assignments parsed", d.domAssignmentsCollected ?? 0)}
            {diagLine("Network URLs seen", d.captureNetworkUrlsSeen ?? 0)}
            {diagLine("Angular component found", d.componentFound)}
            {diagLine("guild$ observable", d.hasGuildObservable)}
            {diagLine("trialSkills$ observable", d.hasTrialSkillsObservable)}
            {diagLine("guild.trial on object", d.guildTrialOnGuildObject)}
            {diagLine("trial.members count", d.trialMembersOnGuildTrial)}
            {diagLine("trialSkills$ rows", d.trialSkillsRowCount)}
            {diagLine("trialSkills$ members", d.trialSkillsMemberCount)}
            {diagLine("API capture responses", d.captureRawResponses)}
            {diagLine("capture has guild.trial", d.captureHasGuildTrial)}
            {diagLine("Assignments collected", d.assignmentRowsCollected)}
            {diagLine("With endDate", d.assignmentsWithEndDate, "real timer data")}
            {diagLine("window.ng.getComponent", d.ngGetComponentAvailable)}
            {diagLine("__ngContext__ nodes scanned", d.ngContextNodesWithContext)}
          </ul>

          {report.trialMeta && (
            <p className="mt-2 text-xs text-slate-400">
              Trial week meta: start {report.trialMeta.startDate ?? "—"}, end{" "}
              {report.trialMeta.endDate ?? "—"}, requiredExp{" "}
              {report.trialMeta.requiredExp ?? "—"}
            </p>
          )}

          {report.assignments.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-300">
                Assignments sample ({report.assignments.length})
              </summary>
              <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto font-mono text-[11px] text-slate-400">
                {report.assignments.map((a, i) => (
                  <li key={`${a.displayName}-${a.source}-${i}`}>
                    {a.displayName} · skillId {String(a.skillId)} · {a.source}
                    {a.endDate ? ` · ends ${a.endDate}` : " · no endDate"}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-slate-400 hover:text-slate-300">
              Full JSON
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/30 p-2 text-[10px] text-slate-400">
              {JSON.stringify(report, null, 2)}
            </pre>
          </details>
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
