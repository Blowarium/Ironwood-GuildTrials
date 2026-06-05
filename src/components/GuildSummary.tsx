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
    <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Trials complete
          </p>
          <p className="mt-1 text-3xl font-bold text-emerald-300">
            {stats.skillsCompleted}
            <span className="text-lg text-slate-500">/{stats.totalSkills}</span>
          </p>
          <p className="text-xs text-slate-500">
            Manually marked when the guild trial for that skill is finished
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            In progress
          </p>
          <p className="mt-1 text-2xl font-bold text-sky-300">
            {stats.skillsInProgress.length}
          </p>
          {stats.skillsInProgress.length > 0 ? (
            <>
              <p className="mt-1 text-xs text-sky-200/80">
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
              <ul className="mt-1.5 flex flex-wrap gap-1">
                {stats.skillsInProgress.map((skill) => (
                  <li
                    key={skill}
                    className="flex items-center gap-0.5 rounded bg-sky-950/50 px-1 py-0.5"
                    title={skill}
                  >
                    <SkillIcon skill={skill} size="xs" />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-xs text-slate-500">None waiting on more runs</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Needs first signup
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-300">
            {stats.skillsNeedingSignup.length}
          </p>
          {stats.skillsNeedingSignup.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {stats.skillsNeedingSignup.map((skill) => (
                <li
                  key={skill}
                  className="flex items-center gap-1 rounded bg-amber-950/40 px-1.5 py-0.5 text-[10px] text-amber-200/90"
                  title={skill}
                >
                  <SkillIcon skill={skill} size="xs" />
                  <span className="max-w-[64px] truncate">{skill}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-emerald-400">All skills have someone</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Members signed up
          </p>
          <p className="mt-1 text-2xl font-bold text-white">
            {stats.assignedCount}
            <span className="text-lg text-slate-500">/{stats.totalMembers}</span>
          </p>
          {stats.unassignedMembers.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Open: {stats.unassignedMembers.slice(0, 4).join(", ")}
              {stats.unassignedMembers.length > 4
                ? ` +${stats.unassignedMembers.length - 4}`
                : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
