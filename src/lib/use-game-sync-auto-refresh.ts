"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readAutoSyncLaunchAt,
  persistAutoSyncLaunchAt,
} from "./game-sync-session";
import {
  buildIronwoodTrialSyncLaunchUrl,
  buildPlannerGameSyncReturnUrl,
  TRIAL_SYNC_AUTO_INTERVAL_MS,
  TRIAL_SYNC_HELPER_WINDOW_NAME,
} from "./ironwood-game-sync";

export function useGameSyncAutoRefresh(options: {
  enabled: boolean;
  plannerHref: string;
  syncBusy: boolean;
}) {
  const { enabled, plannerHref, syncBusy } = options;
  const [lastAutoSyncAt, setLastAutoSyncAt] = useState<Date | null>(() => readAutoSyncLaunchAt());
  const launchCooldownRef = useRef(false);

  const launchAutoSync = useCallback(() => {
    if (!enabled || !plannerHref || syncBusy || launchCooldownRef.current) return false;

    const returnUrl = buildPlannerGameSyncReturnUrl(plannerHref);
    window.open(buildIronwoodTrialSyncLaunchUrl(returnUrl), TRIAL_SYNC_HELPER_WINDOW_NAME);
    const now = new Date();
    setLastAutoSyncAt(now);
    persistAutoSyncLaunchAt(now);
    launchCooldownRef.current = true;
    window.setTimeout(() => {
      launchCooldownRef.current = false;
    }, 120_000);
    return true;
  }, [enabled, plannerHref, syncBusy]);

  useEffect(() => {
    if (!enabled || !plannerHref) return;

    const id = window.setInterval(() => {
      launchAutoSync();
    }, TRIAL_SYNC_AUTO_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [enabled, plannerHref, launchAutoSync]);

  return { lastAutoSyncAt, launchAutoSync };
}

/** @deprecated Use {@link useGameSyncAutoRefresh}. */
export const useTrialSyncAutoRefresh = useGameSyncAutoRefresh;
