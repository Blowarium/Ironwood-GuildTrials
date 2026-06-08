// ==UserScript==
// @name         Ironwood Guild Trials — Trial Sync
// @namespace    ironwood-guild-trials
// @version      1.9.4
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
  var PROBE_RUN_KEY = "igt-trial-probe-run";
  var SCRIPT_VERSION = "1.9.4";
  var DEFAULT_APP_ORIGIN = "https://ironwood-guild-trials.vercel.app";

  function resolveReturnUrl(raw) {
    if (!raw) return null;
    try {
      return new URL(raw).href;
    } catch (e) {
      try {
        return new URL(raw, DEFAULT_APP_ORIGIN).href;
      } catch (e2) {
        return null;
      }
    }
  }

  function returnOrigin(raw) {
    var resolved = resolveReturnUrl(raw);
    if (!resolved) return null;
    try {
      return new URL(resolved).origin;
    } catch (e) {
      return null;
    }
  }

  function appOriginFromSession() {
    try {
      var params = new URLSearchParams(location.search);
      var returnUrl =
        resolveReturnUrl(params.get("igtReturn")) ||
        resolveReturnUrl(sessionStorage.getItem(SYNC_RETURN_KEY));
      if (returnUrl) return new URL(returnUrl).origin;
    } catch (e) {
      /* ignore */
    }
    return DEFAULT_APP_ORIGIN;
  }

  function installCaptureHook() {
    if (window.__IGT_GUILD_CAPTURE_INSTALLED__) return;
    window.__IGT_GUILD_CAPTURE_INSTALLED__ = 1;

    var capture = { guild: null, raw: [], urls: [] };
    window.__IGT_GUILD_CAPTURE__ = capture;

    function absorb(data) {
      if (!data) return;
      var g = data;
      var trial = null;
      if (data.value && data.value.guild) {
        g = data.value.guild;
        trial = data.value.trial || null;
      } else if (data.guild) {
        g = data.guild;
        trial = data.trial || null;
      } else if (data.trial && !data.name && !data.id) {
        trial = data.trial;
        g = null;
      }
      if (!capture.guild) capture.guild = {};
      if (g && (g.name || g.id || g.members || g.trial)) {
        capture.guild = Object.assign({}, capture.guild, g);
      }
      if (trial) capture.guild.trial = trial;
      else if (g && g.trial) capture.guild.trial = g.trial;
    }

    function shouldCaptureUrl(url) {
      var u = String(url || "");
      if (/getGuild/i.test(u)) return true;
      if (/GuildTrial/i.test(u)) return true;
      if (/cloudfunctions\.net/i.test(u)) return true;
      if (/\/guild/i.test(u)) return true;
      return false;
    }

    function looksLikeTrialJson(text) {
      if (!text || text.length < 12) return false;
      return text.indexOf('"trial"') >= 0 && text.indexOf('"members"') >= 0;
    }

    function rememberUrl(url) {
      if (!url) return;
      capture.urls.push(String(url));
      if (capture.urls.length > 30) capture.urls.shift();
    }

    function inspect(text, url) {
      if (!text) return;
      if (!shouldCaptureUrl(url) && !looksLikeTrialJson(text)) return;
      try {
        var d = JSON.parse(text);
        capture.raw.push({ url: url || "", d: d });
        absorb(d);
      } catch (e) {
        /* ignore */
      }
    }

    var oOpen = XMLHttpRequest.prototype.open;
    var oSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) {
      this.__igtUrl = String(u || "");
      return oOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      var x = this;
      x.addEventListener("load", function () {
        rememberUrl(x.__igtUrl);
        inspect(x.responseText, x.__igtUrl);
      });
      x.addEventListener("readystatechange", function () {
        if (x.readyState === 4) {
          rememberUrl(x.__igtUrl);
          inspect(x.responseText, x.__igtUrl);
        }
      });
      return oSend.apply(this, arguments);
    };

    if (window.fetch) {
      var oFetch = window.fetch;
      window.fetch = function (input, init) {
        var u = typeof input === "string" ? input : (input && input.url) || "";
        rememberUrl(u);
        return oFetch.apply(this, arguments).then(function (res) {
          res
            .clone()
            .text()
            .then(function (t) {
              inspect(t, u);
            })
            .catch(function () {});
          return res;
        });
      };
    }
  }

  try {
    installCaptureHook();
  } catch (e) {
    /* capture hook failed — sync/probe can still run */
  }

  function mountTarget() {
    return document.body || document.documentElement;
  }

  function showBootstrapOverlay(title, status, detail) {
    var id = "igt-trial-helper-bootstrap";
    var overlay = document.getElementById(id);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = id;
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:2147483646;background:rgba(8,12,22,0.92);color:#e2e8f0;font:14px/1.5 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:none;";
      overlay.innerHTML =
        '<div style="max-width:440px;text-align:center;pointer-events:auto;background:rgba(15,23,42,0.95);border:1px solid rgba(148,163,184,0.25);border-radius:12px;padding:20px 24px;box-shadow:0 8px 32px rgba(0,0,0,0.4)">' +
        '<p id="igt-trial-helper-title" style="font-size:18px;font-weight:600;margin:0 0 8px"></p>' +
        '<p id="igt-trial-helper-status" style="margin:0;color:#94a3b8"></p>' +
        '<p id="igt-trial-helper-detail" style="margin:12px 0 0;font-size:12px;color:#64748b"></p>' +
        "</div>";
      var target = mountTarget();
      if (target) target.appendChild(overlay);
    }
    var t = document.getElementById("igt-trial-helper-title");
    var s = document.getElementById("igt-trial-helper-status");
    var d = document.getElementById("igt-trial-helper-detail");
    if (t) t.textContent = title;
    if (s) s.textContent = status;
    if (d) d.textContent = detail || "";
    return overlay;
  }

  function ensureBootstrapOverlay(title, status, detail) {
    var overlay = showBootstrapOverlay(title, status, detail);
    if (overlay && overlay.parentNode) return overlay;
    window.setTimeout(function () {
      ensureBootstrapOverlay(title, status, detail);
    }, 50);
    return null;
  }

  function loadAppScript(scriptPath, returnUrl, title) {
    var appOrigin = returnOrigin(returnUrl) || DEFAULT_APP_ORIGIN;
    ensureBootstrapOverlay(title, "Loading helper script…", appOrigin);

    function inject() {
      var loadKey = scriptPath + "|" + returnUrl;
      if (window.__IGT_REMOTE_SCRIPT_KEY__ === loadKey) return;
      window.__IGT_REMOTE_SCRIPT_KEY__ = loadKey;

      var script = document.createElement("script");
      script.src =
        appOrigin +
        scriptPath +
        "?v=" +
        SCRIPT_VERSION +
        "&return=" +
        encodeURIComponent(returnUrl);
      script.onload = function () {
        showBootstrapOverlay(title, "Helper script loaded", "Continuing…");
      };
      script.onerror = function () {
        window.__IGT_REMOTE_SCRIPT_KEY__ = "";
        showBootstrapOverlay(
          title,
          "Could not load helper script",
          "Tampermonkey blocked " +
            appOrigin +
            ". Reinstall the helper (v" +
            SCRIPT_VERSION +
            ") or disable ad blockers for Ironwood.",
        );
      };
      (document.body || document.documentElement).appendChild(script);
    }

    if (document.body) {
      inject();
    } else {
      document.addEventListener("DOMContentLoaded", inject);
      window.setTimeout(inject, 250);
    }
  }

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

  if (params.get("igtTrialProbe") === "1") {
    sessionStorage.setItem(PROBE_RUN_KEY, "1");
    var probeReturnFromUrl = resolveReturnUrl(params.get("igtReturn"));
    if (probeReturnFromUrl) sessionStorage.setItem(SYNC_RETURN_KEY, probeReturnFromUrl);
  }

  var probeRun =
    params.get("igtTrialProbe") === "1" || sessionStorage.getItem(PROBE_RUN_KEY) === "1";
  if (probeRun) {
    var probeReturnUrl =
      resolveReturnUrl(params.get("igtReturn")) ||
      resolveReturnUrl(sessionStorage.getItem(SYNC_RETURN_KEY));
    if (!probeReturnUrl) {
      ensureBootstrapOverlay(
        "Trial data probe",
        "Missing return URL",
        "Start the probe from Guild Trials planner.",
      );
      return;
    }

    notifyPlannerHelperActive();
    loadAppScript("/ironwood-trial-sync-probe-run.js", probeReturnUrl, "Probing trial data");
    return;
  }

  if (params.get("igtTrialSync") === "1") {
    sessionStorage.setItem(SYNC_RUN_KEY, "1");
    var syncReturnFromUrl = resolveReturnUrl(params.get("igtReturn"));
    if (syncReturnFromUrl) sessionStorage.setItem(SYNC_RETURN_KEY, syncReturnFromUrl);
  }

  var resuming = sessionStorage.getItem(SYNC_RUN_KEY) === "1";
  if (params.get("igtTrialSync") !== "1" && !resuming) return;

  var returnUrl =
    resolveReturnUrl(params.get("igtReturn")) ||
    resolveReturnUrl(sessionStorage.getItem(SYNC_RETURN_KEY));
  if (!returnUrl) {
    ensureBootstrapOverlay(
      "Syncing guild trials",
      "Missing return URL",
      "Start sync from Guild Trials planner.",
    );
    return;
  }

  notifyPlannerHelperActive();
  loadAppScript("/ironwood-trial-sync.js", returnUrl, "Syncing guild trials");
})();
