// ==UserScript==
// @name         Ironwood Guild Trials — Trial Sync
// @namespace    ironwood-guild-trials
// @version      1.1.0
// @description  Auto-runs guild trial sync when opened from the trials planner (one-time install).
// @match        https://ironwoodrpg.com/*
// @match        https://www.ironwoodrpg.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function ironwoodGuildTrialsSyncHelper() {
  "use strict";

  var SYNC_RUN_KEY = "igt-trial-sync-run";
  var SYNC_RETURN_KEY = "igt-trial-sync-return";
  var SCRIPT_VERSION = "1.1.0";

  var params = new URLSearchParams(location.search);
  var resuming = sessionStorage.getItem(SYNC_RUN_KEY) === "1";
  if (params.get("igtTrialSync") !== "1" && !resuming) return;

  var returnUrl = params.get("igtReturn");
  if (!returnUrl && resuming) {
    returnUrl = sessionStorage.getItem(SYNC_RETURN_KEY);
  }
  if (!returnUrl) return;

  var appOrigin;
  try {
    appOrigin = new URL(returnUrl).origin;
  } catch (e) {
    return;
  }

  if (document.getElementById("igt-trial-sync-overlay")) return;

  function startSync() {
    if (!document.body) {
      setTimeout(startSync, 100);
      return;
    }
    var script = document.createElement("script");
    script.src =
      appOrigin +
      "/ironwood-trial-sync.js?v=" +
      SCRIPT_VERSION +
      "&return=" +
      encodeURIComponent(returnUrl);
    document.body.appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startSync);
  } else {
    startSync();
  }
})();
