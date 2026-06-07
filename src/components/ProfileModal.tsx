"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SKILLS, type Member, type Skill } from "@/lib/constants";
import {
  compareSkillsByPreferenceRank,
  emptyProfile,
  normalizeProfile,
  type MemberProfile,
  type MemberSkillProfileRow,
} from "@/lib/member-profile";
import { saveMemberProfile } from "@/lib/api-client";
import { canEditProfileFor } from "@/lib/permissions";
import type { RolesMap } from "@/lib/roles";
import { SkillIcon } from "./SkillIcon";
import { LastEditedNote } from "./LastEditedNote";
import { IronwoodXpImportGuide } from "./IronwoodXpImportGuide";
import { IronwoodXpImportReport } from "./IronwoodXpImportReport";
import {
  applyXpImportToRows,
  buildIronwoodActionPlanFromRows,
  type IronwoodXpImportPayload,
} from "@/lib/ironwood-xp-import";
import {
  formatCatalogActionLabel,
  getCatalogActions,
  resolveProfileActionId,
} from "@/lib/ironwood-action-catalog";
import { useDebouncedAutoSave } from "@/lib/use-auto-save";
import { AutoSaveIndicator } from "./AutoSaveIndicator";

function sortForDisplay(rows: MemberSkillProfileRow[]): MemberSkillProfileRow[] {
  return [...rows].sort(compareSkillsByPreferenceRank);
}

export function ProfileModal({
  open,
  onClose,
  currentUser,
  targetMember,
  initialProfile,
  rolesMap,
  staffUnlocked,
  onSaved,
  pendingXpImport,
  onXpImportApplied,
}: {
  open: boolean;
  onClose: () => void;
  currentUser: Member;
  targetMember: Member;
  initialProfile: MemberProfile | null;
  rolesMap: RolesMap;
  staffUnlocked: boolean;
  onSaved: (profile: MemberProfile) => void;
  pendingXpImport: IronwoodXpImportPayload | null;
  onXpImportApplied: () => void;
}) {
  const [skills, setSkills] = useState<MemberSkillProfileRow[]>(emptyProfile(targetMember).skills);
  const [message, setMessage] = useState<string | null>(null);
  const [dragSkill, setDragSkill] = useState<Skill | null>(null);
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [lastImportReport, setLastImportReport] = useState<IronwoodXpImportPayload | null>(
    null,
  );
  const skipProfileResetRef = useRef(false);

  const canEdit = canEditProfileFor(currentUser, targetMember, rolesMap, staffUnlocked);
  const isSelf = currentUser === targetMember;

  useEffect(() => {
    if (!open) {
      skipProfileResetRef.current = false;
      return;
    }
    if (skipProfileResetRef.current) return;

    const base = initialProfile ?? emptyProfile(targetMember);
    setSkills(normalizeProfile(base).skills);
    setMessage(null);
    setShowImportGuide(false);
    setLastImportReport(null);
  }, [open, initialProfile, targetMember]);

  async function saveSkills(rows: MemberSkillProfileRow[]): Promise<string | null> {
    const { profile, error: err } = await saveMemberProfile({
      actorMember: currentUser,
      memberName: targetMember,
      skills: rows.map((s) => ({
        skill: s.skill,
        xpPerHour: s.xp_per_hour,
        preferenceRank: s.preference_rank,
        ironwoodActionId: resolveProfileActionId(s.skill, s.ironwood_action_id),
        skillLocked: s.skill_locked,
      })),
    });
    if (err) return err;
    if (profile) onSaved(profile);
    return null;
  }

  const skillsKey = JSON.stringify(skills);
  const autoSave = useDebouncedAutoSave({
    enabled: open && canEdit,
    deps: [skillsKey],
    save: () => saveSkills(skills),
  });

  useEffect(() => {
    if (!open || !pendingXpImport) return;

    skipProfileResetRef.current = true;
    const base = initialProfile ?? emptyProfile(targetMember);
    const importedSkills = applyXpImportToRows(
      normalizeProfile(base).skills,
      pendingXpImport,
    );
    setSkills(importedSkills);
    const count = Object.keys(pendingXpImport.skills).length;
    const errCount = pendingXpImport.errors
      ? Object.keys(pendingXpImport.errors).length
      : 0;
    setShowImportGuide(true);
    setLastImportReport(pendingXpImport);
    onXpImportApplied();

    if (!canEdit) {
      setMessage(
        errCount > 0
          ? `Imported XP/h for ${count} skills from Ironwood (${errCount} skipped).`
          : `Imported XP/h for ${count} skills from Ironwood.`,
      );
      return;
    }

    void (async () => {
      setMessage("Saving imported XP/h…");
      const err = await saveSkills(importedSkills);
      if (!err) {
        setMessage(
          errCount > 0
            ? `Imported and saved XP/h for ${count} skills from Ironwood (${errCount} skipped).`
            : `Imported and saved XP/h for ${count} skills from Ironwood.`,
        );
      } else {
        setMessage(
          errCount > 0
            ? `Imported XP/h for ${count} skills (${errCount} skipped) but could not save — changes will retry automatically.`
            : `Imported XP/h for ${count} skills but could not save — changes will retry automatically.`,
        );
      }
    })();
  }, [open, pendingXpImport, initialProfile, targetMember, onXpImportApplied, canEdit]);

  const displayRows = useMemo(() => sortForDisplay(skills), [skills]);

  function updateSkill(skill: Skill, patch: Partial<MemberSkillProfileRow>) {
    setSkills((prev) =>
      prev.map((row) => (row.skill === skill ? { ...row, ...patch } : row)),
    );
  }

  function handleRankInput(skill: Skill, value: string) {
    if (!value.trim()) {
      updateSkill(skill, { preference_rank: null });
      return;
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > SKILLS.length) return;
    setSkills((prev) => {
      const next = prev.map((r) => ({ ...r }));
      const row = next.find((r) => r.skill === skill)!;
      row.preference_rank = n;
      return next;
    });
  }

  function handleDrop(targetSkill: Skill) {
    if (!dragSkill || dragSkill === targetSkill) return;
    setSkills((prev) => {
      const next = prev.map((r) => ({ ...r }));
      const dragRow = next.find((r) => r.skill === dragSkill)!;
      const targetRow = next.find((r) => r.skill === targetSkill)!;
      const dragRank = dragRow.preference_rank;
      dragRow.preference_rank = targetRow.preference_rank;
      targetRow.preference_rank = dragRank;
      return next;
    });
    setDragSkill(null);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end justify-center bg-black/65 p-2 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[92vh] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-600 bg-[#131f36] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        <div className="shrink-0 border-b border-slate-700/60 px-4 py-3 sm:px-5">
          <h2 id="profile-modal-title" className="text-lg font-bold text-white">
            {isSelf ? "Your profile" : `${targetMember}'s profile`}
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Set XP/h for each skill, pick the Ironwood action used for XP estimates, rank your
            preferences (1 = highest; ties allowed), and lock out skills you never want assigned.
          </p>
          {initialProfile && (
            <LastEditedNote by={initialProfile.updated_by} at={initialProfile.updated_at} />
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowImportGuide((v) => !v)}
              className="mt-1 text-xs text-sky-400 hover:underline"
            >
              {showImportGuide ? "Hide import guide" : "Import XP/h from Ironwood RPG"}
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3 sm:px-5">
          {canEdit && showImportGuide && (
            <div className="mb-3">
              <IronwoodXpImportGuide
                returnUrl={
                  typeof window !== "undefined"
                    ? `${window.location.origin}${window.location.pathname}`
                    : ""
                }
                skillRows={skills}
              />
            </div>
          )}
          {lastImportReport && (
            <div className="mb-3">
              <IronwoodXpImportReport payload={lastImportReport} />
            </div>
          )}
          <div className="hidden grid-cols-[28px_minmax(0,1fr)_minmax(0,1.6fr)_100px_64px_40px] gap-x-2 text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:grid">
            <span />
            <span>Skill</span>
            <span>Ironwood action</span>
            <span>XP / hour</span>
            <span>Rank</span>
            <span title="Lock out of smart schedule">Lock</span>
          </div>
          <ul className="mt-1 space-y-2 sm:space-y-1">
            {displayRows.map((row) => (
              <li
                key={row.skill}
                draggable={canEdit && !row.skill_locked}
                onDragStart={() => setDragSkill(row.skill)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(row.skill)}
                className={`rounded-lg border px-3 py-3 sm:grid sm:grid-cols-[28px_minmax(0,1fr)_minmax(0,1.6fr)_100px_64px_40px] sm:items-center sm:gap-x-2 sm:px-2 sm:py-1.5 ${
                  row.skill_locked
                    ? "border-red-500/30 bg-red-950/20 opacity-80"
                    : dragSkill === row.skill
                      ? "border-sky-500/50 bg-sky-950/30"
                      : "border-slate-700/50 bg-slate-900/40"
                }`}
              >
                <div className="flex items-center gap-2 sm:contents">
                  <span
                    className={`cursor-grab text-slate-500 ${canEdit ? "" : "opacity-30"}`}
                    title="Drag to reorder priority"
                  >
                    ⋮⋮
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-slate-200 sm:flex-none">
                    <SkillIcon skill={row.skill} size="xs" />
                    <span className="truncate font-medium">{row.skill}</span>
                  </span>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      updateSkill(row.skill, { skill_locked: !row.skill_locked })
                    }
                    title={
                      row.skill_locked
                        ? "Locked — excluded from smart schedule suggestions"
                        : "Lock this skill out of smart schedule suggestions"
                    }
                    className={`rounded border px-2 py-1 text-xs sm:hidden disabled:opacity-50 ${
                      row.skill_locked
                        ? "border-red-500/50 bg-red-950/50 text-red-300"
                        : "border-slate-600 bg-slate-900 text-slate-500"
                    }`}
                    aria-pressed={row.skill_locked}
                  >
                    {row.skill_locked ? "🔒 Locked" : "○ Lock"}
                  </button>
                </div>
                <label className="mt-3 block sm:mt-0 sm:contents">
                  <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500 sm:hidden">
                    Ironwood action
                  </span>
                  <select
                    disabled={!canEdit}
                    value={
                      resolveProfileActionId(row.skill, row.ironwood_action_id) ?? ""
                    }
                    onChange={(e) =>
                      updateSkill(row.skill, {
                        ironwood_action_id: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    className="min-w-0 w-full rounded border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-white disabled:opacity-50 sm:px-1 sm:py-1 sm:text-[11px]"
                  >
                    {getCatalogActions(row.skill).map((action) => (
                      <option key={action.actionId} value={action.actionId}>
                        {formatCatalogActionLabel(action)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-0 sm:contents">
                  <label className="block sm:contents">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500 sm:hidden">
                      XP / hour
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={!canEdit}
                      placeholder="—"
                      value={row.xp_per_hour ? String(row.xp_per_hour) : ""}
                      onChange={(e) =>
                        updateSkill(row.skill, {
                          xp_per_hour: e.target.value.replace(/[^\d]/g, "")
                            ? Number(e.target.value.replace(/[^\d]/g, ""))
                            : null,
                        })
                      }
                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-white disabled:opacity-50 sm:py-1 sm:text-xs"
                    />
                  </label>
                  <label className="block sm:contents">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500 sm:hidden">
                      Rank
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={SKILLS.length}
                      disabled={!canEdit || row.skill_locked}
                      placeholder="—"
                      value={row.preference_rank ?? ""}
                      onChange={(e) => handleRankInput(row.skill, e.target.value)}
                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-white disabled:opacity-50 sm:px-1 sm:py-1 sm:text-xs"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    updateSkill(row.skill, { skill_locked: !row.skill_locked })
                  }
                  title={
                    row.skill_locked
                      ? "Locked — excluded from smart schedule suggestions"
                      : "Lock this skill out of smart schedule suggestions"
                  }
                  className={`hidden rounded border px-1 py-1 text-xs disabled:opacity-50 sm:block ${
                    row.skill_locked
                      ? "border-red-500/50 bg-red-950/50 text-red-300"
                      : "border-slate-600 bg-slate-900 text-slate-500 hover:border-slate-500 hover:text-slate-300"
                  }`}
                  aria-pressed={row.skill_locked}
                >
                  {row.skill_locked ? "🔒" : "○"}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="shrink-0 border-t border-slate-700/60 px-4 py-3 sm:px-5">
          {!canEdit && (
            <p className="mb-2 text-xs text-amber-300">
              Only {targetMember} or the Guild Leader can edit this profile.
            </p>
          )}
          {message && <p className="mb-2 text-xs text-emerald-300">{message}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && <AutoSaveIndicator status={autoSave.status} error={autoSave.error} />}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-400"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
