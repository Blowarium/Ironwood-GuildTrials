"use client";

import { MEMBERS, type Member } from "@/lib/constants";

export function MemberSelectModal({
  open,
  onSelect,
}: {
  open: boolean;
  onSelect: (member: Member) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div
        className="w-full max-w-md rounded-xl border border-slate-600 bg-[#131f36] p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-select-title"
      >
        <h2 id="member-select-title" className="text-lg font-bold text-white">
          Who are you?
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Select your guild character. This is saved in your browser so the planner knows your
          profile and permissions.
        </p>
        <ul className="mt-4 max-h-[50vh] space-y-1 overflow-y-auto">
          {MEMBERS.map((m) => (
            <li key={m}>
              <button
                type="button"
                onClick={() => onSelect(m)}
                className="w-full rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:border-sky-500/50 hover:bg-sky-950/30"
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
