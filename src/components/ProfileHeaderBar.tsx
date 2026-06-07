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
      className={`inline-flex rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ring-1 sm:rounded-md sm:px-2 sm:py-0.5 sm:text-[10px] ${ROLE_STYLES[role]}`}
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
    <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 sm:ml-auto sm:w-auto sm:justify-end">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none sm:rounded-lg sm:border sm:border-slate-700/50 sm:bg-slate-900/50 sm:px-3 sm:py-1.5">
        <span className="hidden text-[10px] uppercase tracking-wide text-slate-500 sm:block">
          Signed in
        </span>
        <span className="truncate text-xs font-semibold text-white sm:text-sm">{currentUser}</span>
        <RoleBadge role={effectiveRole} />
        {staffLocked && (
          <span className="hidden text-[10px] text-amber-300/90 sm:inline">
            ({ROLE_LABELS[dbRole]} locked)
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1 sm:gap-2">
        {staffLocked && (
          <button
            type="button"
            onClick={onUnlockStaff}
            className="rounded border border-amber-500/40 bg-amber-950/40 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-900/40 sm:rounded-md sm:px-3 sm:py-2 sm:text-xs"
          >
            Unlock
          </button>
        )}
        {staffUnlocked && isStaffRole(dbRole) && (
          <button
            type="button"
            onClick={onSignOutStaff}
            className="rounded border border-slate-600 px-1.5 py-1 text-[10px] text-slate-400 hover:text-slate-200 sm:px-2 sm:py-2 sm:text-xs"
            title="Clear staff session on this device"
          >
            Sign out
          </button>
        )}
        <button
          type="button"
          onClick={onOpenProfile}
          className="rounded bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-sky-500 sm:rounded-md sm:px-3 sm:py-2 sm:text-xs"
        >
          Profile
        </button>
        <button
          type="button"
          onClick={onSwitchUser}
          className="rounded border border-slate-600 px-1.5 py-1 text-[10px] text-slate-400 hover:text-slate-200 sm:px-2 sm:py-2 sm:text-xs"
        >
          Switch
        </button>
      </div>
    </div>
  );
}
