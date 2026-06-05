"use client";

import { useEffect, useState } from "react";
import {
  ALREADY_ASSIGNED_MSG,
  MEMBERS,
  SKILLS,
  type Member,
  type Skill,
} from "@/lib/constants";
import {
  applyTimeToDate,
  formatDateTimeLabel,
  formatTimeLabel,
  getEffectiveStatus,
  timeInputValue,
} from "@/lib/trial-schedule";
import type { TrialSignup } from "@/lib/types";
import { formatDayLabel } from "@/lib/weeks";
import { SkillIcon } from "./SkillIcon";
import { StatusBadge } from "./StatusBadge";
import { LastEditedNote } from "./LastEditedNote";

export interface CellTarget {
  skill: Skill;
  plannedDate: string;
  /** 0–1 position within the day column when clicked on timeline */
  dayFraction?: number;
  plannedStartAt?: string;
}

export function CellAssignmentModal({
  open,
  target,
  signups,
  currentUser,
  editingSignup,
  canEditSignup,
  canAssignOthers,
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
  canEditSignup: (member: Member) => boolean;
  canAssignOthers: boolean;
  onClose: () => void;
  onSave: (
    member: Member,
    skill: Skill,
    plannedDate: string,
    plannedStartAt: string,
  ) => Promise<string | null>;
  onDelete: (signup: TrialSignup) => Promise<string | null>;
  saving: boolean;
}) {
  const [skill, setSkill] = useState<Skill>("Farming");
  const [member, setMember] = useState<Member | "">("");
  const [plannedDate, setPlannedDate] = useState("");
  const [timeValue, setTimeValue] = useState("08:00");

  useEffect(() => {
    if (!open || !target) return;
    setSkill(target.skill);
    setPlannedDate(target.plannedDate);
    if (editingSignup) {
      setMember(editingSignup.member_name);
      setPlannedDate(editingSignup.planned_date);
      setTimeValue(timeInputValue(editingSignup.planned_start_at));
    } else {
      setMember(currentUser || "");
      if (target.plannedStartAt) {
        setTimeValue(timeInputValue(target.plannedStartAt));
      } else if (target.dayFraction != null) {
        const totalMin = Math.floor(target.dayFraction * 24 * 60);
        const h = String(Math.floor(totalMin / 60)).padStart(2, "0");
        const m = String(totalMin % 60).padStart(2, "0");
        setTimeValue(`${h}:${m}`);
      } else {
        setTimeValue("08:00");
      }
    }
  }, [open, target, editingSignup, currentUser]);

  if (!open || !target) return null;

  const plannedStartAt = applyTimeToDate(plannedDate, timeValue);
  const previewStatus = getEffectiveStatus({
    id: 0,
    week_start: "",
    member_name: (member || currentUser || "Blowarium") as Member,
    skill,
    planned_date: plannedDate,
    planned_start_at: plannedStartAt,
    status: "planned",
    last_edited_by: null,
    created_at: "",
    updated_at: "",
  });

  const canEditThis = !!member && canEditSignup(member as Member);
  const memberSelectDisabled = !!editingSignup || (!canAssignOthers && !!currentUser);

  const existingForMember = member
    ? signups.find((s) => s.member_name === member)
    : undefined;
  const isMove =
    existingForMember &&
    !editingSignup &&
    (existingForMember.skill !== skill ||
      existingForMember.planned_date !== plannedDate ||
      existingForMember.planned_start_at !== plannedStartAt);

  async function handleSave() {
    if (!member || !canEditThis) return;
    if (
      isMove &&
      member === currentUser &&
      !confirm(
        `Move your assignment from ${existingForMember!.skill} (${formatDayLabel(existingForMember!.planned_date, true)} ${formatTimeLabel(existingForMember!.planned_start_at)})?`,
      )
    ) {
      return;
    }
    const err = await onSave(member, skill, plannedDate, plannedStartAt);
    if (!err) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-600 bg-[#131f36] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cell-modal-title"
      >
        <h2 id="cell-modal-title" className="text-lg font-semibold text-white">
          {editingSignup ? "Edit trial assignment" : "Schedule trial"}
        </h2>
        <p className="text-sm text-slate-400">
          {formatDayLabel(plannedDate)} · {formatDateTimeLabel(plannedStartAt)}
        </p>

        <div className="mt-4">
          <span className="text-xs text-slate-400">Skill</span>
          <div className="mt-1.5 flex gap-1 overflow-x-auto pb-1">
            {SKILLS.map((sk) => (
              <button
                key={sk}
                type="button"
                onClick={() => setSkill(sk)}
                title={sk}
                className={`flex shrink-0 flex-col items-center gap-0.5 rounded-lg border px-1.5 py-1 transition ${
                  skill === sk
                    ? "border-sky-500 bg-sky-950/50 ring-1 ring-sky-500/50"
                    : "border-slate-700 bg-slate-900/50 hover:border-slate-500"
                }`}
              >
                <SkillIcon skill={sk} size="sm" />
                <span className="max-w-[52px] truncate text-[8px] text-slate-300">{sk}</span>
              </button>
            ))}
          </div>
        </div>

        {editingSignup && !canEditThis && (
          <p className="mt-3 text-xs text-amber-300">
            You can only edit your own signup unless you are Guild Leader or Officer.
          </p>
        )}

        {isMove && (
          <p className="mt-3 rounded-lg bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
            {member === currentUser
              ? `${ALREADY_ASSIGNED_MSG} Saving will move you from ${existingForMember!.skill}.`
              : `${member} already has a trial this week — saving will move them.`}
          </p>
        )}

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs text-slate-400">Member</span>
            <select
              value={member}
              onChange={(e) => setMember(e.target.value as Member | "")}
              disabled={memberSelectDisabled}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              <option value="">Select member…</option>
              {(canAssignOthers ? MEMBERS : currentUser ? [currentUser] : []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-400">Day</span>
              <input
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                disabled={!member || !canEditThis}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Start time</span>
              <input
                type="time"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                disabled={!member || !canEditThis}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
              />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2">
            <span className="text-xs text-slate-400">Status (from schedule)</span>
            <StatusBadge status={previewStatus} />
          </div>
          <p className="text-[10px] text-slate-500">
            Trials run 24h from start time. Status becomes Active at start and Completed when the
            window ends.
          </p>
        </div>

        {editingSignup && (
          <div className="mt-2">
            <LastEditedNote by={editingSignup.last_edited_by} at={editingSignup.updated_at} />
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !member || !canEditThis}
            className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : editingSignup ? "Update" : "Save"}
          </button>
          {editingSignup && canEditThis && (
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
