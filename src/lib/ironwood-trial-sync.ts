/**
 * Phase 1 — Ironwood in-game guild trial data model and sync payload types.
 *
 * Derived from ironwoodrpg.com main bundle (iw-main.js) and Guild → Trials UI.
 * Extraction strategy mirrors XP import: read Angular guild component state while logged in.
 */
import { MEMBERS, SKILLS, type Member, type Skill } from "./constants";
import { guildDateFromInstant, guildWeekStart } from "./guild-timezone";
import { IRONWOOD_ORIGIN, IRONWOOD_SKILL_NAME_MAP } from "./ironwood-xp-import";
import { getWeekStart } from "./weeks";
import { TRIAL_DURATION_MS, weekBoundsLocal } from "./trial-schedule";
import type { TrialSignup } from "./types";

export const TRIAL_SYNC_PROBE_SCRIPT_PATH = "/ironwood-trial-sync-probe.js";
export const TRIAL_SYNC_SCRIPT_PATH = "/ironwood-trial-sync.js";
export const TRIAL_SYNC_USERSCRIPT_PATH = "/ironwood-trial-sync.user.js";
export const TRIAL_SYNC_HELPER_STORAGE_KEY = "igt-trial-sync-helper-installed";
export const TRIAL_SYNC_HELPER_PROBE_PARAM = "igtHelperProbe";
export const TRIAL_SYNC_HELPER_PROBE_VALUE = "trialSync";
export const TRIAL_SYNC_PROBE_RUN_SCRIPT_PATH = "/ironwood-trial-sync-probe-run.js";
export const TRIAL_PROBE_URL_PARAM = "trialProbe";
export const TRIAL_PROBE_LAUNCH_PARAM = "igtTrialProbe";
export const TRIAL_SYNC_SCRIPT_VERSION = "1.9.5";

/** Same 16-skill order as Ironwood `z.lA` / sidebar. */
export const IRONWOOD_TRIAL_SKILL_ORDER = SKILLS;

// ---------------------------------------------------------------------------
// Raw in-game shapes (from guild.trial on Firebase guild document)
// ---------------------------------------------------------------------------

/** Keyed by displayName in `guild.trial.members`. */
export type IronwoodGuildTrialMemberRaw = {
  displayName: string;
  skillId: string | number;
  exp: number;
  /** ISO timestamp — 24h after the member joined this skill trial. */
  endDate: string;
};

export type IronwoodGuildTrialSkillRaw = {
  id: string | number;
  currentExp: number;
};

export type IronwoodGuildTrialRaw = {
  startDate: string;
  /** Guild-wide trial period end (header “End Date” countdown). */
  endDate?: string;
  requiredExp: number;
  creditReward: number;
  expBonus: number;
  skills: Record<string, IronwoodGuildTrialSkillRaw>;
  members: Record<string, IronwoodGuildTrialMemberRaw>;
};

export type IronwoodGuildTrialStatsRaw = {
  trials?: { completed?: number };
  guild?: { lastTrialAt?: string };
};

// ---------------------------------------------------------------------------
// Normalized payload (Phase 2 import target)
// ---------------------------------------------------------------------------

export type IronwoodTrialSyncMemberSource = {
  displayName: string;
  skillId: string | number;
  skillName: string | null;
  exp: number;
  endDate: string;
  inferredStartAt: string;
  actionId?: number | null;
  method: "component" | "dom";
};

export type IronwoodTrialSyncSkillSource = {
  skill: Skill;
  skillId: string | number;
  currentExp: number;
  requiredExp: number;
  complete: boolean;
  members: IronwoodTrialSyncMemberSource[];
};

export type IronwoodTrialSyncPayload = {
  v: 1;
  importedAt: string;
  guildName?: string;
  guildId?: string;
  /** Monday YYYY-MM-DD (guild TZ) for the active Ironwood trial week. */
  trialWeekStart: string;
  trialStartDate: string;
  trialEndDate?: string;
  requiredExp: number;
  trialsCompleted: number;
  trialsTotal: 16;
  guildCreditsEarned: number;
  guildCreditsMax: number;
  skills: IronwoodTrialSyncSkillSource[];
  /** Where assignment data came from (dom-rows, dom-text, api, component, …). */
  source?: string;
  /** displayNames from in-game that did not match MEMBERS. */
  unmatchedNames?: string[];
  errors?: string[];
};

export type IronwoodTrialSyncDiffKind =
  | "missing_in_planner"
  | "skill_mismatch"
  | "time_mismatch"
  | "already_matches";

export type IronwoodTrialSyncDiff = {
  kind: IronwoodTrialSyncDiffKind;
  memberName: Member;
  skill: Skill;
  gameStartAt: string;
  gameExp: number;
  plannerSkill?: Skill;
  plannerStartAt?: string;
};

export type IronwoodTrialSyncAssignment = {
  memberName: Member;
  skill: Skill;
  plannedDate: string;
  plannedStartAt: string;
  gameExp: number;
  endDate: string;
};

export type TrialSyncApplyResult = {
  created: Member[];
  updated: Member[];
  unchanged: Member[];
  skipped: Array<{ displayName: string; reason: string }>;
  errors: Array<{ member: Member; error: string }>;
  /** Payload source used for sync (dom-rows, dom-text, api, etc.). */
  payloadSource?: string;
};

const START_AT_TOLERANCE_MS = 60_000;

export function countTimedMembersInPayload(
  payload: IronwoodTrialSyncPayload,
  now = new Date(),
): number {
  const nowMs = now.getTime();
  let count = 0;
  for (const skillRow of payload.skills) {
    for (const member of skillRow.members) {
      const endMs = new Date(member.endDate).getTime();
      if (!Number.isNaN(endMs) && endMs > nowMs) count++;
    }
  }
  return count;
}

export function trialWindowOverlapsWeek(
  plannedStartAt: string,
  weekStart: string,
): boolean {
  const startMs = new Date(plannedStartAt).getTime();
  if (Number.isNaN(startMs)) return false;
  const endMs = startMs + TRIAL_DURATION_MS;
  const { start, end } = weekBoundsLocal(weekStart);
  return endMs > start.getTime() && startMs < end.getTime();
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

export function mapIronwoodSkillName(name: string): Skill | null {
  const trimmed = name.trim();
  return IRONWOOD_SKILL_NAME_MAP[trimmed] ?? null;
}

export function mapGameDisplayNameToMember(displayName: string): Member | null {
  const trimmed = displayName.trim();
  if (!trimmed) return null;
  if ((MEMBERS as readonly string[]).includes(trimmed)) return trimmed as Member;

  const lower = trimmed.toLowerCase();
  const caseInsensitive = (MEMBERS as readonly Member[]).find((m) => m.toLowerCase() === lower);
  if (caseInsensitive) return caseInsensitive;

  // Ironwood UI sometimes truncates names in buttons (e.g. "Geo" → GeoPapPiano).
  const prefixHits = (MEMBERS as readonly Member[]).filter((m) => m.toLowerCase().startsWith(lower));
  if (prefixHits.length === 1) return prefixHits[0];

  const containsHits = (MEMBERS as readonly Member[]).filter(
    (m) => m.toLowerCase().includes(lower) || lower.includes(m.toLowerCase()),
  );
  if (containsHits.length === 1) return containsHits[0];

  return null;
}

export function inferTrialStartAtFromEndDate(endDate: string): string {
  const endMs = new Date(endDate).getTime();
  if (Number.isNaN(endMs)) return new Date(0).toISOString();
  return new Date(endMs - TRIAL_DURATION_MS).toISOString();
}

/** Monday week_start for planner, from guild.trial.startDate. */
export function resolveIronwoodTrialWeekStart(trialStartDate: string): string {
  const at = new Date(trialStartDate);
  if (Number.isNaN(at.getTime())) return guildWeekStart();
  return guildWeekStart(at);
}

export function isIronwoodTrialSkillComplete(currentExp: number, requiredExp: number): boolean {
  return currentExp >= requiredExp;
}

export function countIronwoodTrialsCompleted(
  skills: Iterable<IronwoodGuildTrialSkillRaw>,
  requiredExp: number,
): number {
  let n = 0;
  for (const skill of skills) {
    if (isIronwoodTrialSkillComplete(skill.currentExp, requiredExp)) n++;
  }
  return n;
}

export function calcIronwoodTrialCreditProgress(
  skills: Iterable<IronwoodGuildTrialSkillRaw>,
  requiredExp: number,
  creditReward: number,
): { earned: number; max: number } {
  let earned = 0;
  let count = 0;
  for (const skill of skills) {
    count++;
    const ratio = Math.min(Math.floor((skill.currentExp / requiredExp) * 10) / 10, 1);
    earned += Math.round(creditReward * ratio);
  }
  return { earned, max: count * creditReward };
}

export function normalizeIronwoodTrialSyncPayload(input: {
  guild?: { id?: string; name?: string; trial?: IronwoodGuildTrialRaw | null };
  trialSkills?: Array<
    IronwoodGuildTrialSkillRaw & {
      members?: Array<
        IronwoodGuildTrialMemberRaw & { actionId?: number | null; skillName?: string }
      >;
    }
  >;
  skillNameById?: Record<string, string>;
  method?: "component" | "dom";
}): IronwoodTrialSyncPayload | null {
  const trial = input.guild?.trial;
  if (!trial?.startDate || !trial.skills || !trial.members) return null;

  const method = input.method ?? "component";
  const requiredExp = trial.requiredExp;
  const skillValues = Object.values(trial.skills);
  const credit = calcIronwoodTrialCreditProgress(skillValues, requiredExp, trial.creditReward);
  const unmatchedNames: string[] = [];

  const skills: IronwoodTrialSyncSkillSource[] = [];
  const errors: string[] = [];

  for (const skillRow of input.trialSkills ?? skillValues) {
      const skillId = skillRow.id;
      const skillName =
        (skillRow as { name?: string }).name ??
        input.skillNameById?.[String(skillId)] ??
        null;
      const skill =
        (skillName ? mapIronwoodSkillName(skillName) : null);

      if (!skill) {
        errors.push(`Unmapped trial skill id ${String(skillRow.id)} (${skillName ?? "unknown name"})`);
        continue;
      }

      const membersRaw: IronwoodGuildTrialMemberRaw[] =
        "members" in skillRow && Array.isArray(skillRow.members)
          ? skillRow.members
          : Object.values(trial.members).filter((m) => m.skillId === skillId);

      const members: IronwoodTrialSyncMemberSource[] = membersRaw.map((m) => {
        if (!mapGameDisplayNameToMember(m.displayName)) unmatchedNames.push(m.displayName);
        return {
          displayName: m.displayName,
          skillId: m.skillId,
          skillName,
          exp: m.exp,
          endDate: m.endDate,
          inferredStartAt: inferTrialStartAtFromEndDate(m.endDate),
          actionId: (m as { actionId?: number }).actionId ?? null,
          method,
        };
      });

      skills.push({
        skill,
        skillId,
        currentExp: skillRow.currentExp,
        requiredExp,
        complete: isIronwoodTrialSkillComplete(skillRow.currentExp, requiredExp),
        members,
      });
  }

  // Re-sort to canonical order when skill names resolved
  const order = new Map(IRONWOOD_TRIAL_SKILL_ORDER.map((s, i) => [s, i]));
  skills.sort((a, b) => (order.get(a.skill) ?? 99) - (order.get(b.skill) ?? 99));

  return {
    v: 1,
    importedAt: new Date().toISOString(),
    guildName: input.guild?.name,
    guildId: input.guild?.id,
    trialWeekStart: resolveIronwoodTrialWeekStart(trial.startDate),
    trialStartDate: trial.startDate,
    trialEndDate: trial.endDate,
    requiredExp,
    trialsCompleted: countIronwoodTrialsCompleted(skillValues, requiredExp),
    trialsTotal: 16,
    guildCreditsEarned: credit.earned,
    guildCreditsMax: credit.max,
    skills,
    unmatchedNames: unmatchedNames.length ? [...new Set(unmatchedNames)] : undefined,
    errors: errors.length ? errors : undefined,
  };
}

// ---------------------------------------------------------------------------
// Encode / decode (same base64url pattern as XP import)
// ---------------------------------------------------------------------------

export function encodeTrialSyncPayload(payload: IronwoodTrialSyncPayload): string {
  const json = JSON.stringify(payload);
  if (typeof btoa === "function") {
    return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeTrialSyncPayload(encoded: string): IronwoodTrialSyncPayload | null {
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json =
      typeof atob === "function"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("utf8");
    const parsed = JSON.parse(json) as IronwoodTrialSyncPayload;
    if (parsed?.v !== 1 || !Array.isArray(parsed.skills)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildIronwoodTrialSyncHelperProbeUrl(): string {
  const url = new URL(IRONWOOD_ORIGIN);
  url.searchParams.set(TRIAL_SYNC_HELPER_PROBE_PARAM, TRIAL_SYNC_HELPER_PROBE_VALUE);
  return url.toString();
}

export function isIronwoodTrialSyncHelperMessage(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const msg = data as { type?: string; v?: number };
  return msg.type === "igt-trial-sync-helper-active" && msg.v === 1;
}

export function isIronwoodOrigin(origin: string): boolean {
  return /^https:\/\/(www\.)?ironwoodrpg\.com$/i.test(origin);
}

export type IronwoodTrialProbeAssignment = {
  displayName: string;
  skillId: string | number;
  exp?: number;
  endDate: string | null;
  inferredStartAt: string | null;
  source: string;
};

export type IronwoodTrialProbeReport = {
  v: 1;
  importedAt: string;
  pageUrl?: string;
  diagnostics: {
    componentFound: boolean;
    hasGuildObservable: boolean;
    hasTrialSkillsObservable: boolean;
    hasGetTrial: boolean;
    ngGetComponentAvailable: boolean;
    ngContextNodesWithContext: number;
    guildTrialOnGuildObject: boolean;
    trialMembersOnGuildTrial: number;
    trialSkillsRowCount: number;
    trialSkillsMemberCount: number;
    captureHookInstalled: boolean;
    captureRawResponses: number;
    captureHasGuildTrial: boolean;
    assignmentRowsCollected: number;
    assignmentsWithEndDate: number;
    guildUiVisible: boolean;
    trialsTabActive?: boolean;
    trialsTabClickAttempted?: boolean;
    navigationMethod?: string;
    domSkillHeadersFound?: number;
    domMemberXpLinesFound?: number;
    domHasRequiredExp?: boolean;
    domAssignmentsCollected?: number;
    captureNetworkUrlsSeen?: number;
  };
  trialMeta?: {
    startDate: string | null;
    endDate: string | null;
    requiredExp: number | null;
  } | null;
  assignments: IronwoodTrialProbeAssignment[];
  samples?: {
    captureUrls?: string[];
    recentNetworkUrls?: string[];
    trialMemberKeys?: string[];
  };
};

export function buildPlannerTrialSyncReturnUrl(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("trialSync");
  url.searchParams.delete("trialProbe");
  url.hash = "";
  return url.toString();
}

export function buildIronwoodTrialProbeLaunchUrl(returnUrl: string): string {
  const url = new URL(`${IRONWOOD_ORIGIN.replace(/\/$/, "")}/guild`);
  url.searchParams.set(TRIAL_PROBE_LAUNCH_PARAM, "1");
  url.searchParams.set("igtReturn", returnUrl);
  return url.toString();
}

export function encodeTrialProbeReport(report: IronwoodTrialProbeReport): string {
  const json = JSON.stringify(report);
  if (typeof btoa === "function") {
    return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeTrialProbeReport(encoded: string): IronwoodTrialProbeReport | null {
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json =
      typeof atob === "function"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("utf8");
    const parsed = JSON.parse(json) as IronwoodTrialProbeReport;
    if (parsed?.v !== 1 || !parsed.diagnostics) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readTrialProbeFromLocation(search: string): IronwoodTrialProbeReport | null {
  const params = new URLSearchParams(search);
  const encoded = params.get(TRIAL_PROBE_URL_PARAM);
  if (!encoded) return null;
  return decodeTrialProbeReport(encoded);
}

export function buildIronwoodTrialSyncProbeUrl(appOrigin?: string): string {
  const origin = (appOrigin ?? IRONWOOD_ORIGIN).replace(/\/$/, "");
  return `${origin}${TRIAL_SYNC_PROBE_SCRIPT_PATH}`;
}

export function buildIronwoodTrialSyncLaunchUrl(returnUrl: string): string {
  const url = new URL(`${IRONWOOD_ORIGIN.replace(/\/$/, "")}/guild`);
  url.searchParams.set("igtTrialSync", "1");
  url.searchParams.set("igtReturn", returnUrl);
  return url.toString();
}

export function buildIronwoodTrialSyncConsoleSnippet(appOrigin: string, returnUrl: string): string {
  const src = `${appOrigin.replace(/\/$/, "")}${TRIAL_SYNC_SCRIPT_PATH}?v=${TRIAL_SYNC_SCRIPT_VERSION}&return=${encodeURIComponent(returnUrl)}`;
  return `(function(){var s=document.createElement('script');s.src='${src}';document.body.appendChild(s);})();`;
}

export function buildStaticIronwoodTrialSyncBookmarklet(): string {
  const code = `(function(){var p=new URLSearchParams(location.search);var r=p.get('igtReturn');if(!r){r=sessionStorage.getItem('igt-trial-sync-return');}if(!r){alert('Tap Sync from Ironwood in Guild Trials first, then run this bookmark on the Ironwood tab.');return;}if(location.hostname.indexOf('ironwoodrpg')<0){alert('Open ironwoodrpg.com first.');return;}var o=new URL(r).origin;var path=location.pathname.replace(/\\/$/,'')||'/';if(path!=='/guild'){sessionStorage.setItem('igt-trial-sync-return',r);sessionStorage.setItem('igt-trial-sync-run','1');location.assign(o+'/guild?igtTrialSync=1&igtReturn='+encodeURIComponent(r));return;}var s=o+'/ironwood-trial-sync.js?v=${TRIAL_SYNC_SCRIPT_VERSION}&return='+encodeURIComponent(r);var e=document.createElement('script');e.src=s;(document.body||document.documentElement).appendChild(e);})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

export function buildUserscriptTrialSyncInstallUrl(appOrigin: string): string {
  return `${appOrigin.replace(/\/$/, "")}${TRIAL_SYNC_USERSCRIPT_PATH}?v=${TRIAL_SYNC_SCRIPT_VERSION}`;
}

export function isTrialSyncHelperInstalled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(TRIAL_SYNC_HELPER_STORAGE_KEY) === "1";
}

export function markTrialSyncHelperInstalled(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(TRIAL_SYNC_HELPER_STORAGE_KEY, "1");
}

export function readTrialSyncFromLocation(search: string): IronwoodTrialSyncPayload | null {
  const params = new URLSearchParams(search);
  const encoded = params.get("trialSync");
  if (!encoded) return null;
  return decodeTrialSyncPayload(encoded);
}

export function findWeekOffsetForStart(weekStartIso: string, at = new Date()): number | null {
  for (let offset = -4; offset <= 12; offset++) {
    if (getWeekStart(at, offset) === weekStartIso) return offset;
  }
  return null;
}

function startTimesMatch(a: string, b: string): boolean {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) <= START_AT_TOLERANCE_MS;
}

/** Active in-game trial slots (endDate still in the future). One row per member. */
export function collectActiveTrialAssignments(
  payload: IronwoodTrialSyncPayload,
  now = new Date(),
): IronwoodTrialSyncAssignment[] {
  const nowMs = now.getTime();
  const byMember = new Map<Member, IronwoodTrialSyncAssignment>();

  for (const skillRow of payload.skills) {
    const skill = mapIronwoodSkillName(skillRow.skill);
    if (!skill) continue;

    for (const member of skillRow.members) {
      const memberName = mapGameDisplayNameToMember(member.displayName);
      if (!memberName) continue;

      if (
        member.skillId != null &&
        skillRow.skillId != null &&
        String(member.skillId) !== String(skillRow.skillId)
      ) {
        const memberMethod = (member as { method?: string }).method;
        const skillIdIsName =
          typeof member.skillId === "string" &&
          !/^\d+$/.test(String(member.skillId).trim());
        if (
          memberMethod === "dom-columns" ||
          memberMethod === "dom" ||
          memberMethod === "dom-text" ||
          skillIdIsName
        ) {
          /* DOM payloads carry skill on the row; ignore string/numeric id mismatch */
        } else {
          continue;
        }
      }

      const endMs = new Date(member.endDate).getTime();
      if (Number.isNaN(endMs) || endMs <= nowMs) continue;

      const plannedStartAt = inferTrialStartAtFromEndDate(member.endDate);
      if (Number.isNaN(new Date(plannedStartAt).getTime())) continue;
      byMember.set(memberName, {
        memberName,
        skill,
        plannedDate: guildDateFromInstant(plannedStartAt),
        plannedStartAt,
        gameExp: member.exp,
        endDate: member.endDate,
      });
    }
  }

  return [...byMember.values()];
}

export function buildTrialSyncDiffs(
  payload: IronwoodTrialSyncPayload,
  signups: TrialSignup[],
  weekStart = payload.trialWeekStart,
): IronwoodTrialSyncDiff[] {
  const byMember = new Map(signups.filter((s) => s.week_start === weekStart).map((s) => [s.member_name, s]));
  const diffs: IronwoodTrialSyncDiff[] = [];

  for (const assignment of collectActiveTrialAssignments(payload)) {
    const existing = byMember.get(assignment.memberName);
    if (!existing) {
      diffs.push({
        kind: "missing_in_planner",
        memberName: assignment.memberName,
        skill: assignment.skill,
        gameStartAt: assignment.plannedStartAt,
        gameExp: assignment.gameExp,
      });
      continue;
    }

    const sameSkill = existing.skill === assignment.skill;
    const sameTime = startTimesMatch(existing.planned_start_at, assignment.plannedStartAt);

    if (sameSkill && sameTime) {
      diffs.push({
        kind: "already_matches",
        memberName: assignment.memberName,
        skill: assignment.skill,
        gameStartAt: assignment.plannedStartAt,
        gameExp: assignment.gameExp,
        plannerSkill: existing.skill,
        plannerStartAt: existing.planned_start_at,
      });
      continue;
    }

    diffs.push({
      kind: sameSkill ? "time_mismatch" : "skill_mismatch",
      memberName: assignment.memberName,
      skill: assignment.skill,
      gameStartAt: assignment.plannedStartAt,
      gameExp: assignment.gameExp,
      plannerSkill: existing.skill,
      plannerStartAt: existing.planned_start_at,
    });
  }

  return diffs;
}
/**
 * Phase 1 data model summary (for docs / devtools).
 * See scripts/probe-guild-trials.mjs for bundle offsets.
 */
export const IRONWOOD_TRIAL_SYNC_MODEL_NOTES = {
  guildTrialFields: [
    "startDate",
    "endDate",
    "requiredExp",
    "creditReward",
    "expBonus",
    "skills",
    "members",
  ],
  memberFields: ["displayName", "skillId", "exp", "endDate"],
  skillFields: ["id", "currentExp"],
  memberKey: "displayName",
  isInTrial: "guild.trial.members[user.displayName] exists",
  joinApi: "POST joinGuildTrial { skillId }",
  startApi: "POST startGuildTrial { guildId }",
  componentObservables: ["guild$", "trialSkills$"],
  uiDuration: "duration pipe on member.endDate while isDateBefore(endDate)",
} as const;
