"use client";

import { useEffect, useRef, useState } from "react";
import { GameIcon } from "./GameIcon";

export function WelcomeGuideModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
}) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const dontShowRef = useRef(false);

  useEffect(() => {
    dontShowRef.current = dontShowAgain;
  }, [dontShowAgain]);

  useEffect(() => {
    if (!open) return;
    setDontShowAgain(false);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose(dontShowRef.current);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 p-4 sm:items-center"
      onClick={() => onClose(dontShowAgain)}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-600 bg-[#131f36] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-guide-title"
      >
        <div className="border-b border-slate-700/60 px-5 py-4">
          <div className="flex items-start gap-3">
            <GameIcon size={40} className="shrink-0" />
            <div>
              <h2 id="welcome-guide-title" className="text-lg font-bold text-white">
                How to use the Guild Trials planner
              </h2>
              <p className="mt-0.5 text-sm text-slate-400">
                Quick setup once, then a short routine each week.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-5 py-4 text-sm text-slate-300">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-400">
              First time only
            </h3>
            <ol className="mt-2 list-decimal space-y-2 pl-5 marker:text-slate-500">
              <li>
                <strong className="text-white">Select your name</strong> in the top bar (saved in
                this browser).
              </li>
              <li>
                Open <strong className="text-white">My profile</strong> and set XP/h plus skill
                priority for all 16 skills (drag rows or type ranks 1–16).
              </li>
              <li>
                Officers: on <strong className="text-white">Smart suggestions</strong>, set the{" "}
                <strong className="text-white">Guild Trial Hall level</strong> once (trial XP bar =
                8,000 × (level + 1); each run adds 5% of skill XP earned in 24h).
              </li>
              <li>
                Guild Leader can assign roles and edit any member&apos;s profile from{" "}
                <strong className="text-white">Guild roster</strong>.
              </li>
            </ol>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
              Every week (Mon–Sun)
            </h3>
            <ol className="mt-2 list-decimal space-y-2 pl-5 marker:text-slate-500">
              <li>
                Pick the correct week with the buttons above the planner (this week / +1 / +2).
              </li>
              <li>
                Sign up for <strong className="text-white">one skill</strong> on{" "}
                <strong className="text-white">one day</strong>: open the{" "}
                <strong className="text-white">Weekly planner</strong>, click a cell, or use{" "}
                <strong className="text-white">Smart suggestions</strong> and apply your row.
              </li>
              <li>
                You can only have <strong className="text-white">one trial per week</strong>; drag
                on the grid or board to change day/skill.
              </li>
              <li>
                When your guild finishes a skill&apos;s trial, someone marks{" "}
                <strong className="text-white">Mark done</strong> on that skill (all 16 should
                complete each week).
              </li>
              <li>
                Check the summary and sidebar to see which skills still need signups or another
                member.
              </li>
            </ol>
          </section>

          <p className="rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-2 text-xs text-slate-500">
            No login — your name is stored locally. Use the same browser each visit, or select your
            name again on a new device.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/60 px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="size-4 rounded border-slate-600 bg-slate-900 text-sky-600"
            />
            Don&apos;t show this again
          </label>
          <button
            type="button"
            onClick={() => onClose(dontShowAgain)}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
