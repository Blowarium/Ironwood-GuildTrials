"use client";

import { useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export function useDebouncedAutoSave({
  enabled,
  deps,
  save,
  delayMs = 600,
  skipInitial = true,
}: {
  enabled: boolean;
  deps: unknown[];
  save: () => Promise<string | null>;
  delayMs?: number;
  skipInitial?: boolean;
}): { status: AutoSaveStatus; error: string | null } {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const skipNextRef = useRef(skipInitial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setError(null);
      return;
    }

    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    setStatus("pending");

    timerRef.current = setTimeout(async () => {
      setStatus("saving");
      setError(null);
      const err = await saveRef.current();
      if (err) {
        setError(err);
        setStatus("error");
        return;
      }
      setStatus("saved");
      fadeTimerRef.current = setTimeout(() => setStatus("idle"), 2000);
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the explicit trigger list
  }, [enabled, delayMs, skipInitial, ...deps]);

  useEffect(
    () => () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    },
    [],
  );

  return { status, error };
}
