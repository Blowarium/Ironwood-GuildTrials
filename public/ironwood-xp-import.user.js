// ==UserScript==
// @name         Ironwood Guild Trials — XP/h Import
// @namespace    ironwood-guild-trials
// @version      1.0.11
// @description  Auto-runs Guild Trials XP/h import when opened from the trials app (one-time install).
// @match        https://ironwoodrpg.com/*
// @match        https://www.ironwoodrpg.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function ironwoodGuildTrialsXpImportHelper() {
  "use strict";

  var params = new URLSearchParams(location.search);
  if (params.get("igtXpImport") !== "1") return;

  var returnUrl = params.get("igtReturn");
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
    script.src =
      appOrigin + "/ironwood-xp-import.js?v=1.0.11&return=" + encodeURIComponent(returnUrl);
    document.body.appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startImport);
  } else {
    startImport();
  }
})();
