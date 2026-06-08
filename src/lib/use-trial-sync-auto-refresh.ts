"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildIronwoodTrialSyncLaunchUrl,
  buildPlannerTrialSyncReturnUrl,
  TRIAL_SYNC_AUTO_INTERVAL_MS,
  TRIAL_SYNC_HELPER_WINDOW_NAME,
} from "./ironwood-trial-sync";

function helperWindowBusy(): boolean {
  try {
    const existing = window.open("", TRIAL_SYNC_HELPER_WINDOW_NAME);
    if (!existing || existing.closed) return false;
    try {
      return /ironwoodrpg\.com/i.test(existing.location.hostname);
    } catch {
      // Cross-origin while Ironwood sync is running.
      return true;
    }
  } catch {
    return false;
  }
}

export function useTrialSyncAutoRefresh(options: {
  enabled: boolean;
  plannerHref: string;
  syncBusy: boolean;
}) {
  const { enabled, plannerHref, syncBusy } = options;
  const [lastAutoSyncAt, setLastAutoSyncAt] = useState<Date | null>(null);
  const launchCooldownRef = useRef(false);

  const launchAutoSync = useCallback(() => {
    if (!enabled || !plannerHref || syncBusy || launchCooldownRef.current) return false;
    if (helperWindowBusy()) return false;

    const returnUrl = buildPlannerTrialSyncReturnUrl(plannerHref);
    window.open(buildIronwoodTrialSyncLaunchUrl(returnUrl), TRIAL_SYNC_HELPER_WINDOW_NAME);
    setLastAutoSyncAt(new Date());
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
