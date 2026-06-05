"use client";

import {
  formatGuildEventSegmentLabel,
  GUILD_EVENT_LABELS,
  guildEventSegmentsInWeek,
  type GuildEventType,
} from "@/lib/guild-events";

const EVENT_STYLES: Record<GuildEventType, { bar: string; text: string }> = {
  gathering: {
    bar: "border-emerald-500/50 bg-emerald-600/35",
    text: "text-emerald-100",
  },
  crafting: {
    bar: "border-amber-500/50 bg-amber-600/35",
    text: "text-amber-100",
  },
  combat: {
    bar: "border-rose-500/50 bg-rose-600/35",
    text: "text-rose-100",
  },
};

function segmentShortLabel(type: GuildEventType): string {
  return GUILD_EVENT_LABELS[type].replace(" Event", "");
}

export function GuildEventWeekBar({
  weekStart,
  minWidth,
  height = 36,
  matchType,
  overlay = false,
}: {
  weekStart: string;
  minWidth: number;
  height?: number;
  /** When set, only show active segments for this event type (skill-row overlay). */
  matchType?: GuildEventType;
  overlay?: boolean;
}) {
  const segments = guildEventSegmentsInWeek(weekStart).filter((seg) => {
    if (seg.phase !== "active") return false;
    if (matchType && seg.type !== matchType) return false;
    return true;
  });

  return (
    <div
      className={`relative w-full ${overlay ? "" : "rounded-md border border-slate-700/50 bg-slate-950/40"}`}
      style={{ height, minWidth }}
    >
      {segments.map((seg, i) => (
        <div
          key={`${seg.type}-${seg.phase}-${seg.startAt.toISOString()}-${i}`}
          style={{
            left: `${seg.leftPercent}%`,
            width: `${seg.widthPercent}%`,
          }}
          className={`absolute bottom-0 top-0 overflow-hidden border px-1 ${EVENT_STYLES[seg.type].bar}`}
          title={formatGuildEventSegmentLabel(seg)}
        >
          {seg.widthPercent > 6 && (
            <span
              className={`block truncate text-[9px] font-semibold leading-tight ${EVENT_STYLES[seg.type].text}`}
            >
              {segmentShortLabel(seg.type)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function GuildEventLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
      <span className="font-medium text-slate-400">Guild Events</span>
      {(["gathering", "crafting", "combat"] as const).map((type) => (
        <span key={type} className="inline-flex items-center gap-1">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-sm border ${EVENT_STYLES[type].bar}`}
          />
          {GUILD_EVENT_LABELS[type].replace(" Event", "")}
          <span className="text-slate-600">(48h)</span>
        </span>
      ))}
    </div>
  );
}
