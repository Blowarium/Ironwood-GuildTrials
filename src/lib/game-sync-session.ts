import type { GameSyncApplyResult, IronwoodGameSyncPayload } from "./ironwood-game-sync";

const PENDING_KEY = "igt-game-sync-pending";
const RESULT_KEY = "igt-last-game-sync-result";
const DISMISSED_IMPORTED_AT_KEY = "igt-game-sync-dismissed-imported-at";
const AUTO_SYNC_LAUNCHED_KEY = "igt-game-sync-auto-launched-at";

type StoredPendingGameSync = {
  payload: IronwoodGameSyncPayload;
  receivedAt: string;
};

export type StoredGameSyncResult = {
  importedAt: string;
  weekStart: string;
  appliedAt: string;
  result: GameSyncApplyResult;
};

function readJson<T>(key: string): T | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
}

function remove(key: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function persistPendingGameSync(payload: IronwoodGameSyncPayload): void {
  writeJson(PENDING_KEY, {
    payload,
    receivedAt: new Date().toISOString(),
  } satisfies StoredPendingGameSync);
}

export function readPendingGameSync(): StoredPendingGameSync | null {
  const stored = readJson<StoredPendingGameSync>(PENDING_KEY);
  if (!stored?.payload?.v || !Array.isArray(stored.payload.skills)) return null;
  return stored;
}

export function clearPendingGameSync(): void {
  remove(PENDING_KEY);
}

export function persistGameSyncResult(
  importedAt: string,
  weekStart: string,
  result: GameSyncApplyResult,
): void {
  clearPendingGameSync();
  writeJson(RESULT_KEY, {
    importedAt,
    weekStart,
    appliedAt: new Date().toISOString(),
    result,
  } satisfies StoredGameSyncResult);
}

export function readStoredGameSyncResult(): StoredGameSyncResult | null {
  const stored = readJson<StoredGameSyncResult>(RESULT_KEY);
  if (!stored?.importedAt || !stored.weekStart || !stored.result) return null;
  return stored;
}

export function readDismissedGameSyncImportedAt(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(DISMISSED_IMPORTED_AT_KEY);
}

export function persistDismissedGameSyncImportedAt(importedAt: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(DISMISSED_IMPORTED_AT_KEY, importedAt);
  } catch {
    /* ignore */
  }
}

export function shouldShowStoredGameSyncResult(stored: StoredGameSyncResult): boolean {
  return stored.importedAt !== readDismissedGameSyncImportedAt();
}

export function persistAutoSyncLaunchAt(at: Date): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(AUTO_SYNC_LAUNCHED_KEY, at.toISOString());
  } catch {
    /* ignore */
  }
}

export function readAutoSyncLaunchAt(): Date | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(AUTO_SYNC_LAUNCHED_KEY);
  if (!raw) return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

export function gameSyncResultHasVisibleContent(result: GameSyncApplyResult): boolean {
  if (result.skipped.length > 0) return true;
  if (result.buildingMaterialsApplied?.length) return true;
  if (result.buildingMaterialsError) return true;
  return (
    result.created.length +
      result.updated.length +
      result.unchanged.length +
      result.errors.length +
      result.completionsMarked.length +
      result.completionsUnmarked.length +
      result.completionErrors.length >
    0
  );
}
