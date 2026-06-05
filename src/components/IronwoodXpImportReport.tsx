"use client";

import { SKILLS, type Skill } from "@/lib/constants";
import type { IronwoodXpImportPayload } from "@/lib/ironwood-xp-import";

export function IronwoodXpImportReport({
  payload,
}: {
  payload: IronwoodXpImportPayload;
}) {
  const sources = payload.actionSources ?? {};
  const rows = SKILLS.map((skill) => {
    const src = sources[skill];
    const xp = payload.skills[skill];
    const err = payload.errors?.[skill];
    if (!src && xp == null && !err) return null;
    return { skill, src, xp, err };
  }).filter(Boolean) as Array<{
    skill: Skill;
    src?: (typeof sources)[Skill];
    xp?: number;
    err?: string;
  }>;

  if (!rows.length) return null;

  return (
    <details
      open
      className="mt-2 rounded-lg border border-slate-600/80 bg-slate-950/50 p-3 text-xs text-slate-300"
    >
      <summary className="cursor-pointer font-medium text-slate-200">
        Import details — action used per skill
      </summary>
      <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
        {rows.map(({ skill, src, xp, err }) => (
          <li key={skill} className="leading-snug">
            <span className="font-medium text-slate-200">{skill}</span>
            {src ? (
              <>
                {" — "}
                <span className="text-sky-300">{src.name}</span>
                {src.level != null && (
                  <span className="text-slate-500"> (Lv. {src.level})</span>
                )}
                {src.actionId > 0 && (
                  <span className="text-slate-600"> #{src.actionId}</span>
                )}
                {src.method && (
                  <span className="text-slate-500"> [{src.method}]</span>
                )}
                {xp != null && (
                  <span className="text-emerald-400/90">
                    {" "}
                    → {xp.toLocaleString()} XP/h
                  </span>
                )}
                {src.url && (
                  <>
                    {" "}
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400/80 hover:underline"
                    >
                      open
                    </a>
                  </>
                )}
              </>
            ) : err ? (
              <span className="text-amber-300"> — skipped: {err}</span>
            ) : xp != null ? (
              <span className="text-emerald-400/90">
                {" "}
                → {xp.toLocaleString()} XP/h
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
