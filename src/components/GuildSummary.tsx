import type { GuildStats } from "@/lib/stats";
import type { Skill } from "@/lib/constants";
import {
  adequacyLabel,
  type SkillXpAdequacy,
  type SkillXpCoverage,
} from "@/lib/skill-xp-coverage";
import { SkillIcon } from "./SkillIcon";

type TrialChipTone = "active" | "scheduled" | "completed" | "marked" | "needs_signup";

const TRIAL_CHIP_BG: Record<TrialChipTone, string> = {
  active: "bg-sky-400/35",
  scheduled: "bg-indigo-400/35",
  completed: "bg-emerald-400/35",
  marked: "bg-emerald-400/35",
  needs_signup: "bg-amber-400/35",
};

const TRIAL_STATUS_LABEL: Record<TrialChipTone, string> = {
  active: "Active now",
  scheduled: "Scheduled",
  completed: "Completed",
  marked: "Marked complete",
  needs_signup: "Needs signup",
};

function xpBorderClass(tone: TrialChipTone, adequacy: SkillXpAdequacy | undefined): string {
  if (tone === "marked" || tone === "needs_signup") {
    return "border border-transparent";
  }
  if (adequacy === "enough") return "border border-emerald-400";
  if (adequacy === "needs_more") return "border border-amber-300";
  return "border border-red-400";
}

function SkillStatusChip({
  skill,
  tone,
  xpAdequacy,
  showLabel = false,
}: {
  skill: Skill;
  tone: TrialChipTone;
  xpAdequacy?: SkillXpAdequacy;
  showLabel?: boolean;
}) {
  const titleParts = [TRIAL_STATUS_LABEL[tone], skill];
  if (tone === "active" || tone === "scheduled" || tone === "completed") {
    titleParts.push(adequacyLabel(xpAdequacy ?? "unknown"));
  }

  return (
    <li
      className={`flex items-center gap-0.5 rounded px-0.5 py-px sm:px-1 sm:py-0.5 ${TRIAL_CHIP_BG[tone]} ${xpBorderClass(tone, xpAdequacy)}`}
      title={titleParts.join(" · ")}
    >
      <SkillIcon skill={skill} size="xs" />
      {showLabel && (
        <span className="max-w-[48px] truncate text-[9px] text-amber-100/90 sm:max-w-[64px] sm:text-[10px]">
          {skill}
        </span>
      )}
    </li>
  );
}

function SkillChipRow({
  items,
  className,
}: {
  items: {
    skill: Skill;
    tone: TrialChipTone;
    xpAdequacy?: SkillXpAdequacy;
    showLabel?: boolean;
  }[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <ul className={`flex flex-wrap gap-0.5 sm:gap-1 ${className ?? "mt-1 sm:mt-1.5"}`}>
      {items.map((item) => (
        <SkillStatusChip key={`${item.tone}-${item.skill}`} {...item} />
      ))}
    </ul>
  );
}

function StatusLine({
  segments,
}: {
  segments: { text: string; className: string }[];
}) {
  if (segments.length === 0) return null;

  return (
    <p className="mt-0.5 text-[10px] text-slate-400 sm:mt-1 sm:text-xs">
      {segments.map((segment, index) => (
        <span key={segment.text}>
          {index > 0 && <span className="text-slate-600"> · </span>}
          <span className={segment.className}>{segment.text}</span>
        </span>
      ))}
    </p>
  );
}

export function GuildSummary({
  stats,
  xpCoverage,
}: {
  stats: GuildStats;
  xpCoverage?: SkillXpCoverage[];
}) {
  const xpBySkill = new Map(xpCoverage?.map((x) => [x.skill, x.adequacy]) ?? []);

  const inProgress = new Set(stats.skillsInProgress);
  const inProgressXp = xpCoverage?.filter((x) => inProgress.has(x.skill)) ?? [];
  const xpEnough = inProgressXp.filter((x) => x.adequacy === "enough").length;
  const xpNeedsMore = inProgressXp.filter((x) => x.adequacy === "needs_more").length;

  const activeCount = stats.skillsActiveNow.length;
  const scheduledCount = stats.skillsScheduledOnly.length;
  const completedRunsCount = stats.skillsTrialRunsComplete.length;
  const inProgressCount = stats.skillsInProgress.length;

  const inProgressStatusSegments: { text: string; className: string }[] = [];
  if (activeCount > 0) {
    inProgressStatusSegments.push({
      text: `${activeCount} active now`,
      className: "text-sky-300",
    });
  }
  if (scheduledCount > 0) {
    inProgressStatusSegments.push({
      text: `${scheduledCount} scheduled`,
      className: "text-indigo-300",
    });
  }
  if (completedRunsCount > 0) {
    inProgressStatusSegments.push({
      text: `${completedRunsCount} completed`,
      className: "text-emerald-300",
    });
  }
  if (
    inProgressCount > 0 &&
    activeCount === 0 &&
    scheduledCount === 0 &&
    completedRunsCount === 0
  ) {
    inProgressStatusSegments.push({
      text: "Awaiting completion mark",
      className: "text-slate-500",
    });
  }
  if (xpNeedsMore > 0) {
    inProgressStatusSegments.push({
      text: `${xpNeedsMore} may need more members`,
      className: "text-amber-300",
    });
  }
  if (xpEnough > 0) {
    inProgressStatusSegments.push({
      text: `${xpEnough} XP looks enough`,
      className: "text-emerald-400",
    });
  }

  const inProgressChipItems = (skills: Skill[], tone: "active" | "scheduled" | "completed") =>
    skills.map((skill) => ({
      skill,
      tone,
      xpAdequacy: xpBySkill.get(skill),
    }));

  return (
    <div className="mobile-panel rounded-xl border border-slate-700/50 bg-[#131f36] sm:p-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-xs">
            Trials complete
          </p>
          <p className="mt-0.5 text-xl font-bold text-emerald-300 sm:mt-1 sm:text-3xl">
            {stats.skillsCompleted}
            <span className="text-sm text-slate-500 sm:text-lg">/{stats.totalSkills}</span>
          </p>
          <p className="hidden text-xs text-slate-500 sm:block">
            Manually marked when the guild trial for that skill is finished
          </p>
          <SkillChipRow
            items={stats.skillsMarkedComplete.map((skill) => ({
              skill,
              tone: "marked" as const,
            }))}
          />
        </div>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-xs">
            In progress
          </p>
          <p className="mt-0.5 text-lg font-bold text-white sm:mt-1 sm:text-2xl">
            {inProgressCount}
          </p>
          {inProgressCount > 0 ? (
            <>
              <StatusLine segments={inProgressStatusSegments} />
              <div className="mt-1 space-y-0.5 sm:mt-1.5 sm:space-y-1">
                <SkillChipRow
                  className=""
                  items={inProgressChipItems(stats.skillsActiveNow, "active")}
                />
                <SkillChipRow
                  className=""
                  items={inProgressChipItems(stats.skillsScheduledOnly, "scheduled")}
                />
                <SkillChipRow
                  className=""
                  items={inProgressChipItems(stats.skillsTrialRunsComplete, "completed")}
                />
              </div>
            </>
          ) : (
            <p className="mt-0.5 hidden text-xs text-slate-500 sm:mt-1 sm:block">
              No trials on the planner yet
            </p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-xs">
            Needs signup
          </p>
          <p className="mt-0.5 text-lg font-bold text-amber-300 sm:mt-1 sm:text-2xl">
            {stats.skillsNeedingSignup.length}
          </p>
          {stats.skillsNeedingSignup.length > 0 ? (
            <SkillChipRow
              items={stats.skillsNeedingSignup.map((skill) => ({
                skill,
                tone: "needs_signup" as const,
                showLabel: true,
              }))}
            />
          ) : (
            <p className="mt-0.5 text-[10px] text-emerald-400 sm:mt-1 sm:text-xs">
              All skills have someone
            </p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-xs">
            Members signed up
          </p>
          <p className="mt-0.5 text-lg font-bold text-white sm:mt-1 sm:text-2xl">
            {stats.assignedCount}
            <span className="text-sm text-slate-500 sm:text-lg">/{stats.totalMembers}</span>
          </p>
          {stats.unassignedMembers.length > 0 && (
            <p className="mt-0.5 truncate text-[10px] text-slate-500 sm:mt-1 sm:text-xs">
              Open: {stats.unassignedMembers.slice(0, 3).join(", ")}
              {stats.unassignedMembers.length > 3
                ? ` +${stats.unassignedMembers.length - 3}`
                : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
