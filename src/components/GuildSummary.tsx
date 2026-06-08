import type { GuildStats } from "@/lib/stats";
import type { Skill } from "@/lib/constants";
import type { SkillXpCoverage } from "@/lib/skill-xp-coverage";
import { SkillIcon } from "./SkillIcon";

function SkillChipList({
  skills,
  tone,
}: {
  skills: Skill[];
  tone: "sky" | "indigo" | "amber";
}) {
  const chipClass =
    tone === "sky"
      ? "bg-sky-950/50"
      : tone === "indigo"
        ? "bg-indigo-950/40"
        : "bg-amber-950/40 text-amber-200/90";
  const labelClass = tone === "amber" ? "text-[9px] sm:text-[10px]" : "";

  if (skills.length === 0) return null;

  return (
    <ul className="mt-1 flex flex-wrap gap-0.5 sm:mt-1.5 sm:gap-1">
      {skills.map((skill) => (
        <li
          key={skill}
          className={`flex items-center gap-0.5 rounded px-0.5 py-px sm:px-1 sm:py-0.5 ${chipClass} ${labelClass}`}
          title={skill}
        >
          <SkillIcon skill={skill} size="xs" />
          {tone === "amber" && (
            <span className="max-w-[48px] truncate sm:max-w-[64px]">{skill}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function GuildSummary({
  stats,
  xpCoverage,
}: {
  stats: GuildStats;
  xpCoverage?: SkillXpCoverage[];
}) {
  const inProgress = new Set(stats.skillsInProgress);
  const inProgressXp = xpCoverage?.filter((x) => inProgress.has(x.skill)) ?? [];
  const xpEnough = inProgressXp.filter((x) => x.adequacy === "enough").length;
  const xpNeedsMore = inProgressXp.filter((x) => x.adequacy === "needs_more").length;

  const activeCount = stats.skillsActiveNow.length;
  const scheduledCount = stats.skillsScheduledOnly.length;
  const inProgressCount = stats.skillsInProgress.length;

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
        </div>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-xs">
            Signed up
          </p>
          <p className="mt-0.5 text-lg font-bold text-white sm:mt-1 sm:text-2xl">
            {inProgressCount}
          </p>
          {inProgressCount > 0 ? (
            <>
              <p className="mt-0.5 text-[10px] text-slate-400 sm:mt-1 sm:text-xs">
                {activeCount > 0 && (
                  <span className="text-sky-300">
                    {activeCount} active now
                  </span>
                )}
                {activeCount > 0 && scheduledCount > 0 && (
                  <span className="text-slate-600"> · </span>
                )}
                {scheduledCount > 0 && (
                  <span className="text-indigo-300">
                    {scheduledCount} scheduled
                  </span>
                )}
                {activeCount === 0 && scheduledCount === 0 && (
                  <span className="text-slate-500">Awaiting completion mark</span>
                )}
              </p>
              {xpNeedsMore > 0 || xpEnough > 0 ? (
                <p className="mt-0.5 hidden text-xs sm:mt-1 sm:block">
                  {xpNeedsMore > 0 ? (
                    <span className="text-amber-300">{xpNeedsMore} may need more members</span>
                  ) : null}
                  {xpNeedsMore > 0 && xpEnough > 0 ? (
                    <span className="text-slate-600"> · </span>
                  ) : null}
                  {xpEnough > 0 ? (
                    <span className="text-emerald-400">{xpEnough} XP looks enough</span>
                  ) : null}
                </p>
              ) : null}
              {activeCount > 0 && (
                <SkillChipList skills={stats.skillsActiveNow} tone="sky" />
              )}
              {scheduledCount > 0 && (
                <SkillChipList skills={stats.skillsScheduledOnly} tone="indigo" />
              )}
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
            <SkillChipList skills={stats.skillsNeedingSignup} tone="amber" />
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
