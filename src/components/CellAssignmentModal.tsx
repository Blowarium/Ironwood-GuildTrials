"use client";

import { useEffect, useState } from "react";
import {
  ALREADY_ASSIGNED_MSG,
  MEMBERS,
  TRIAL_STATUSES,
  type Member,
  type Skill,
  type TrialStatus,
} from "@/lib/constants";
import { signupsInCell } from "@/lib/stats";
import type { TrialSignup } from "@/lib/types";
import { formatDayLabel } from "@/lib/weeks";
import { SkillIcon } from "./SkillIcon";
import { StatusBadge } from "./StatusBadge";

export interface CellTarget {
  skill: Skill;
  plannedDate: string;
}

export function CellAssignmentModal({
  open,
  target,
  signups,
  currentUser,
  editingSignup,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  open: boolean;
  target: CellTarget | null;
  signups: TrialSignup[];
  currentUser: Member | "";
  editingSignup: TrialSignup | null;
  onClose: () => void;
  onSave: (member: Member, status: TrialStatus) => Promise<string | null>;
  onDelete: (signup: TrialSignup) => Promise<string | null>;
  saving: boolean;
}) {
  const cellSignups = target ? signupsInCell(signups, target.skill, target.plannedDate) : [];

  const [member, setMember] = useState<Member | "">("");
  const [status, setStatus] = useState<TrialStatus>("planned");

  useEffect(() => {
    if (!open || !target) return;
    if (editingSignup) {
      setMember(editingSignup.member_name);
      setStatus(editingSignup.status);
    } else {
      setMember(currentUser || "");
      setStatus("planned");
    }
  }, [open, target, editingSignup, currentUser]);

  if (!open || !target) return null;

  const existingForMember = member
    ? signups.find((s) => s.member_name === member)
    : undefined;
  const isMove =
    existingForMember &&
    !editingSignup &&
    (existingForMember.skill !== target.skill ||
      existingForMember.planned_date !== target.plannedDate);
  const isEditingSame =
    editingSignup &&
    editingSignup.skill === target.skill &&
    editingSignup.planned_date === target.plannedDate;

  async function handleSave() {
    if (!member) return;
    if (isMove && member === currentUser && !confirm(
      `Move your assignment from ${existingForMember!.skill} (${formatDayLabel(existingForMember!.planned_date, true)}) to here?`,
    )) {
      return;
    }
    const err = await onSave(member, status);
    if (!err) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-600 bg-[#131f36] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cell-modal-title"
      >
        <div className="flex items-center gap-2">
          <SkillIcon skill={target.skill} size="lg" />
          <h2 id="cell-modal-title" className="text-lg font-semibold text-white">
            {target.skill}
          </h2>
        </div>
        <p className="text-sm text-slate-400">{formatDayLabel(target.plannedDate)}</p>
        <p className="mt-1 text-xs text-slate-500">
          Multiple members can run this trial on the same day.
        </p>

        {cellSignups.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-2">
            <p className="text-xs font-medium text-slate-400">
              In this slot ({cellSignups.length})
            </p>
            <ul className="mt-1 space-y-1">
              {cellSignups.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 text-sm text-slate-200"
                >
                  <span className="flex items-center gap-1.5">
                    <SkillIcon skill={target.skill} size="xs" />
                    {s.member_name}
                  </span>
                  <StatusBadge status={s.status} small />
                </li>
              ))}
            </ul>
          </div>
        )}

        <h3 className="mt-4 text-sm font-medium text-white">
          {editingSignup ? "Edit signup" : "Add or update signup"}
        </h3>

        {isMove && (
          <p className="mt-2 rounded-lg bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
            {member === currentUser
              ? `${ALREADY_ASSIGNED_MSG} Saving will move you from ${existingForMember!.skill} (${formatDayLabel(existingForMember!.planned_date, true)}).`
              : `${member} already has a trial this week — saving will move them.`}
          </p>
        )}

        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-xs text-slate-400">Member</span>
            <select
              value={member}
              onChange={(e) => setMember(e.target.value as Member | "")}
              disabled={!!editingSignup}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              <option value="">Select member…</option>
              {MEMBERS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Trial status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TrialStatus)}
              disabled={!member}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              {TRIAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !member}
            className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : isEditingSame ? "Update" : "Save"}
          </button>
          {editingSignup &&
            (editingSignup.member_name === currentUser || currentUser === member) && (
              <button
                type="button"
                onClick={async () => {
                  const err = await onDelete(editingSignup);
                  if (!err) onClose();
                }}
                disabled={saving}
                className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-300 hover:bg-red-950/40"
              >
                Remove
              </button>
            )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
