"use client";

import type { Member, Skill } from "@/lib/constants";
import type { TrialSignup } from "@/lib/types";
import { formatDayLabel } from "@/lib/weeks";
import { SkillIcon } from "./SkillIcon";
import { StatusBadge } from "./StatusBadge";
import type { CellTarget } from "./CellAssignmentModal";

export function DayDragBoard({
  weekDays,
  signupsByDay,
  currentUser,
  canDragSignup,
  onDropOnDay,
  onCardClick,
}: {
  weekDays: string[];
  signupsByDay: Map<string, TrialSignup[]>;
  currentUser: Member | "";
  canDragSignup: (signup: TrialSignup) => boolean;
  onDropOnDay: (day: string, signup: TrialSignup) => void;
  onCardClick: (target: CellTarget, signup: TrialSignup) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {weekDays.map((day) => {
        const list = signupsByDay.get(day) ?? [];
        return (
          <div
            key={day}
            className="rounded-xl border border-slate-700/50 bg-[#131f36] p-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              try {
                const raw = e.dataTransfer.getData("application/json");
                const signup = JSON.parse(raw) as TrialSignup;
                onDropOnDay(day, signup);
              } catch {
                /* ignore */
              }
            }}
          >
            <h3 className="font-semibold text-white">{formatDayLabel(day)}</h3>
            <p className="text-xs text-slate-500">{list.length} trial(s)</p>
            <ul className="mt-2 min-h-[80px] space-y-2">
              {list.length === 0 ? (
                <li className="rounded-lg border border-dashed border-slate-700 py-6 text-center text-xs text-slate-600">
                  Drop a trial here
                </li>
              ) : (
                list.map((s) => {
                  const draggable = canDragSignup(s);
                  return (
                  <li key={s.id}>
                    <button
                      type="button"
                      draggable={draggable}
                      onDragStart={(e) => {
                        if (!draggable) {
                          e.preventDefault();
                          return;
                        }
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify(s),
                        );
                      }}
                      onClick={() =>
                        onCardClick(
                          { skill: s.skill as Skill, plannedDate: day },
                          s,
                        )
                      }
                      className={`flex w-full cursor-grab items-center gap-2 rounded-lg border px-2 py-2 text-left active:cursor-grabbing ${
                        s.member_name === currentUser
                          ? "border-sky-500/40 bg-sky-950/30"
                          : "border-slate-600 bg-slate-900/60"
                      }`}
                    >
                      <SkillIcon skill={s.skill as Skill} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {s.skill}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {s.member_name}
                        </p>
                      </div>
                      <StatusBadge status={s.status} small />
                    </button>
                  </li>
                  );
                })
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
