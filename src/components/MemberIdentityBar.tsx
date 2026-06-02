"use client";

import { useEffect, useState } from "react";
import { MEMBERS, SKILLS, type Member, type Skill } from "@/lib/constants";
import { emptyPreferences, validatePreferences, type MemberPreferences } from "@/lib/preferences";
import { saveMemberPreferences } from "@/lib/api-client";
import { SkillIcon } from "./SkillIcon";
import { XpPerHourGuidePanel } from "./XpPerHourGuide";

export function MemberIdentityBar({
  currentUser,
  onUserChange,
  preferences,
  onPreferencesSaved,
}: {
  currentUser: Member | "";
  onUserChange: (m: Member | "") => void;
  preferences: MemberPreferences | null;
  onPreferencesSaved: (prefs: MemberPreferences) => void;
}) {
  const [pref1, setPref1] = useState<Skill | "">("");
  const [pref2, setPref2] = useState<Skill | "">("");
  const [pref3, setPref3] = useState<Skill | "">("");
  const [xp1, setXp1] = useState("");
  const [xp2, setXp2] = useState("");
  const [xp3, setXp3] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [xpGuideOpen, setXpGuideOpen] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      setPref1("");
      setPref2("");
      setPref3("");
      setXp1("");
      setXp2("");
      setXp3("");
      return;
    }
    const p = preferences ?? emptyPreferences(currentUser);
    setPref1(p.pref_1 ?? "");
    setPref2(p.pref_2 ?? "");
    setPref3(p.pref_3 ?? "");
    setXp1(p.xp_pref_1 ? String(p.xp_pref_1) : "");
    setXp2(p.xp_pref_2 ? String(p.xp_pref_2) : "");
    setXp3(p.xp_pref_3 ? String(p.xp_pref_3) : "");
  }, [currentUser, preferences]);

  async function handleSavePrefs() {
    if (!currentUser) {
      setError("Select your name first.");
      return;
    }
    const err = validatePreferences(pref1, pref2, pref3, xp1, xp2, xp3);
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const { preferences: saved, error: saveErr } = await saveMemberPreferences({
      memberName: currentUser,
      pref1: pref1 || null,
      pref2: pref2 || null,
      pref3: pref3 || null,
      xp1: xp1 || null,
      xp2: xp2 || null,
      xp3: xp3 || null,
    });
    setSaving(false);
    if (saveErr) {
      setError(saveErr);
      return;
    }
    if (saved) {
      onPreferencesSaved(saved);
      setMessage("Saved.");
    }
  }

  const selectClass =
    "w-full min-w-0 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white";
  const inputClass =
    "w-full min-w-0 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white";

  const prefSlots = [
    ["1st", pref1, setPref1, xp1, setXp1, [pref2, pref3]] as const,
    ["2nd", pref2, setPref2, xp2, setXp2, [pref1, pref3]] as const,
    ["3rd", pref3, setPref3, xp3, setXp3, [pref1, pref2]] as const,
  ];

  return (
    <div className="flex-1 rounded-lg border border-slate-700/50 bg-[#131f36]/80 px-3 py-2">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <label className="shrink-0">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            You
          </span>
          <select
            value={currentUser}
            onChange={(e) => onUserChange(e.target.value as Member | "")}
            className="mt-0.5 block w-[140px] rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
          >
            <option value="">Select name…</option>
            {MEMBERS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        {prefSlots.map(([label, skill, setSkill, xp, setXp, others]) => (
          <div
            key={label}
            className="flex min-w-[130px] flex-1 items-end gap-1.5 sm:max-w-[200px]"
          >
            <label className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-500">{label}</span>
              <div className="mt-0.5 flex items-center gap-1">
                {skill ? <SkillIcon skill={skill} size="xs" /> : null}
                <select
                  value={skill}
                  onChange={(e) => setSkill(e.target.value as Skill | "")}
                  disabled={!currentUser}
                  className={selectClass}
                >
                  <option value="">Skill</option>
                  {SKILLS.filter((s) => s === skill || !others.includes(s)).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="w-[72px] shrink-0">
              <span className="text-[10px] text-slate-500">XP/h</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="—"
                value={xp}
                onChange={(e) => setXp(e.target.value.replace(/[^\d]/g, ""))}
                disabled={!currentUser || !skill}
                className={`${inputClass} mt-0.5`}
              />
            </label>
          </div>
        ))}

        <div className="flex shrink-0 flex-col items-stretch gap-1">
          <button
            type="button"
            onClick={handleSavePrefs}
            disabled={!currentUser || saving}
            className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 disabled:opacity-50"
          >
            {saving ? "…" : "Save prefs"}
          </button>
          <button
            type="button"
            onClick={() => setXpGuideOpen((o) => !o)}
            className="text-[10px] text-sky-400 hover:underline"
          >
            {xpGuideOpen ? "Hide XP/h guide" : "XP/h in game?"}
          </button>
        </div>
      </div>

      {xpGuideOpen && (
        <div className="mt-2 w-full">
          <XpPerHourGuidePanel />
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
      {message && <p className="mt-1 text-xs text-emerald-300">{message}</p>}
    </div>
  );
}
