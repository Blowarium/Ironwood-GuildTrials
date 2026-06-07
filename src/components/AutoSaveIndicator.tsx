"use client";

import type { AutoSaveStatus } from "@/lib/use-auto-save";

export function AutoSaveIndicator({
  status,
  error,
}: {
  status: AutoSaveStatus;
  error?: string | null;
}) {
  if (status === "pending" || status === "saving") {
    return <span className="text-xs text-slate-400">Saving…</span>;
  }
  if (status === "saved") {
    return <span className="text-xs text-emerald-300">Saved</span>;
  }
  if (status === "error" && error) {
    return <span className="text-xs text-red-300">{error}</span>;
  }
  return null;
}
