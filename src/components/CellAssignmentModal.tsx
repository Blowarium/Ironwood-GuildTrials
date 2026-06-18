"use client";

import { useState } from "react";
import {
  ALREADY_ASSIGNED_MSG,
  SKILLS,
  type Member,
  type Skill,
} from "@/lib/constants";
import {
  applyDisplayTimeToDate,
  buildStartAt,
  dateFromStartAt,
  defaultStartAtForDate,
  displayDateInputValue,
  displayTimeInputValue,
  formatDateTimeLabel,
  formatTimeLabel,
  getEffectiveStatus,
  snapStartAtToWholeHour,
} from "@/lib/trial-schedule";
import { formatDisplayTimeZoneShort } from "@/lib/guild-timezone";
import { useDebouncedAutoSave } from "@/lib/use-auto-save";
import type { TrialSignup } from "@/lib/types";
import { formatDayLabel } from "@/lib/weeks";
import { SkillIcon } from "./SkillIcon";
import { StatusBadge } from "./StatusBadge";
import { LastEditedNote } from "./LastEditedNote";
import { AutoSaveIndicator } from "./AutoSaveIndicator";

const GUILD_HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, "0")}:00`;
  return { value, label: value };
});

export interface CellTarget {
  skill: Skill;
  plannedDate: string;
  /** 0–1 position within the day column when clicked on timeline */
  dayFraction?: number;
  plannedStartAt?: string;
  /** Prefill member when opening from a smart suggestion */
  member?: Member;
}

function initialLocalSchedule(
  target: CellTarget,
  editingSignup: TrialSignup | null,
  plannedDate: string,
): { localDate: string; timeValue: string } {
  let startIso: string;
  if (editingSignup) {
    startIso = editingSignup.planned_start_at;
  } else if (target.plannedStartAt) {
    startIso = target.plannedStartAt;
  } else if (target.dayFraction != null) {
    const h = Math.min(23, Math.floor(target.dayFraction * 24));
    startIso = buildStartAt(plannedDate, h, 0);
  } else {
    startIso = defaultStartAtForDate(plannedDate);
  }
  return {
    localDate: displayDateInputValue(startIso),
    timeValue: displayTimeInputValue(startIso),
  };
}

function CellAssignmentForm({
  target,
  signups,
  members,
  currentUser,
  editingSignup,
  canEditSignup,
  canAssignOthers,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  target: CellTarget;
  signups: TrialSignup[];
  members: Member[];
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
  const [skill, setSkill] = useState<Skill>(target.skill);
  const [member, setMember] = useState<Member | "">(
    editingSignup?.member_name ?? target.member ?? currentUser ?? "",
  );
  const initialSchedule = initialLocalSchedule(
    target,
    editingSignup,
    editingSignup?.planned_date ?? target.plannedDate,
  );
  const [localDate, setLocalDate] = useState(initialSchedule.localDate);
  const [timeValue, setTimeValue] = useState(initialSchedule.timeValue);

  const plannedStartAt = snapStartAtToWholeHour(applyDisplayTimeToDate(localDate, timeValue));
  const plannedDate = dateFromStartAt(plannedStartAt);

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

  const isNew = !editingSignup;
  const canEditThis = !!member && canEditSignup(member as Member);
  const memberSelectDisabled = !!editingSignup || (!canAssignOthers && !!currentUser);

  const existingForMember = member
    ? signups.find((s) => s.member_name === member)
    : undefined;
  const isMove =
    existingForMember &&
    isNew &&
    (existingForMember.skill !== skill ||
      existingForMember.planned_date !== plannedDate ||
      existingForMember.planned_start_at !== plannedStartAt);

  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function persistAssignment(): Promise<string | null> {
    if (!member || !canEditThis) return "Select a member you can schedule for.";
    if (
      isMove &&
      member === currentUser &&
      !confirm(
        `Move your assignment from ${existingForMember!.skill} (${formatDayLabel(existingForMember!.planned_date, true)} ${formatTimeLabel(existingForMember!.planned_start_at)})?`,
      )
    ) {
      return null;
    }
    return onSave(member as Member, skill, plannedDate, plannedStartAt);
  }

  const autoSave = useDebouncedAutoSave({
    enabled: !isNew && !!member && canEditThis,
    deps: [member, skill, localDate, timeValue],
    save: persistAssignment,
  });

  async function handleConfirm() {
    setConfirmError(null);
    setConfirming(true);
    const err = await persistAssignment();
    setConfirming(false);
    if (err) {
      setConfirmError(err);
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-600 bg-[#131f36] p-4 shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cell-modal-title"
      >
        <h2 id="cell-modal-title" className="text-lg font-semibold text-white">
          {editingSignup ? "Edit trial assignment" : "Schedule trial"}
        </h2>
        <p className="text-sm text-slate-400">{formatDateTimeLabel(plannedStartAt)}</p>
        {isNew && (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
            Not on the planner yet. Review the details below, then add to the planner to confirm.
          </p>
        )}

        <div className="mt-4">
          <span className="text-xs text-slate-400">Skill</span>
          <div className="mt-1.5 flex flex-wrap gap-1 pb-1">
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
              ? `${ALREADY_ASSIGNED_MSG} Changes will move you from ${existingForMember!.skill}.`
              : `${member} already has a trial this week — changes will move them.`}
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
              {(canAssignOthers ? members : currentUser ? [currentUser] : []).map((m) => (
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
                value={localDate}
                onChange={(e) => setLocalDate(e.target.value)}
                disabled={!member || !canEditThis}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">
                Start hour ({formatDisplayTimeZoneShort()})
              </span>
              <select
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                disabled={!member || !canEditThis}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
              >
                {GUILD_HOUR_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2">
            <span className="text-xs text-slate-400">
              {isNew ? "After you confirm" : "Status (from schedule)"}
            </span>
            {isNew ? (
              <span className="inline-block rounded bg-slate-700/80 px-2 py-0.5 text-xs font-medium text-slate-300">
                Not scheduled
              </span>
            ) : (
              <StatusBadge status={previewStatus} />
            )}
          </div>
          <p className="text-[10px] text-slate-500">
            {isNew
              ? "Trials run 24h from start on the hour (:00). Nothing is saved until you add to the planner."
              : "Trials run 24h from start time on the hour (:00). Status becomes Active at start and Completed when the window ends. Times shown in your timezone; week grid and game sync use guild time (UTC+2)."}
          </p>
        </div>

        {editingSignup && (
          <div className="mt-2">
            <LastEditedNote by={editingSignup.last_edited_by} at={editingSignup.updated_at} />
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {isNew ? (
            <>
              {confirmError && (
                <span className="w-full text-xs text-red-300">{confirmError}</span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!member || !canEditThis || saving || confirming}
                className="ml-auto rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirming || saving ? "Adding…" : "Add to planner"}
              </button>
            </>
          ) : (
            <>
              <AutoSaveIndicator status={autoSave.status} error={autoSave.error} />
              {canEditThis && (
                <button
                  type="button"
                  onClick={async () => {
                    const err = await onDelete(editingSignup!);
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
                className="ml-auto rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-400"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function CellAssignmentModal({
  open,
  target,
  signups,
  members,
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
  members: Member[];
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
  if (!open || !target) return null;

  const formKey = `${target.skill}|${target.plannedDate}|${target.plannedStartAt ?? ""}|${target.dayFraction ?? ""}|${target.member ?? ""}|${editingSignup?.id ?? "new"}`;

  return (
    <CellAssignmentForm
      key={formKey}
      target={target}
      signups={signups}
      members={members}
      currentUser={currentUser}
      editingSignup={editingSignup}
      canEditSignup={canEditSignup}
      canAssignOthers={canAssignOthers}
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
      saving={saving}
    />
  );
}
