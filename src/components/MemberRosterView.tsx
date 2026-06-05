"use client";

import { useEffect, useState } from "react";
import { GUILD_ROLES, ROLE_LABELS, type GuildRole } from "@/lib/roles";
import type { MemberRosterEntry } from "@/lib/member-profile";
import type { Member } from "@/lib/constants";
import { saveMemberRole } from "@/lib/api-client";
import { canManageRoles } from "@/lib/permissions";
import { RoleBadge } from "./ProfileHeaderBar";
import { LastEditedNote } from "./LastEditedNote";

export function MemberRosterView({
  roster,
  currentUser,
  currentUserRole,
  onRefresh,
  onOpenProfile,
}: {
  roster: MemberRosterEntry[];
  currentUser: Member;
  currentUserRole: GuildRole;
  onRefresh: () => void;
  onOpenProfile: (member: Member) => void;
}) {
  const [savingRole, setSavingRole] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isLeader = canManageRoles(currentUserRole);

  async function handleRoleChange(member: Member, role: GuildRole) {
    setSavingRole(member);
    setError(null);
    const { error: err } = await saveMemberRole({
      actorMember: currentUser,
      memberName: member,
      role,
    });
    setSavingRole(null);
    if (err) {
      setError(err);
      return;
    }
    onRefresh();
  }

  const complete = roster.filter((r) => r.profile_complete).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
        <h2 className="text-lg font-semibold text-white">Guild roster</h2>
        <p className="mt-1 text-sm text-slate-400">
          Track who has filled in skill XP/h and preference ranks. {complete}/{roster.length}{" "}
          profiles look ready (3+ ranks with XP/h).
        </p>
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/60 bg-slate-900/50 text-left text-xs text-slate-500">
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Ranks set</th>
              <th className="px-3 py-2">XP/h filled</th>
              <th className="px-3 py-2">Profile</th>
              <th className="px-3 py-2">Last updated</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {roster.map((row) => (
              <tr key={row.member_name} className="border-b border-slate-800/50">
                <td className="px-3 py-2 font-medium text-slate-200">{row.member_name}</td>
                <td className="px-3 py-2">
                  {isLeader && row.member_name !== currentUser ? (
                    <select
                      value={row.role}
                      disabled={savingRole === row.member_name}
                      onChange={(e) =>
                        handleRoleChange(row.member_name, e.target.value as GuildRole)
                      }
                      className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                    >
                      {GUILD_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <RoleBadge role={row.role} />
                  )}
                </td>
                <td className="px-3 py-2 text-slate-300">
                  {row.ranked_skill_count}/{row.total_skills}
                </td>
                <td className="px-3 py-2 text-slate-300">
                  {row.xp_filled_count}/{row.total_skills}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`text-xs font-medium ${
                      row.profile_complete ? "text-emerald-400" : "text-amber-300"
                    }`}
                  >
                    {row.profile_complete ? "Ready" : "Incomplete"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <LastEditedNote
                    by={row.profile_updated_by}
                    at={row.profile_updated_at}
                    compact
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(row.member_name)}
                    className="text-xs text-sky-400 hover:underline"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
