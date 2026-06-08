// ==UserScript==
// @name         Ironwood Guild Trials — Trial Sync
// @namespace    ironwood-guild-trials
// @version      1.8.3
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
  var SCRIPT_VERSION = "1.8.3";
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

  var probeRun = params.get("igtTrialProbe") === "1";
  if (probeRun) {
    var probeReturnUrl = resolveReturnUrl(params.get("igtReturn"));
    if (!probeReturnUrl) return;

    var probeOrigin = returnOrigin(probeReturnUrl);
    if (!probeOrigin) return;

    function startProbe() {
      if (document.getElementById("igt-trial-probe-overlay")) return;
      notifyPlannerHelperActive();
      if (!document.body) {
        setTimeout(startProbe, 100);
        return;
      }
      var script = document.createElement("script");
      script.src =
        probeOrigin +
        "/ironwood-trial-sync-probe-run.js?v=" +
        SCRIPT_VERSION +
        "&return=" +
        encodeURIComponent(probeReturnUrl);
      document.body.appendChild(script);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startProbe);
    } else {
      startProbe();
    }
    return;
  }

  var resuming = sessionStorage.getItem(SYNC_RUN_KEY) === "1";
  if (params.get("igtTrialSync") !== "1" && !resuming) return;

  var returnUrl = resolveReturnUrl(
    params.get("igtReturn") || (resuming ? sessionStorage.getItem(SYNC_RETURN_KEY) : null),
  );
  if (!returnUrl) return;

  var appOrigin = returnOrigin(returnUrl);
  if (!appOrigin) return;

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
