"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SKILLS, type Member, type Skill } from "@/lib/constants";
import {
  applyRankOrder,
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
import {
  applyXpImportToRows,
  type IronwoodXpImportPayload,
} from "@/lib/ironwood-xp-import";

function sortForDisplay(rows: MemberSkillProfileRow[]): MemberSkillProfileRow[] {
  return [...rows].sort((a, b) => {
    const ar = a.preference_rank ?? 999;
    const br = b.preference_rank ?? 999;
    if (ar !== br) return ar - br;
    return a.skill.localeCompare(b.skill);
  });
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragSkill, setDragSkill] = useState<Skill | null>(null);
  const [showImportGuide, setShowImportGuide] = useState(false);
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
    setError(null);
    setMessage(null);
    setShowImportGuide(false);
  }, [open, initialProfile, targetMember]);

  useEffect(() => {
    if (!open || !pendingXpImport) return;

    skipProfileResetRef.current = true;
    const base = initialProfile ?? emptyProfile(targetMember);
    setSkills(applyXpImportToRows(normalizeProfile(base).skills, pendingXpImport));
    const count = Object.keys(pendingXpImport.skills).length;
    const errCount = pendingXpImport.errors
      ? Object.keys(pendingXpImport.errors).length
      : 0;
    setMessage(
      errCount > 0
        ? `Imported XP/h for ${count} skills from Ironwood (${errCount} skipped). Review and save.`
        : `Imported XP/h for ${count} skills from Ironwood. Review and save.`,
    );
    setShowImportGuide(true);
    onXpImportApplied();
  }, [open, pendingXpImport, initialProfile, targetMember, onXpImportApplied]);

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
      const existing = next.find((r) => r.preference_rank === n && r.skill !== skill);
      if (existing) existing.preference_rank = null;
      const row = next.find((r) => r.skill === skill)!;
      row.preference_rank = n;
      return next;
    });
  }

  function handleDrop(targetSkill: Skill) {
    if (!dragSkill || dragSkill === targetSkill) return;
    const ranked = displayRows
      .filter((r) => r.preference_rank != null)
      .sort((a, b) => (a.preference_rank ?? 99) - (b.preference_rank ?? 99))
      .map((r) => r.skill);
    if (!ranked.includes(dragSkill)) ranked.push(dragSkill);
    const from = ranked.indexOf(dragSkill);
    const to = ranked.indexOf(targetSkill);
    if (from < 0 || to < 0) return;
    ranked.splice(from, 1);
    ranked.splice(to, 0, dragSkill);
    setSkills((prev) => applyRankOrder(prev, ranked));
    setDragSkill(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const { profile, error: err } = await saveMemberProfile({
      actorMember: currentUser,
      memberName: targetMember,
      skills: skills.map((s) => ({
        skill: s.skill,
        xpPerHour: s.xp_per_hour,
        preferenceRank: s.preference_rank,
      })),
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    if (profile) {
      onSaved(profile);
      setMessage("Profile saved.");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end justify-center bg-black/65 p-2 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl border border-slate-600 bg-[#131f36] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        <div className="border-b border-slate-700/60 px-4 py-3 sm:px-5">
          <h2 id="profile-modal-title" className="text-lg font-bold text-white">
            {isSelf ? "Your profile" : `${targetMember}'s profile`}
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Set XP/h for each skill and rank your preferences (1 = highest). Drag rows or type
            ranks.
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
          {canEdit && showImportGuide && (
            <div className="mt-2">
              <IronwoodXpImportGuide
                returnUrl={
                  typeof window !== "undefined"
                    ? `${window.location.origin}${window.location.pathname}`
                    : ""
                }
              />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <div className="grid grid-cols-[24px_1fr_88px_56px] gap-x-2 gap-y-1 text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:grid-cols-[28px_1fr_100px_64px]">
            <span />
            <span>Skill</span>
            <span>XP / hour</span>
            <span>Rank</span>
          </div>
          <ul className="mt-1 space-y-1">
            {displayRows.map((row) => (
              <li
                key={row.skill}
                draggable={canEdit}
                onDragStart={() => setDragSkill(row.skill)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(row.skill)}
                className={`grid grid-cols-[24px_1fr_88px_56px] items-center gap-x-2 rounded-lg border px-2 py-1.5 sm:grid-cols-[28px_1fr_100px_64px] ${
                  dragSkill === row.skill
                    ? "border-sky-500/50 bg-sky-950/30"
                    : "border-slate-700/50 bg-slate-900/40"
                }`}
              >
                <span
                  className={`cursor-grab text-slate-500 ${canEdit ? "" : "opacity-30"}`}
                  title="Drag to reorder priority"
                >
                  ⋮⋮
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-200">
                  <SkillIcon skill={row.skill} size="xs" />
                  <span className="truncate">{row.skill}</span>
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
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                />
                <input
                  type="number"
                  min={1}
                  max={SKILLS.length}
                  disabled={!canEdit}
                  placeholder="—"
                  value={row.preference_rank ?? ""}
                  onChange={(e) => handleRankInput(row.skill, e.target.value)}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-1 py-1 text-xs text-white disabled:opacity-50"
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-slate-700/60 px-4 py-3 sm:px-5">
          {!canEdit && (
            <p className="mb-2 text-xs text-amber-300">
              Only {targetMember} or the Guild Leader can edit this profile.
            </p>
          )}
          {error && <p className="mb-2 text-xs text-red-300">{error}</p>}
          {message && <p className="mb-2 text-xs text-emerald-300">{message}</p>}
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save profile"}
              </button>
            )}
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
