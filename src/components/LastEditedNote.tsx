"use client";

import type { Member } from "@/lib/constants";

export function LastEditedNote({
  by,
  at,
  compact,
}: {
  by: Member | string | null | undefined;
  at?: string | null;
  compact?: boolean;
}) {
  if (!by) return null;
  const when = at ? formatRelative(at) : null;
  return (
    <p className={`text-slate-500 ${compact ? "text-[9px]" : "text-[10px]"}`}>
      Last change: <span className="text-slate-400">{by}</span>
      {when ? ` · ${when}` : ""}
    </p>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
