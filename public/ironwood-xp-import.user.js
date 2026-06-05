// ==UserScript==
// @name         Ironwood Guild Trials — XP/h Import
// @namespace    ironwood-guild-trials
// @version      2.2.0
// @description  Auto-runs Guild Trials XP/h import when opened from the trials app (one-time install).
// @match        https://ironwoodrpg.com/*
// @match        https://www.ironwoodrpg.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function ironwoodGuildTrialsXpImportHelper() {
  "use strict";

  var IMPORT_RUN_KEY = "igt-xp-import-run";
  var params = new URLSearchParams(location.search);
  var resuming = sessionStorage.getItem(IMPORT_RUN_KEY) === "1";
  if (params.get("igtXpImport") !== "1" && !resuming) return;

  var returnUrl = params.get("igtReturn");
  var actionPlan = params.get("igtActions");

  if (resuming && !returnUrl) {
    try {
      var saved = JSON.parse(sessionStorage.getItem("igt-xp-import-state") || "null");
      if (saved && saved.returnUrl) returnUrl = saved.returnUrl;
    } catch (e) {
      /* ignore */
    }
  }

  if (!returnUrl) return;

  var appOrigin;
  try {
    appOrigin = new URL(returnUrl).origin;
  } catch (e) {
    return;
  }

  if (document.getElementById("igt-xp-import-overlay")) return;

  function startImport() {
    if (!document.body) {
      setTimeout(startImport, 100);
      return;
    }
    var script = document.createElement("script");
    var src =
      appOrigin + "/ironwood-xp-import.js?v=2.2.0&return=" + encodeURIComponent(returnUrl);
    if (actionPlan) {
      src += "&actions=" + encodeURIComponent(actionPlan);
    }
    if (resuming) {
      src += "&resume=1";
    }
    script.src = src;
    document.body.appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startImport);
  } else {
    startImport();
  }
})();
