"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  persistPendingGameSync,
  readPendingGameSync,
  readStoredGameSyncResult,
} from "./game-sync-session";
import {
  isIronwoodGameSyncPayloadMessage,
  isIronwoodOrigin,
  isIronwoodTrialSyncHelperMessage,
  markTrialSyncHelperInstalled,
  readGameSyncFromLocation,
  TRIAL_SYNC_PLANNER_WINDOW_NAME,
  type IronwoodGameSyncPayload,
} from "./ironwood-game-sync";

const GAME_SYNC_BROADCAST_CHANNEL = "igt-game-sync";

function clearGameSyncFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("gameSync");
  url.searchParams.delete("trialSync");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

export function useGameSyncInbound(options: {
  onReady?: () => void;
  onPayload: (payload: IronwoodGameSyncPayload) => void;
}) {
  const { onReady, onPayload } = options;
  const onReadyRef = useRef(onReady);
  const onPayloadRef = useRef(onPayload);
  const lastImportedAtRef = useRef<string | null>(null);

  onReadyRef.current = onReady;
  onPayloadRef.current = onPayload;

  const acceptPayload = useCallback((payload: IronwoodGameSyncPayload) => {
    if (payload.importedAt && payload.importedAt === lastImportedAtRef.current) return;

    const pending = readPendingGameSync();
    const applied = readStoredGameSyncResult();
    if (
      payload.importedAt &&
      applied?.importedAt === payload.importedAt &&
      !pending
    ) {
      return;
    }

    lastImportedAtRef.current = payload.importedAt;
    persistPendingGameSync(payload);
    markTrialSyncHelperInstalled();
    onReadyRef.current?.();
    onPayloadRef.current(payload);
  }, []);

  const readPayloadFromCurrentUrl = useCallback(() => {
    const payload = readGameSyncFromLocation(window.location.search);
    if (!payload) return;
    acceptPayload(payload);
    clearGameSyncFromUrl();
  }, [acceptPayload]);

  useEffect(() => {
    if (!window.name) window.name = TRIAL_SYNC_PLANNER_WINDOW_NAME;
  }, []);

  useEffect(() => {
    readPayloadFromCurrentUrl();
  }, [readPayloadFromCurrentUrl]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isIronwoodOrigin(event.origin)) return;
      if (isIronwoodGameSyncPayloadMessage(event.data)) {
        acceptPayload(event.data.payload);
        try {
          const channel = new BroadcastChannel(GAME_SYNC_BROADCAST_CHANNEL);
          channel.postMessage(event.data);
          channel.close();
        } catch {
          /* ignore */
        }
        return;
      }
      if (!isIronwoodTrialSyncHelperMessage(event.data)) return;
      markTrialSyncHelperInstalled();
      onReadyRef.current?.();
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [acceptPayload]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(GAME_SYNC_BROADCAST_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      if (!isIronwoodGameSyncPayloadMessage(event.data)) return;
      acceptPayload(event.data.payload);
    };
    return () => channel.close();
  }, [acceptPayload]);

  useEffect(() => {
    function onPageShow() {
      readPayloadFromCurrentUrl();
    }
    function onUrlHandoff() {
      readPayloadFromCurrentUrl();
    }
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("igt-game-sync-url-updated", onUrlHandoff);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("igt-game-sync-url-updated", onUrlHandoff);
    };
  }, [readPayloadFromCurrentUrl]);
}
