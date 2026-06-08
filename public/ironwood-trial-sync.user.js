// ==UserScript==
// @name         Ironwood Guild Trials — Trial Sync
// @namespace    ironwood-guild-trials
// @version      1.0.0
// @description  Auto-runs guild trial sync when opened from the trials planner (one-time install).
// @match        https://ironwoodrpg.com/*
// @match        https://www.ironwoodrpg.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function ironwoodGuildTrialsSyncHelper() {
  "use strict";

  var params = new URLSearchParams(location.search);
  if (params.get("igtTrialSync") !== "1") return;

  var returnUrl = params.get("igtReturn");
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
      appOrigin + "/ironwood-trial-sync.js?return=" + encodeURIComponent(returnUrl);
    document.body.appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startSync);
  } else {
    startSync();
  }
})();
