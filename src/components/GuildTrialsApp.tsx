"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MEMBER_STORAGE_KEY, type Member, type Skill } from "@/lib/constants";
import {
  deleteSignup,
  fetchGuildConfig,
  fetchMemberRoster,
  fetchMembersData,
  fetchWeekData,
  loginStaff,
  logoutStaff,
  saveSignup,
  setSkillWeekComplete,
} from "@/lib/api-client";
import type { GuildConfig } from "@/lib/guild-config";
import { isGuideDismissed, setGuideDismissed } from "@/lib/guide-storage";
import {
  buildProfilesMap,
  type MemberProfile,
  type MemberRosterEntry,
} from "@/lib/member-profile";
import {
  canDragSignup,
  canEditSignupFor,
  canManageRoles,
  effectiveRole,
  isStaffRole,
} from "@/lib/permissions";
import { hasLocalStaffAuth } from "@/lib/staff-auth-client";
import type { ScheduleSuggestion } from "@/lib/schedule-optimizer";
import { buildRolesMap, getMemberRole, type RolesMap } from "@/lib/roles";
import { computeSkillXpCoverage } from "@/lib/skill-xp-coverage";
import { syncSignups, buildStartAtFromWeekFraction, dateFromStartAt } from "@/lib/trial-schedule";
import { computeGuildStats } from "@/lib/stats";
import {
  readXpImportFromLocation,
  markXpImportHelperInstalled,
  type IronwoodXpImportPayload,
} from "@/lib/ironwood-xp-import";
import type { SkillWeekCompletion, TrialSignup } from "@/lib/types";
import {
  formatWeekRange,
  formatWeekTabLabel,
  getWeekDays,
  getWeekStart,
  TRIAL_WINDOW_NOTE,
} from "@/lib/weeks";
import { CellAssignmentModal, type CellTarget } from "./CellAssignmentModal";
import { GameIcon } from "./GameIcon";
import { GuildSummary } from "./GuildSummary";
import { MemberRosterView } from "./MemberRosterView";
import { MemberSelectModal } from "./MemberSelectModal";
import { MemberView } from "./MemberView";
import { ProfileHeaderBar } from "./ProfileHeaderBar";
import { ProfileModal } from "./ProfileModal";
import { SkillCoverageList } from "./SkillCoverageList";
import { GuildBuildingsView } from "./GuildBuildingsView";
import { SuggestionsView } from "./SuggestionsView";
import { WeeklyTimeline } from "./WeeklyTimeline";
import { StaffPasswordModal } from "./StaffPasswordModal";
import { WelcomeGuideModal } from "./WelcomeGuideModal";

type ViewTab = "planner" | "members" | "suggestions" | "buildings" | "roster";

export function GuildTrialsApp() {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => getWeekStart(new Date(), weekOffset), [weekOffset]);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

  const [currentUser, setCurrentUser] = useState<Member | "">("");
  const [memberSelectOpen, setMemberSelectOpen] = useState(false);
  const [identityReady, setIdentityReady] = useState(false);
  const [view, setView] = useState<ViewTab>("planner");
  const [signups, setSignups] = useState<TrialSignup[]>([]);
  const [completions, setCompletions] = useState<SkillWeekCompletion[]>([]);
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [rolesMap, setRolesMap] = useState<RolesMap>(() => buildRolesMap([]));
  const [roster, setRoster] = useState<MemberRosterEntry[]>([]);
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTarget, setProfileTarget] = useState<Member | "">("");
  const [staffAuthTick, setStaffAuthTick] = useState(0);
  const [staffPasswordOpen, setStaffPasswordOpen] = useState(false);
  const [pendingXpImport, setPendingXpImport] = useState<IronwoodXpImportPayload | null>(null);
  const [membersLoaded, setMembersLoaded] = useState(false);

  const profilesMap = useMemo(() => buildProfilesMap(profiles), [profiles]);
  const dbRole = currentUser ? getMemberRole(rolesMap, currentUser) : null;
  const staffUnlocked = useMemo(() => {
    if (!currentUser || !dbRole || !isStaffRole(dbRole)) return false;
    return hasLocalStaffAuth(currentUser, dbRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- staffAuthTick busts cache after login/logout
  }, [currentUser, dbRole, staffAuthTick]);
  const currentRole = useMemo(
    () => (currentUser ? effectiveRole(currentUser, rolesMap, staffUnlocked) : null),
    [currentUser, rolesMap, staffUnlocked],
  );
  const isStaff = isStaffRole(currentRole);
  const isLeader = canManageRoles(currentRole);

  const stats = useMemo(
    () => computeGuildStats(signups, completions),
    [signups, completions],
  );

  const hallLevel = guildConfig?.trial_hall_level ?? 0;
  const xpCoverage = useMemo(
    () => computeSkillXpCoverage(signups, profilesMap, hallLevel),
    [signups, profilesMap, hallLevel],
  );

  useEffect(() => {
    const saved = localStorage.getItem(MEMBER_STORAGE_KEY);
    if (saved) {
      setCurrentUser(saved as Member);
      setIdentityReady(true);
    } else {
      setMemberSelectOpen(true);
    }
  }, []);

  useEffect(() => {
    const payload = readXpImportFromLocation(window.location.search);
    if (!payload) return;
    setPendingXpImport(payload);
    markXpImportHelperInstalled();
    const url = new URL(window.location.href);
    url.searchParams.delete("xpImport");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, []);

  useEffect(() => {
    if (!pendingXpImport || !identityReady || !currentUser || !membersLoaded) return;
    openProfile(currentUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reopen profile when import arrives
  }, [pendingXpImport, identityReady, currentUser, membersLoaded]);

  useEffect(() => {
    if (identityReady && currentUser && !isGuideDismissed()) {
      setGuideOpen(true);
    }
  }, [identityReady, currentUser]);

  useEffect(() => {
    if (currentUser) localStorage.setItem(MEMBER_STORAGE_KEY, currentUser);
  }, [currentUser]);

  function handleMemberSelect(member: Member) {
    setCurrentUser(member);
    setMemberSelectOpen(false);
    setIdentityReady(true);
    const role = getMemberRole(rolesMap, member);
    if (isStaffRole(role) && !hasLocalStaffAuth(member, role)) {
      setStaffPasswordOpen(true);
    }
  }

  async function handleStaffUnlock(password: string): Promise<string | null> {
    if (!currentUser) return "Select your character first.";
    const { error } = await loginStaff(currentUser, password);
    if (error) return error;
    setStaffAuthTick((n) => n + 1);
    setStaffPasswordOpen(false);
    return null;
  }

  function handleStaffSignOut() {
    if (currentUser) logoutStaff(currentUser);
    setStaffAuthTick((n) => n + 1);
  }

  function handleGuideClose(dontShowAgain: boolean) {
    if (dontShowAgain) setGuideDismissed(true);
    setGuideOpen(false);
  }

  function openProfile(member: Member) {
    setProfileTarget(member);
    setProfileOpen(true);
  }

  const handleXpImportApplied = useCallback(() => {
    setPendingXpImport(null);
  }, []);

  const canEditSignup = useCallback(
    (target: Member) => {
      if (!currentUser) return false;
      return canEditSignupFor(currentUser, target, rolesMap, staffUnlocked);
    },
    [currentUser, rolesMap, staffUnlocked],
  );

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

  const loadMembers = useCallback(async () => {
    try {
      const data = await fetchMembersData();
      setProfiles(data.profiles);
      setRolesMap(buildRolesMap(data.roles));
    } catch {
      /* non-fatal */
    } finally {
      setMembersLoaded(true);
    }
  }, []);

  const loadRoster = useCallback(async () => {
    if (!currentUser || !isStaff) return;
    try {
      const data = await fetchMemberRoster(currentUser);
      setRoster(data.roster);
    } catch {
      /* non-fatal */
    }
  }, [currentUser, isStaff]);

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
    const tick = () => {
      setSignups((prev) => {
        const synced = syncSignups(prev);
        if (synced.every((s, i) => s.status === prev[i]?.status)) return prev;
        return synced;
      });
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    loadMembers();
    loadGuildConfig();
  }, [loadMembers, loadGuildConfig]);

  useEffect(() => {
    if (view === "roster") loadRoster();
  }, [view, loadRoster]);

  async function assignToCell(
    member: Member,
    skill: Skill,
    plannedDate: string,
    plannedStartAt: string,
  ): Promise<string | null> {
    if (!currentUser) return "Select your character first.";
    setSaving(true);
    setError(null);
    const { signup, error: err } = await saveSignup({
      weekStart,
      memberName: member,
      skill,
      plannedDate,
      plannedStartAt,
      actorMember: currentUser,
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
            a.skill.localeCompare(b.skill) ||
            a.planned_start_at.localeCompare(b.planned_start_at),
        );
      });
    }
    await load();
    return null;
  }

  async function handleDropOnCell(target: CellTarget) {
    const signup = dragSignup;
    if (!signup || !currentUser) return;
    if (!canDragSignup(currentUser, signup.member_name, rolesMap, staffUnlocked)) return;
    setDragSignup(null);
    const startAt =
      target.plannedStartAt ??
      (target.dayFraction != null
        ? buildStartAtFromWeekFraction(
            weekStart,
            (() => {
              const dayIdx = weekDays.indexOf(target.plannedDate);
              if (dayIdx < 0) return 0;
              return (dayIdx + target.dayFraction) / 7;
            })(),
          )
        : signup.planned_start_at);
    const plannedDate = dateFromStartAt(startAt);
    if (
      signup.skill === target.skill &&
      signup.planned_date === plannedDate &&
      signup.planned_start_at === startAt
    ) {
      return;
    }
    await assignToCell(signup.member_name, target.skill, plannedDate, startAt);
  }

  async function handleToggleSkillComplete(skill: Skill, completed: boolean) {
    if (!currentUser) {
      setError("Select your character first to mark skills complete.");
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
    if (!currentUser) {
      setError("Select your character first.");
      return;
    }
    setEditingSignup(null);
    setModalTarget(target);
  }

  function openSignup(s: TrialSignup) {
    if (!canEditSignup(s.member_name)) return;
    setEditingSignup(s);
    setModalTarget({
      skill: s.skill as Skill,
      plannedDate: s.planned_date,
      plannedStartAt: s.planned_start_at,
    });
  }

  function closeModal() {
    setModalTarget(null);
    setEditingSignup(null);
  }

  async function applySuggestion(s: ScheduleSuggestion) {
    if (!canEditSignup(s.member)) {
      setError("You can only apply your own suggestion.");
      return;
    }
    await assignToCell(s.member, s.skill, s.plannedDate, s.plannedStartAt);
  }

  async function applySuggestionsBatch(items: ScheduleSuggestion[]) {
    if (!currentUser || !isStaff) return;
    setSaving(true);
    setError(null);
    for (const s of items) {
      const err = await saveSignup({
        weekStart,
        memberName: s.member,
        skill: s.skill,
        plannedDate: s.plannedDate,
        plannedStartAt: s.plannedStartAt,
        actorMember: currentUser,
      });
      if (err.error) {
        setError(err.error);
        break;
      }
    }
    setSaving(false);
    await load();
  }

  const tabItems: [ViewTab, string][] = [
    ["planner", "Weekly planner"],
    ["members", "Members"],
    ["suggestions", "Smart suggestions"],
    ["buildings", "Guild buildings"],
  ];
  if (isStaff) tabItems.push(["roster", "Guild roster"]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0c1424] text-slate-100">
        <MemberSelectModal open={memberSelectOpen} onSelect={handleMemberSelect} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c1424] text-slate-100">
      <MemberSelectModal open={memberSelectOpen} onSelect={handleMemberSelect} />

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
                  className="rounded-md border border-slate-600 bg-slate-800/80 px-2 py-0.5 text-xs font-medium text-sky-300 hover:bg-slate-700"
                >
                  Guide
                </button>
              </div>
              <p className="text-xs text-slate-500">{TRIAL_WINDOW_NOTE}</p>
            </div>
            <ProfileHeaderBar
              currentUser={currentUser}
              dbRole={dbRole!}
              effectiveRole={currentRole!}
              staffUnlocked={staffUnlocked}
              onOpenProfile={() => openProfile(currentUser)}
              onSwitchUser={() => setMemberSelectOpen(true)}
              onUnlockStaff={() => setStaffPasswordOpen(true)}
              onSignOutStaff={handleStaffSignOut}
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
          <p className="text-sm text-slate-400">
            {formatWeekRange(weekStart)}
            <span className="text-slate-500"> · All times UTC+2</span>
          </p>
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

        <GuildSummary stats={stats} xpCoverage={xpCoverage} />

        {error && (
          <p className="rounded-lg bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/50 pb-2">
          {tabItems.map(([id, label]) => (
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
                loadMembers();
                loadGuildConfig();
                loadRoster();
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
            profiles={profiles}
            weekDays={weekDays}
            guildConfig={guildConfig}
            onGuildConfigSaved={setGuildConfig}
            currentUser={currentUser}
            canUseStaffTools={isStaff}
            saving={saving}
            onApplySuggestion={applySuggestion}
            onApplyAllUnassigned={applySuggestionsBatch}
          />
        ) : view === "buildings" ? (
          <GuildBuildingsView
            guildConfig={guildConfig}
            currentUser={currentUser}
            canEditHalls={isStaff}
            onGuildConfigSaved={setGuildConfig}
          />
        ) : view === "roster" ? (
          <MemberRosterView
            roster={roster}
            currentUser={currentUser}
            currentUserRole={currentRole!}
            onRefresh={() => {
              loadMembers();
              loadRoster();
            }}
            onOpenProfile={openProfile}
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
            <div>
              {view === "planner" && (
                <>
                  <p className="mb-2 text-xs text-slate-500">
                    Click the timeline to schedule · drag trials to another skill or time · status
                    updates automatically
                  </p>
                  <WeeklyTimeline
                    weekStart={weekStart}
                    weekDays={weekDays}
                    signups={signups}
                    currentUser={currentUser}
                    skillCoverage={stats.skillCoverage}
                    xpCoverage={xpCoverage}
                    togglingSkill={togglingSkill}
                    onToggleSkillComplete={handleToggleSkillComplete}
                    onSlotClick={openCell}
                    onSignupClick={openSignup}
                    onDragStart={setDragSignup}
                    onDrop={handleDropOnCell}
                    canDragSignup={(s) =>
                      canDragSignup(currentUser, s.member_name, rolesMap, staffUnlocked)
                    }
                    canOpenSignup={(s) => canEditSignup(s.member_name)}
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
            {view === "planner" && (
              <SkillCoverageList
                stats={stats}
                xpCoverage={xpCoverage}
                currentUser={currentUser}
                togglingSkill={togglingSkill}
                onToggleComplete={handleToggleSkillComplete}
              />
            )}
          </div>
        )}
      </main>

      <WelcomeGuideModal open={guideOpen && identityReady} onClose={handleGuideClose} />

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        currentUser={currentUser}
        targetMember={profileTarget || currentUser}
        initialProfile={profilesMap.get(profileTarget || currentUser) ?? null}
        rolesMap={rolesMap}
        staffUnlocked={staffUnlocked}
        onSaved={(profile) => {
          setProfiles((prev) => {
            const next = prev.filter((p) => p.member_name !== profile.member_name);
            return [...next, profile].sort((a, b) =>
              a.member_name.localeCompare(b.member_name),
            );
          });
        }}
        pendingXpImport={pendingXpImport}
        onXpImportApplied={handleXpImportApplied}
      />

      <CellAssignmentModal
        open={!!modalTarget}
        target={modalTarget}
        signups={signups}
        currentUser={currentUser}
        editingSignup={editingSignup}
        canEditSignup={canEditSignup}
        canAssignOthers={isStaff}
        saving={saving}
        onClose={closeModal}
        onSave={async (member, skill, plannedDate, plannedStartAt) => {
          if (!modalTarget) return "No cell selected.";
          const existing = signups.find((s) => s.member_name === member);
          if (
            existing &&
            existing.skill === skill &&
            existing.planned_date === plannedDate &&
            existing.planned_start_at === plannedStartAt &&
            editingSignup?.id === existing.id
          ) {
            return null;
          }
          return assignToCell(member, skill, plannedDate, plannedStartAt);
        }}
        onDelete={async (signup) => {
          setSaving(true);
          const { error: err } = await deleteSignup({
            id: signup.id,
            memberName: signup.member_name,
            actorMember: currentUser,
          });
          setSaving(false);
          if (err) {
            setError(err);
            return err;
          }
          await load();
          return null;
        }}
      />

      {dbRole && isStaffRole(dbRole) && (
        <StaffPasswordModal
          open={staffPasswordOpen}
          member={currentUser}
          role={dbRole}
          onUnlock={handleStaffUnlock}
          onContinueWithoutStaff={() => setStaffPasswordOpen(false)}
        />
      )}
    </div>
  );
}
