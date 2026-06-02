"use client";

import Image from "next/image";
import { useState } from "react";

const GUIDE_IMAGE_WIDTH = 556;
const GUIDE_IMAGE_HEIGHT = 100;

export function XpPerHourGuidePanel({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border border-slate-600 bg-slate-900/95 p-3 shadow-xl sm:flex-row sm:items-center sm:gap-5 ${className}`}
    >
      <p className="shrink-0 text-xs leading-relaxed text-slate-400 sm:w-44">
        On any <strong className="text-slate-200">skill page</strong> in Ironwood, open{" "}
        <strong className="text-slate-200">Stats</strong> →{" "}
        <strong className="text-slate-200">Estimates</strong> and copy the{" "}
        <strong className="text-slate-200">XP / hour</strong> value.
      </p>
      <div className="min-w-0 flex-1 flex justify-center sm:justify-end">
        <Image
          src="/guides/xp-per-hour.png"
          alt="In-game skill page: Stats column shows XP with per-hour estimate on the right"
          width={GUIDE_IMAGE_WIDTH}
          height={GUIDE_IMAGE_HEIGHT}
          className="h-auto w-full rounded border border-slate-700 pixel-icon"
          sizes="(max-width: 640px) 100vw, 556px"
          priority
        />
      </div>
    </div>
  );
}

function ToggleButton({
  open,
  onClick,
  small,
}: {
  open: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        small
          ? "text-[10px] text-sky-400 hover:underline"
          : "text-xs text-sky-400 hover:underline"
      }
    >
      {open ? "Hide XP/h guide" : small ? "XP/h in game?" : "Where to find XP/h in game?"}
    </button>
  );
}

/** Stacked layout (standalone / non-header use). */
export function XpPerHourGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <ToggleButton open={open} onClick={() => setOpen((o) => !o)} />
      {open && <XpPerHourGuidePanel className="mt-2" />}
    </div>
  );
}
