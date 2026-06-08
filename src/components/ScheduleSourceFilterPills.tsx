"use client";

export type ScheduleSourceId = "scheduled" | "suggested";

const SOURCES: { id: ScheduleSourceId; name: string; description: string }[] = [
  {
    id: "scheduled",
    name: "Scheduled",
    description: "Trial XP from members already on the planner",
  },
  {
    id: "suggested",
    name: "Suggested",
    description: "Additional trial XP from smart-schedule suggestions",
  },
];

const accentActive = "border-sky-600/60 bg-sky-900/30 text-sky-100";

export function ScheduleSourceFilterPills({
  enabled,
  onToggle,
}: {
  enabled: Record<ScheduleSourceId, boolean>;
  onToggle: (id: ScheduleSourceId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {SOURCES.map((s) => {
        const isActive = enabled[s.id] ?? false;
        return (
          <button
            key={s.id}
            type="button"
            title={s.description}
            onClick={() => onToggle(s.id)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              isActive ? accentActive : "border-slate-700 text-slate-500 hover:border-slate-600"
            }`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
