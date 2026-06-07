import type { GuildStats } from "@/lib/stats";
import type { SkillXpCoverage } from "@/lib/skill-xp-coverage";
import { SkillIcon } from "./SkillIcon";

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
            In progress
          </p>
          <p className="mt-0.5 text-lg font-bold text-sky-300 sm:mt-1 sm:text-2xl">
            {stats.skillsInProgress.length}
          </p>
          {stats.skillsInProgress.length > 0 ? (
            <>
              <p className="mt-0.5 hidden text-xs text-sky-200/80 sm:mt-1 sm:block">
                {xpNeedsMore > 0 ? (
                  <>
                    <span className="text-amber-300">{xpNeedsMore} may need more members</span>
                    {xpEnough > 0 && (
                      <span className="text-emerald-400"> · {xpEnough} XP looks enough</span>
                    )}
                  </>
                ) : xpEnough > 0 ? (
                  <span className="text-emerald-400">XP math looks sufficient for signed-up skills</span>
                ) : (
                  <>
                    Not marked done —{" "}
                    <span className="text-amber-300">may need more members</span>
                  </>
                )}
              </p>
              <ul className="mt-1 flex flex-wrap gap-0.5 sm:mt-1.5 sm:gap-1">
                {stats.skillsInProgress.map((skill) => (
                  <li
                    key={skill}
                    className="flex items-center gap-0.5 rounded bg-sky-950/50 px-0.5 py-px sm:px-1 sm:py-0.5"
                    title={skill}
                  >
                    <SkillIcon skill={skill} size="xs" />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-0.5 hidden text-xs text-slate-500 sm:mt-1 sm:block">None waiting on more runs</p>
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
            <ul className="mt-1 flex flex-wrap gap-0.5 sm:mt-1.5 sm:gap-1">
              {stats.skillsNeedingSignup.map((skill) => (
                <li
                  key={skill}
                  className="flex items-center gap-0.5 rounded bg-amber-950/40 px-1 py-px text-[9px] text-amber-200/90 sm:gap-1 sm:px-1.5 sm:py-0.5 sm:text-[10px]"
                  title={skill}
                >
                  <SkillIcon skill={skill} size="xs" />
                  <span className="max-w-[48px] truncate sm:max-w-[64px]">{skill}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-[10px] text-emerald-400 sm:mt-1 sm:text-xs">All skills have someone</p>
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
