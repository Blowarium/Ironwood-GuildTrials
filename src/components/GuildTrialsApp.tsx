"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MEMBER_STORAGE_KEY, type Member, type Skill, type TrialStatus } from "@/lib/constants";
import {
  deleteSignup,
  fetchAllPreferences,
  fetchGuildConfig,
  fetchWeekData,
  patchSignupStatus,
  saveSignup,
  setSkillWeekComplete,
} from "@/lib/api-client";
import type { GuildConfig } from "@/lib/guild-config";
import { buildPreferencesMap, type MemberPreferences } from "@/lib/preferences";
import type { ScheduleSuggestion } from "@/lib/schedule-optimizer";
import { isGuideDismissed, setGuideDismissed } from "@/lib/guide-storage";
import { computeGuildStats } from "@/lib/stats";
import type { SkillWeekCompletion, TrialSignup } from "@/lib/types";
import {
  formatWeekRange,
  formatWeekTabLabel,
  getWeekDays,
  getWeekStart,
  TRIAL_WINDOW_NOTE,
} from "@/lib/weeks";
import { CellAssignmentModal, type CellTarget } from "./CellAssignmentModal";
import { DayDragBoard } from "./DayDragBoard";
import { GameIcon } from "./GameIcon";
import { GuildSummary } from "./GuildSummary";
import { MemberIdentityBar } from "./MemberIdentityBar";
import { MemberView } from "./MemberView";
import { SkillCoverageList } from "./SkillCoverageList";
import { SuggestionsView } from "./SuggestionsView";
import { TrialPlannerGrid } from "./TrialPlannerGrid";
import { WelcomeGuideModal } from "./WelcomeGuideModal";

type ViewTab = "planner" | "board" | "members" | "suggestions";

export function GuildTrialsApp() {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => getWeekStart(new Date(), weekOffset), [weekOffset]);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

  const [currentUser, setCurrentUser] = useState<Member | "">("");
  const [view, setView] = useState<ViewTab>("planner");
  const [signups, setSignups] = useState<TrialSignup[]>([]);
  const [completions, setCompletions] = useState<SkillWeekCompletion[]>([]);
  const [preferenceRows, setPreferenceRows] = useState<MemberPreferences[]>([]);
  const [guildConfig, setGuildConfig] = useState<GuildConfig | null>(null);
  const [mode, setMode] = useState<"dev" | "database" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingSkill, setTogglingSkill] = useState<Skill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalTarget, setModalTarget] = useState<CellTarget | null>(null);
  const [editingSignup, setEditingSignup] = useState<TrialSignup | null>(null);
  const [dragSignup, setDragSignup] = useState<TrialSignup | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const preferencesMap = useMemo(
    () => buildPreferencesMap(preferenceRows),
    [preferenceRows],
  );

  const stats = useMemo(
    () => computeGuildStats(signups, completions),
    [signups, completions],
  );

  const currentUserPrefs = currentUser ? preferencesMap.get(currentUser) ?? null : null;

  const signupsByDay = useMemo(() => {
    const map = new Map<string, TrialSignup[]>();
    for (const d of weekDays) map.set(d, []);
    for (const s of signups) {
      map.get(s.planned_date)?.push(s);
    }
    return map;
  }, [signups, weekDays]);

  useEffect(() => {
    const saved = localStorage.getItem(MEMBER_STORAGE_KEY);
    if (saved) setCurrentUser(saved as Member);
    if (!isGuideDismissed()) setGuideOpen(true);
  }, []);

  function handleGuideClose(dontShowAgain: boolean) {
    if (dontShowAgain) setGuideDismissed(true);
    setGuideOpen(false);
  }

  useEffect(() => {
    if (currentUser) localStorage.setItem(MEMBER_STORAGE_KEY, currentUser);
  }, [currentUser]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWeekData(weekStart);
      setSignups(data.signups);
      setCompletions(data.completions);
      setMode(data.mode);
    } catch {
      setError("Could not load signups. Check your connection or database setup.");
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  const loadPreferences = useCallback(async () => {
    try {
      const data = await fetchAllPreferences();
      setPreferenceRows(data.preferences);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadGuildConfig = useCallback(async () => {
    try {
      const data = await fetchGuildConfig();
      setGuildConfig(data.config);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadPreferences();
    loadGuildConfig();
  }, [loadPreferences, loadGuildConfig]);

  async function assignToCell(
    member: Member,
    skill: Skill,
    plannedDate: string,
    status: TrialStatus,
  ): Promise<string | null> {
    setSaving(true);
    setError(null);
    const { signup, error: err } = await saveSignup({
      weekStart,
      memberName: member,
      skill,
      plannedDate,
      status,
    });
    setSaving(false);
    if (err) {
      setError(err);
      return err;
    }
    if (signup) {
      setSignups((prev) => {
        const filtered = prev.filter((s) => s.member_name !== member);
        return [...filtered, signup].sort(
          (a, b) =>
            a.skill.localeCompare(b.skill) || a.planned_date.localeCompare(b.planned_date),
        );
      });
    }
    await load();
    return null;
  }

  async function handleDropOnCell(target: CellTarget) {
    const signup = dragSignup;
    if (!signup) return;
    setDragSignup(null);
    if (signup.skill === target.skill && signup.planned_date === target.plannedDate) return;
    await assignToCell(
      signup.member_name,
      target.skill,
      target.plannedDate,
      signup.status,
    );
  }

  async function handleDropOnDay(day: string, signup: TrialSignup) {
    if (signup.planned_date === day) return;
    await assignToCell(signup.member_name, signup.skill as Skill, day, signup.status);
  }

  async function handleToggleSkillComplete(skill: Skill, completed: boolean) {
    if (!currentUser) {
      setError("Select your name first to mark skills complete.");
      return;
    }
    setTogglingSkill(skill);
    setError(null);
    const { completion, error: err } = await setSkillWeekComplete({
      weekStart,
      skill,
      completed,
      markedBy: currentUser,
    });
    setTogglingSkill(null);
    if (err) {
      setError(err);
      return;
    }
    setCompletions((prev) => {
      const filtered = prev.filter((c) => c.skill !== skill);
      return completion ? [...filtered, completion] : filtered;
    });
  }

  function openCell(target: CellTarget) {
    setEditingSignup(null);
    setModalTarget(target);
  }

  function openSignup(s: TrialSignup) {
    setEditingSignup(s);
    setModalTarget({ skill: s.skill as Skill, plannedDate: s.planned_date });
  }

  function closeModal() {
    setModalTarget(null);
    setEditingSignup(null);
  }

  async function applySuggestion(s: ScheduleSuggestion) {
    await assignToCell(s.member, s.skill, s.plannedDate, "planned");
  }

  async function applySuggestionsBatch(items: ScheduleSuggestion[]) {
    setSaving(true);
    setError(null);
    for (const s of items) {
      const err = await saveSignup({
        weekStart,
        memberName: s.member,
        skill: s.skill,
        plannedDate: s.plannedDate,
        status: "planned",
      });
      if (err.error) {
        setError(err.error);
        break;
      }
    }
    setSaving(false);
    await load();
  }

  return (
    <div className="min-h-screen bg-[#0c1424] text-slate-100">
      <header className="border-b border-slate-700/60 bg-[#111d33]/90 backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <GameIcon size={40} className="shrink-0" />
            <div className="shrink-0">
              <p className="text-[10px] font-medium uppercase tracking-widest text-sky-400/90">
                Ironwood RPG
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold leading-tight text-white">
                  Guild Trials — Weekly Planner
                </h1>
                <button
                  type="button"
                  onClick={() => setGuideOpen(true)}
                  className="rounded-md border border-slate-600 bg-slate-800/80 px-2 py-0.5 text-xs font-medium text-sky-300 hover:bg-slate-700 hover:text-sky-200"
                  title="Open setup and weekly guide"
                >
                  Guide
                </button>
              </div>
              <p className="text-xs text-slate-500">{TRIAL_WINDOW_NOTE}</p>
            </div>
            <MemberIdentityBar
              currentUser={currentUser}
              onUserChange={setCurrentUser}
              preferences={currentUserPrefs}
              onPreferencesSaved={(prefs) => {
                setPreferenceRows((prev) => {
                  const next = prev.filter((p) => p.member_name !== prefs.member_name);
                  return [...next, prefs].sort((a, b) =>
                    a.member_name.localeCompare(b.member_name),
                  );
                });
              }}
            />
          </div>
        </div>
      </header>

      {mode === "dev" && (
        <div className="border-b border-amber-500/30 bg-amber-950/40 px-4 py-2 text-center text-sm text-amber-200">
          Dev mode — data is in memory only. Set{" "}
          <code className="rounded bg-black/30 px-1">DATABASE_URL</code> for production.
        </div>
      )}

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">{formatWeekRange(weekStart)}</p>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2].map((offset) => {
              const start = getWeekStart(new Date(), offset);
              return (
                <button
                  key={offset}
                  type="button"
                  onClick={() => setWeekOffset(offset)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    weekOffset === offset
                      ? "bg-sky-600 text-white shadow-lg shadow-sky-900/40"
                      : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {formatWeekTabLabel(start)}
                </button>
              );
            })}
          </div>
        </div>

        <GuildSummary stats={stats} />

        {error && (
          <p className="rounded-lg bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/50 pb-2">
          {(
            [
              ["planner", "Weekly planner"],
              ["board", "Drag & drop"],
              ["members", "Members"],
              ["suggestions", "Smart suggestions"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                view === id ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="text-sm text-slate-400 hover:text-sky-300"
            >
              How to use
            </button>
            <button
              type="button"
              onClick={() => {
                load();
                loadPreferences();
                loadGuildConfig();
              }}
              className="text-sm text-sky-400 hover:text-sky-300"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p className="py-16 text-center text-slate-400">Loading…</p>
        ) : view === "suggestions" ? (
          <SuggestionsView
            signups={signups}
            preferenceRows={preferenceRows}
            weekDays={weekDays}
            guildConfig={guildConfig}
            onGuildConfigSaved={setGuildConfig}
            currentUser={currentUser}
            saving={saving}
            onApplySuggestion={applySuggestion}
            onApplyAllUnassigned={applySuggestionsBatch}
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
            <div>
              {view === "planner" && (
                <>
                  <p className="mb-2 text-xs text-slate-500">
                    Click + or Add to join a slot · click a name to edit · drag to move
                  </p>
                  <TrialPlannerGrid
                    weekDays={weekDays}
                    signups={signups}
                    currentUser={currentUser}
                    skillCoverage={stats.skillCoverage}
                    togglingSkill={togglingSkill}
                    onToggleSkillComplete={handleToggleSkillComplete}
                    onCellClick={openCell}
                    onSignupClick={openSignup}
                    onDragStart={setDragSignup}
                    onDrop={handleDropOnCell}
                  />
                </>
              )}
              {view === "board" && (
                <>
                  <p className="mb-2 text-xs text-slate-500">
                    Drag trials between days to reschedule
                  </p>
                  <DayDragBoard
                    weekDays={weekDays}
                    signupsByDay={signupsByDay}
                    currentUser={currentUser}
                    onDropOnDay={handleDropOnDay}
                    onCardClick={(target, signup) => openSignup(signup)}
                  />
                </>
              )}
              {view === "members" && (
                <MemberView
                  signups={signups}
                  currentUser={currentUser}
                  onSelectSignup={openSignup}
                />
              )}
            </div>
            <SkillCoverageList
              stats={stats}
              currentUser={currentUser}
              togglingSkill={togglingSkill}
              onToggleComplete={handleToggleSkillComplete}
            />
          </div>
        )}
      </main>

      <WelcomeGuideModal open={guideOpen} onClose={handleGuideClose} />

      <CellAssignmentModal
        open={!!modalTarget}
        target={modalTarget}
        signups={signups}
        currentUser={currentUser}
        editingSignup={editingSignup}
        saving={saving}
        onClose={closeModal}
        onSave={async (member, status) => {
          if (!modalTarget) return "No cell selected.";
          const existing = signups.find((s) => s.member_name === member);
          if (
            existing &&
            existing.skill === modalTarget.skill &&
            existing.planned_date === modalTarget.plannedDate &&
            existing.status === status &&
            editingSignup?.id === existing.id
          ) {
            return null;
          }
          if (
            existing &&
            existing.skill === modalTarget.skill &&
            existing.planned_date === modalTarget.plannedDate &&
            existing.status !== status
          ) {
            const { error: err } = await patchSignupStatus(existing.id, member, status);
            if (err) return err;
            await load();
            return null;
          }
          return assignToCell(member, modalTarget.skill, modalTarget.plannedDate, status);
        }}
        onDelete={async (signup) => {
          if (signup.member_name !== currentUser && currentUser) {
            return "You can only clear your own signup.";
          }
          setSaving(true);
          const { error: err } = await deleteSignup(signup.id, signup.member_name);
          setSaving(false);
          if (err) {
            setError(err);
            return err;
          }
          await load();
          return null;
        }}
      />
    </div>
  );
}
