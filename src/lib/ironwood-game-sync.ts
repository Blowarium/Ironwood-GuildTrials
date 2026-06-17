/**
 * Public API for syncing Ironwood in-game guild data into the planner.
 *
 * Implementation lives in ironwood-trial-sync.ts (historical name); this module
 * exposes general-purpose names for UI and apply logic.
 */
export {
  GAME_SYNC_URL_PARAM,
  TRIAL_SYNC_AUTO_INTERVAL_MS,
  TRIAL_SYNC_HELPER_STORAGE_KEY,
  TRIAL_SYNC_HELPER_WINDOW_NAME,
  TRIAL_SYNC_SCRIPT_VERSION,
  buildIronwoodTrialProbeLaunchUrl,
  buildIronwoodTrialSyncConsoleSnippet,
  buildIronwoodTrialSyncHelperProbeUrl,
  buildIronwoodTrialSyncLaunchUrl,
  buildPlannerGameSyncReturnUrl,
  buildStaticIronwoodTrialSyncBookmarklet,
  buildUserscriptTrialSyncInstallUrl,
  decodeTrialSyncPayload,
  encodeTrialSyncPayload,
  isIronwoodOrigin,
  isIronwoodTrialSyncHelperMessage,
  isTrialSyncHelperInstalled,
  markTrialSyncHelperInstalled,
  readGameSyncFromLocation,
  readTrialProbeFromLocation,
  setGuildMemberNames,
  type GameSyncApplyResult,
  type IronwoodGameSyncPayload,
  type IronwoodTrialProbeReport,
} from "./ironwood-trial-sync";
