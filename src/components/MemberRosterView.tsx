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
  const prefsCustomized = roster.filter((r) => r.preferences_customized).length;

  return (
    <div className="space-y-2 sm:space-y-4">
      <div className="mobile-panel rounded-xl border border-slate-700/50 bg-[#131f36] sm:p-4">
        <h2 className="text-sm font-semibold text-white sm:text-lg">Guild roster</h2>
        <p className="mt-0.5 text-xs text-slate-400 sm:mt-1 sm:text-sm">
          <span className="sm:hidden">
            {complete}/{roster.length} ready · {prefsCustomized}/{roster.length} prefs set
          </span>
          <span className="hidden sm:inline">
            Track who has filled in skill XP/h and preference ranks. {complete}/{roster.length}{" "}
            profiles look ready (3+ ranks with XP/h).
          </span>
        </p>
        <div className="mt-2 hidden gap-3 sm:grid sm:grid-cols-2">
          <div className="rounded-lg bg-slate-900/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Profiles ready</p>
            <p className="text-lg font-bold text-white">
              {complete}/{roster.length}
            </p>
          </div>
          <div className="rounded-lg bg-slate-900/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              Preferences customized
            </p>
            <p className="text-lg font-bold text-white">
              {prefsCustomized}/{roster.length}
            </p>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      </div>

      <div className="space-y-1 md:hidden">
        {roster.map((row) => (
          <div
            key={row.member_name}
            className="mobile-card rounded-lg border border-slate-700/50 bg-[#131f36]"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium text-slate-200">{row.member_name}</p>
              <button
                type="button"
                onClick={() => onOpenProfile(row.member_name)}
                className="shrink-0 text-[10px] text-sky-400 hover:underline"
              >
                Profile
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {isLeader && row.member_name !== currentUser ? (
                <select
                  value={row.role}
                  disabled={savingRole === row.member_name}
                  onChange={(e) =>
                    handleRoleChange(row.member_name, e.target.value as GuildRole)
                  }
                  className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 text-[11px] text-white"
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
              <span className="text-[10px] text-slate-500">
                {row.ranked_skill_count}/{row.total_skills} ranks · {row.xp_filled_count}/
                {row.total_skills} XP/h
              </span>
              <span
                className={`text-[10px] ${row.profile_complete ? "text-emerald-400" : "text-amber-300"}`}
              >
                {row.profile_complete ? "Ready" : "Incomplete"}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mobile-scroll-x hidden overflow-x-auto rounded-xl border border-slate-700/50 md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-700/60 bg-slate-900/50 text-left text-xs text-slate-500">
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Ranks set</th>
              <th className="px-3 py-2">Prefs set</th>
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
                <td className="px-3 py-2">
                  <span
                    className={`text-xs font-medium ${
                      row.preferences_customized ? "text-emerald-400" : "text-slate-500"
                    }`}
                  >
                    {row.preferences_customized ? "Yes" : "Default"}
                  </span>
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
