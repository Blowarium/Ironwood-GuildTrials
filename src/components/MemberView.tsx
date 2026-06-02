import { MEMBERS, type Member, type Skill } from "@/lib/constants";
import type { TrialSignup } from "@/lib/types";
import { formatDayLabel } from "@/lib/weeks";
import { SkillIcon } from "./SkillIcon";
import { StatusBadge } from "./StatusBadge";

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
    <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-[#131f36]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/60 text-left text-xs text-slate-400">
            <th className="px-4 py-3 font-medium">Member</th>
            <th className="px-4 py-3 font-medium">Week assignment</th>
            <th className="px-4 py-3 font-medium">Status</th>
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
                <td className="px-4 py-2.5 font-medium text-slate-200">{m}</td>
                <td className="px-4 py-2.5">
                  {s ? (
                    <button
                      type="button"
                      onClick={() => onSelectSignup(s)}
                      className="inline-flex items-center gap-2 text-left text-sky-300 hover:underline"
                    >
                      <SkillIcon skill={s.skill as Skill} size="sm" />
                      <span>
                        {s.skill} — {formatDayLabel(s.planned_date)}
                      </span>
                    </button>
                  ) : (
                    <span className="text-amber-400/90">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {s ? <StatusBadge status={s.status} /> : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
