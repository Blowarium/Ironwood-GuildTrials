"use client";

import { ROLE_LABELS, type GuildRole } from "@/lib/roles";
import { isStaffRole } from "@/lib/permissions";
import type { Member } from "@/lib/constants";

const ROLE_STYLES: Record<GuildRole, string> = {
  guild_leader: "bg-amber-500/20 text-amber-200 ring-amber-500/40",
  guild_officer: "bg-sky-500/20 text-sky-200 ring-sky-500/40",
  guild_member: "bg-slate-700/60 text-slate-300 ring-slate-600/40",
};

export function RoleBadge({ role }: { role: GuildRole }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${ROLE_STYLES[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export function ProfileHeaderBar({
  currentUser,
  dbRole,
  effectiveRole,
  staffUnlocked,
  onOpenProfile,
  onSwitchUser,
  onUnlockStaff,
  onSignOutStaff,
}: {
  currentUser: Member;
  dbRole: GuildRole;
  effectiveRole: GuildRole;
  staffUnlocked: boolean;
  onOpenProfile: () => void;
  onSwitchUser: () => void;
  onUnlockStaff: () => void;
  onSignOutStaff: () => void;
}) {
  const staffLocked = isStaffRole(dbRole) && !staffUnlocked;

  return (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-1.5">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Signed in</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">{currentUser}</span>
          <RoleBadge role={effectiveRole} />
          {staffLocked && (
            <span className="text-[10px] text-amber-300/90">({ROLE_LABELS[dbRole]} locked)</span>
          )}
        </div>
      </div>
      {staffLocked && (
        <button
          type="button"
          onClick={onUnlockStaff}
          className="rounded-md border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-900/40"
        >
          Unlock {ROLE_LABELS[dbRole].toLowerCase()}
        </button>
      )}
      {staffUnlocked && isStaffRole(dbRole) && (
        <button
          type="button"
          onClick={onSignOutStaff}
          className="rounded-md border border-slate-600 px-2 py-2 text-xs text-slate-400 hover:text-slate-200"
          title="Clear staff session on this device"
        >
          Sign out staff
        </button>
      )}
      <button
        type="button"
        onClick={onOpenProfile}
        className="rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
      >
        My profile
      </button>
      <button
        type="button"
        onClick={onSwitchUser}
        className="rounded-md border border-slate-600 px-2 py-2 text-xs text-slate-400 hover:text-slate-200"
      >
        Switch player
      </button>
    </div>
  );
}
