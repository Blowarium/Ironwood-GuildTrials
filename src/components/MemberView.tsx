"use client";

import { MEMBERS, type Member, type Skill } from "@/lib/constants";
import type { TrialSignup } from "@/lib/types";
import { formatDayLabel } from "@/lib/weeks";
import { formatTimeLabel, getEffectiveStatus } from "@/lib/trial-schedule";
import { LastEditedNote } from "./LastEditedNote";
import { SkillIcon } from "./SkillIcon";
import { StatusBadge } from "./StatusBadge";

function MemberAssignmentRow({
  member,
  signup,
  onSelectSignup,
}: {
  member: Member;
  signup: TrialSignup | undefined;
  onSelectSignup: (s: TrialSignup) => void;
}) {
  return (
    <>
      <td className="px-4 py-2.5 font-medium text-slate-200">{member}</td>
      <td className="px-4 py-2.5">
        {signup ? (
          <button
            type="button"
            onClick={() => onSelectSignup(signup)}
            className="inline-flex items-center gap-2 text-left text-sky-300 hover:underline"
          >
            <SkillIcon skill={signup.skill as Skill} size="sm" />
            <span>
              {signup.skill} — {formatDayLabel(signup.planned_date)}{" "}
              {formatTimeLabel(signup.planned_start_at)}
            </span>
          </button>
        ) : (
          <span className="text-amber-400/90">Unassigned</span>
        )}
      </td>
      <td className="px-4 py-2.5">{signup ? <StatusBadge status={getEffectiveStatus(signup)} /> : "—"}</td>
      <td className="px-4 py-2.5">
        {signup ? (
          <LastEditedNote by={signup.last_edited_by} at={signup.updated_at} compact />
        ) : (
          "—"
        )}
      </td>
    </>
  );
}

export function MemberView({
  signups,
  currentUser,
  onSelectSignup,
}: {
  signups: TrialSignup[];
  currentUser: Member | "";
  onSelectSignup: (s: TrialSignup) => void;
}) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {MEMBERS.map((m) => {
          const s = signups.find((x) => x.member_name === m);
          return (
            <div
              key={m}
              className={`rounded-xl border border-slate-700/50 bg-[#131f36] p-3 ${
                m === currentUser ? "ring-1 ring-sky-500/40" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-slate-200">{m}</p>
                {s ? <StatusBadge status={getEffectiveStatus(s)} /> : null}
              </div>
              {s ? (
                <button
                  type="button"
                  onClick={() => onSelectSignup(s)}
                  className="mt-2 flex w-full items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-900/40 px-3 py-2 text-left text-sm text-sky-300"
                >
                  <SkillIcon skill={s.skill as Skill} size="sm" />
                  <span className="min-w-0">
                    {s.skill}
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {formatDayLabel(s.planned_date)} · {formatTimeLabel(s.planned_start_at)}
                    </span>
                  </span>
                </button>
              ) : (
                <p className="mt-2 text-sm text-amber-400/90">Unassigned</p>
              )}
              {s && (
                <div className="mt-2">
                  <LastEditedNote by={s.last_edited_by} at={s.updated_at} compact />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-slate-700/50 bg-[#131f36] md:block mobile-scroll-x">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-700/60 text-left text-xs text-slate-400">
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Week assignment</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last change</th>
            </tr>
          </thead>
          <tbody>
            {MEMBERS.map((m) => {
              const s = signups.find((x) => x.member_name === m);
              return (
                <tr
                  key={m}
                  className={`border-b border-slate-800/50 ${
                    m === currentUser ? "bg-sky-950/20" : ""
                  }`}
                >
                  <MemberAssignmentRow
                    member={m}
                    signup={s}
                    onSelectSignup={onSelectSignup}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
