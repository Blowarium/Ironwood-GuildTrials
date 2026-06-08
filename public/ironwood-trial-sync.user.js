// ==UserScript==
// @name         Ironwood Guild Trials — Trial Sync
// @namespace    ironwood-guild-trials
// @version      1.4.0
// @description  Auto-runs guild trial sync when opened from the trials planner (one-time install).
// @match        https://ironwoodrpg.com/*
// @match        https://www.ironwoodrpg.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function ironwoodGuildTrialsSyncHelper() {
  "use strict";

  var SYNC_RUN_KEY = "igt-trial-sync-run";
  var SYNC_RETURN_KEY = "igt-trial-sync-return";
  var SCRIPT_VERSION = "1.6.0";
  var DEFAULT_APP_ORIGIN = "https://ironwood-guild-trials.vercel.app";

  function appOriginFromSession() {
    try {
      var params = new URLSearchParams(location.search);
      var returnUrl = params.get("igtReturn") || sessionStorage.getItem(SYNC_RETURN_KEY);
      if (returnUrl) return new URL(returnUrl).origin;
    } catch (e) {
      /* ignore */
    }
    return DEFAULT_APP_ORIGIN;
  }

  function installCaptureHook() {
    if (window.__IGT_GUILD_CAPTURE_INSTALLED__) return;
    var origin = appOriginFromSession();
    var script = document.createElement("script");
    script.src = origin + "/ironwood-guild-capture.js?v=" + SCRIPT_VERSION;
    script.onerror = function () {
      /* Inline fallback if external script blocked */
      var code =
        "(function(){if(window.__IGT_GUILD_CAPTURE_INSTALLED__)return;" +
        "var s=document.createElement('script');" +
        "s.src='" +
        origin +
        "/ironwood-guild-capture.js?v=" +
        SCRIPT_VERSION +
        "';" +
        "(document.head||document.documentElement).appendChild(s);})();";
      var el = document.createElement("script");
      el.textContent = code;
      (document.head || document.documentElement).appendChild(el);
      el.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  installCaptureHook();

  function notifyPlannerHelperActive() {
    var msg = { type: "igt-trial-sync-helper-active", v: 1 };
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, "*");
      }
    } catch (e) {
      /* ignore */
    }
    try {
      if (window.opener && !window.opener.closed) {
        var targetOrigin = appOriginFromSession();
        window.opener.postMessage(msg, targetOrigin);
      }
    } catch (e2) {
      /* ignore */
    }
  }

  var params = new URLSearchParams(location.search);
  if (params.get("igtHelperProbe") === "trialSync") {
    notifyPlannerHelperActive();
    return;
  }

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

  function startSync() {
    if (document.getElementById("igt-trial-sync-overlay")) return;
    notifyPlannerHelperActive();
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
