/**
 * Automated trial data probe — runs on ironwoodrpg.com/guild via Tampermonkey helper.
 * Uses the same Trials-tab navigation as ironwood-trial-sync.js.
 */
(function ironwoodTrialProbeRun() {
  if (!/ironwoodrpg\.com$/i.test(location.hostname)) return;

  var TRIAL_MS = 24 * 60 * 60 * 1000;
  var GUILD_PATH = "/guild";
  var SCRIPT_VERSION = "1.8.2";

  var scriptEl = document.currentScript;
  var scriptUrl = scriptEl && scriptEl.src ? new URL(scriptEl.src) : null;
  var params = new URLSearchParams(location.search);
  var returnUrl =
    (scriptUrl && scriptUrl.searchParams.get("return")) ||
    params.get("igtReturn") ||
    "";

  if (!returnUrl) {
    alert("Missing return URL. Start the probe from Guild Trials planner.");
    return;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function toBase64Url(obj) {
    var json = JSON.stringify(obj);
    var b64 = btoa(
      encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, function (_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      }),
    );
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function installCaptureHook() {
    if (window.__IGT_GUILD_CAPTURE_INSTALLED__) return;
    var origin;
    try {
      origin = new URL(returnUrl).origin;
    } catch (e) {
      origin = "https://ironwood-guild-trials.vercel.app";
    }
    var script = document.createElement("script");
    script.src = origin + "/ironwood-guild-capture.js?v=" + SCRIPT_VERSION;
    (document.head || document.documentElement).appendChild(script);
  }

  installCaptureHook();

  function readObservableValue(subject) {
    if (!subject) return null;
    if (typeof subject === "object" && !subject.getValue && Array.isArray(subject)) return subject;
    if (typeof subject.getValue === "function") return subject.getValue();
    if (typeof subject.value !== "undefined") return subject.value;
    if (typeof subject._value !== "undefined") return subject._value;
    return null;
  }

  function findInNgContext(obj, seen, depth, matcher) {
    if (!obj || depth > 22) return null;
    if (typeof obj !== "object") return null;
    if (seen.has(obj)) return null;
    seen.add(obj);
    if (matcher(obj)) return obj;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        var hit = findInNgContext(obj[i], seen, depth + 1, matcher);
        if (hit) return hit;
      }
      return null;
    }
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) {
      try {
        var fromKey = findInNgContext(obj[keys[k]], seen, depth + 1, matcher);
        if (fromKey) return fromKey;
      } catch (e) {
        /* skip */
      }
    }
    return null;
  }

  function scanAllNgContexts(matcher, limit) {
    var all = document.querySelectorAll("*");
    var max = Math.min(all.length, limit || 8000);
    var ngContextCount = 0;
    for (var i = 0; i < max; i++) {
      var node = all[i];
      if (!node.__ngContext__) continue;
      ngContextCount++;
      var hit = findInNgContext(node.__ngContext__, new WeakSet(), 0, matcher);
      if (hit) return { hit: hit, ngContextCount: ngContextCount };
    }
    return { hit: null, ngContextCount: ngContextCount };
  }

  function findGuildTrialsComponent() {
    function isHost(obj) {
      return Boolean(
        obj && obj.guild$ && (obj.trialSkills$ || obj.getTrial || obj.changeTab),
      );
    }
    function isTrialSkillsHost(obj) {
      return Boolean(obj && obj.trialSkills$);
    }

    var selectors = ["guild-component", "guild-page", "app-guild", "app-root"];
    for (var s = 0; s < selectors.length; s++) {
      var nodes = document.querySelectorAll(selectors[s]);
      for (var n = 0; n < nodes.length; n++) {
        var el = nodes[n];
        if (typeof window.ng !== "undefined" && typeof window.ng.getComponent === "function") {
          try {
            var cmp = window.ng.getComponent(el);
            if (cmp && (isHost(cmp) || isTrialSkillsHost(cmp))) return cmp;
          } catch (e) {
            /* continue */
          }
        }
        if (el.__ngContext__) {
          var lView = el.__ngContext__;
          if (Array.isArray(lView)) {
            for (var li = 0; li < lView.length; li++) {
              var item = lView[li];
              if (item && (isHost(item) || isTrialSkillsHost(item))) return item;
            }
          }
          var fromCtx = findInNgContext(el.__ngContext__, new WeakSet(), 0, isHost);
          if (fromCtx) return fromCtx;
          fromCtx = findInNgContext(el.__ngContext__, new WeakSet(), 0, isTrialSkillsHost);
          if (fromCtx) return fromCtx;
        }
      }
    }

    var full = scanAllNgContexts(isHost, 8000);
    if (full.hit) return full.hit;
    return scanAllNgContexts(isTrialSkillsHost, 8000).hit;
  }

  function countNgContextNodes(limit) {
    var all = document.querySelectorAll("*");
    var max = Math.min(all.length, limit || 8000);
    var count = 0;
    for (var i = 0; i < max; i++) {
      if (all[i].__ngContext__) count++;
    }
    return count;
  }

  function captureState() {
    return window.__IGT_GUILD_CAPTURE__ || { guild: null, raw: [] };
  }

  function guildFromCaptureRaw() {
    var raw = captureState().raw || [];
    for (var i = raw.length - 1; i >= 0; i--) {
      var d = raw[i].d;
      if (!d) continue;
      if (d.value && d.value.guild && d.value.guild.trial) return d.value.guild;
      if (d.guild && d.guild.trial) return d.guild;
      if (d.trial && d.trial.members) return { trial: d.trial };
    }
    return null;
  }

  function inferStart(endDate) {
    var end = new Date(endDate).getTime();
    if (Number.isNaN(end)) return null;
    return new Date(end - TRIAL_MS).toISOString();
  }

  function guildUiVisible() {
    var text = document.body ? document.body.innerText || "" : "";
    return /Members/i.test(text) && (/Trials/i.test(text) || /Quests/i.test(text));
  }

  function trialsTabActive() {
    var text = document.body ? document.body.innerText || "" : "";
    if (/Required\s+(Exp|XP)/i.test(text)) return true;
    if (/Trial\s+Hall/i.test(text)) return true;
    if (/Guild\s+Credits/i.test(text) && /Woodcutting|Mining|Exploring/i.test(text)) return true;
    var activeBtn = document.querySelector("button.active, button[aria-selected='true']");
    if (activeBtn && /Trials/i.test(activeBtn.textContent || "")) return true;
    return false;
  }

  function clickTrialsTabDom() {
    var scopes = [
      document.querySelector("guild-component"),
      document.querySelector("guild-page"),
      document.body,
    ];
    for (var s = 0; s < scopes.length; s++) {
      var scope = scopes[s];
      if (!scope) continue;
      var buttons = scope.querySelectorAll("button");
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        var text = (btn.textContent || "").replace(/\s+/g, " ").trim();
        if (text === "Trials" || /^Trials(\s|\(|$)/i.test(text)) {
          btn.click();
          return true;
        }
      }
      var labels = scope.querySelectorAll("div, span");
      for (var j = 0; j < labels.length; j++) {
        var node = labels[j];
        if ((node.textContent || "").trim() !== "Trials") continue;
        if (node.children && node.children.length > 0) continue;
        var parentBtn = node.closest("button");
        if (parentBtn) {
          parentBtn.click();
          return true;
        }
      }
    }
    return false;
  }

  function navigateToTrialsTab(host) {
    if (host && host.changeTab && host.GuildTabEnum && host.GuildTabEnum.Trials != null) {
      try {
        host.changeTab(host.GuildTabEnum.Trials);
        return "changeTab";
      } catch (e) {
        /* fall through */
      }
    }
    return clickTrialsTabDom() ? "domClick" : "none";
  }

  async function triggerTrialLoad(host) {
    if (host && typeof host.getTrial === "function") {
      try {
        var result = host.getTrial();
        if (result && typeof result.then === "function") {
          await result;
          return "getTrial";
        }
      } catch (e) {
        /* fall through */
      }
    }
    return navigateToTrialsTab(host);
  }

  function collectAssignments(cmp, guild, capture) {
    var out = [];
    var trial = (guild && guild.trial) || null;

    if (cmp && cmp.trialSkills$) {
      var rows = readObservableValue(cmp.trialSkills$) || [];
      for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        var members = row.members || [];
        if (!Array.isArray(members) && members && typeof members === "object") {
          members = Object.values(members);
        }
        for (var mi = 0; mi < members.length; mi++) {
          var m = members[mi];
          out.push({
            displayName: m.displayName,
            skillId: m.skillId != null ? m.skillId : row.id,
            exp: m.exp,
            endDate: m.endDate || null,
            inferredStartAt: m.endDate ? inferStart(m.endDate) : null,
            source: "trialSkills$",
          });
        }
      }
    }

    if (trial && trial.members) {
      Object.values(trial.members).forEach(function (m) {
        out.push({
          displayName: m.displayName,
          skillId: m.skillId,
          exp: m.exp,
          endDate: m.endDate || null,
          inferredStartAt: m.endDate ? inferStart(m.endDate) : null,
          source: "guild.trial.members",
        });
      });
    }

    if (capture && capture.guild && capture.guild.trial && capture.guild.trial.members) {
      Object.values(capture.guild.trial.members).forEach(function (m) {
        out.push({
          displayName: m.displayName,
          skillId: m.skillId,
          exp: m.exp,
          endDate: m.endDate || null,
          inferredStartAt: m.endDate ? inferStart(m.endDate) : null,
          source: "capture.guild.trial.members",
        });
      });
    }

    return out;
  }

  function dedupeAssignments(list) {
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var key = a.displayName + "|" + String(a.skillId) + "|" + String(a.source);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(a);
    }
    return out;
  }

  var overlay = document.createElement("div");
  overlay.id = "igt-trial-probe-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:999999;background:rgba(8,12,22,0.92);color:#e2e8f0;font:14px/1.5 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:none;";
  overlay.innerHTML =
    '<div style="max-width:440px;text-align:center;pointer-events:auto;background:rgba(15,23,42,0.95);border:1px solid rgba(148,163,184,0.25);border-radius:12px;padding:20px 24px;box-shadow:0 8px 32px rgba(0,0,0,0.4)">' +
    '<p style="font-size:18px;font-weight:600;margin:0 0 8px">Probing trial data</p>' +
    '<p id="igt-trial-probe-status" style="margin:0;color:#94a3b8">Starting…</p>' +
    '<p id="igt-trial-probe-detail" style="margin:12px 0 0;font-size:12px;color:#64748b"></p>' +
    "</div>";
  document.body.appendChild(overlay);

  function setOverlayWatchMode(watch) {
    overlay.style.background = watch ? "rgba(8,12,22,0.15)" : "rgba(8,12,22,0.92)";
    overlay.style.pointerEvents = "none";
  }

  function setStatus(main, detail) {
    var s = document.getElementById("igt-trial-probe-status");
    var d = document.getElementById("igt-trial-probe-detail");
    if (s) s.textContent = main;
    if (d) d.textContent = detail || "";
  }

  async function ensureTrialsOpen() {
    var host = findGuildTrialsComponent();
    var navigationMethod = "none";
    var trialsTabClickAttempted = false;

    setOverlayWatchMode(true);
    setStatus("Opening Trials tab…", "You should see the guild page switch tabs.");

    navigationMethod = await triggerTrialLoad(host);
    trialsTabClickAttempted = navigationMethod !== "none";
    await sleep(1200);

    for (var attempt = 0; attempt < 45; attempt++) {
      host = findGuildTrialsComponent() || host;

      if (trialsTabActive()) {
        setStatus("Trials tab open", "Reading trial data…");
        break;
      }

      if (attempt === 3 || attempt === 8 || attempt === 15 || attempt === 25) {
        navigationMethod = await triggerTrialLoad(host);
        if (navigationMethod !== "none") trialsTabClickAttempted = true;
        await sleep(900);
      }

      var capture = captureState();
      var guild =
        (host && host.guild$ ? readObservableValue(host.guild$) : null) ||
        capture.guild ||
        guildFromCaptureRaw();
      var cmp = host || findGuildTrialsComponent();
      var assignments = dedupeAssignments(collectAssignments(cmp, guild, capture));

      if (assignments.length > 0) {
        setStatus("Trial data detected", assignments.length + " assignment row(s) found.");
        break;
      }

      setStatus(
        "Opening Trials tab…",
        "attempt " +
          (attempt + 1) +
          "/45 · tabActive=" +
          (trialsTabActive() ? "yes" : "no") +
          " · capture=" +
          (capture.raw || []).length,
      );
      await sleep(600);
    }

    setOverlayWatchMode(false);
    return {
      navigationMethod: navigationMethod,
      trialsTabClickAttempted: trialsTabClickAttempted,
      trialsTabActive: trialsTabActive(),
    };
  }

  async function run() {
    try {
      if (location.pathname.replace(/\/$/, "") !== GUILD_PATH) {
        setStatus("Opening guild page…", GUILD_PATH);
        var next = new URL(location.origin + GUILD_PATH);
        next.searchParams.set("igtTrialProbe", "1");
        next.searchParams.set("igtReturn", returnUrl);
        location.assign(next.toString());
        return;
      }

      for (var wait = 0; wait < 60; wait++) {
        if (guildUiVisible()) break;
        setStatus("Waiting for guild UI…", String(wait + 1) + "/60");
        await sleep(500);
      }

      if (!guildUiVisible()) {
        setStatus("Guild UI not visible", "Log in and open your guild, then try again.");
        await sleep(5000);
        return;
      }

      var nav = await ensureTrialsOpen();
      await sleep(1500);

      var cmp = findGuildTrialsComponent();
      var capture = captureState();
      var guildFromCmp = cmp && cmp.guild$ ? readObservableValue(cmp.guild$) : null;
      var guild = guildFromCmp || capture.guild || guildFromCaptureRaw() || null;
      var trial = guild && guild.trial ? guild.trial : null;
      var trialSkills = cmp && cmp.trialSkills$ ? readObservableValue(cmp.trialSkills$) : null;
      var trialSkillsRows = Array.isArray(trialSkills) ? trialSkills.length : 0;
      var trialSkillsMembers = 0;
      if (Array.isArray(trialSkills)) {
        for (var ts = 0; ts < trialSkills.length; ts++) {
          var mem = trialSkills[ts].members || [];
          if (Array.isArray(mem)) trialSkillsMembers += mem.length;
          else if (mem && typeof mem === "object") trialSkillsMembers += Object.keys(mem).length;
        }
      }

      var assignments = dedupeAssignments(collectAssignments(cmp, guild, capture));
      var withEndDate = assignments.filter(function (a) {
        return a.endDate;
      });

      var captureUrls = (capture.raw || []).slice(-5).map(function (r) {
        return r.url;
      });

      var report = {
        v: 1,
        importedAt: new Date().toISOString(),
        pageUrl: location.href,
        diagnostics: {
          componentFound: Boolean(cmp),
          hasGuildObservable: Boolean(cmp && cmp.guild$),
          hasTrialSkillsObservable: Boolean(cmp && cmp.trialSkills$),
          hasGetTrial: Boolean(cmp && typeof cmp.getTrial === "function"),
          ngGetComponentAvailable: Boolean(
            typeof window.ng !== "undefined" && typeof window.ng.getComponent === "function",
          ),
          ngContextNodesWithContext: countNgContextNodes(8000),
          guildTrialOnGuildObject: Boolean(trial),
          trialMembersOnGuildTrial: trial && trial.members ? Object.keys(trial.members).length : 0,
          trialSkillsRowCount: trialSkillsRows,
          trialSkillsMemberCount: trialSkillsMembers,
          captureHookInstalled: Boolean(window.__IGT_GUILD_CAPTURE_INSTALLED__),
          captureRawResponses: (capture.raw || []).length,
          captureHasGuildTrial: Boolean(capture.guild && capture.guild.trial),
          assignmentRowsCollected: assignments.length,
          assignmentsWithEndDate: withEndDate.length,
          guildUiVisible: guildUiVisible(),
          trialsTabActive: nav.trialsTabActive,
          trialsTabClickAttempted: nav.trialsTabClickAttempted,
          navigationMethod: nav.navigationMethod,
        },
        trialMeta: trial
          ? {
              startDate: trial.startDate || null,
              endDate: trial.endDate || null,
              requiredExp: trial.requiredExp != null ? trial.requiredExp : null,
            }
          : null,
        assignments: assignments.slice(0, 40),
        samples: {
          captureUrls: captureUrls,
          trialMemberKeys:
            trial && trial.members ? Object.keys(trial.members).slice(0, 12) : [],
        },
      };

      setStatus(
        "Done! Returning to Guild Trials…",
        report.diagnostics.assignmentRowsCollected +
          " assignment row(s), " +
          report.diagnostics.assignmentsWithEndDate +
          " with endDate",
      );

      var sep = returnUrl.indexOf("?") >= 0 ? "&" : "?";
      var destination = returnUrl + sep + "trialProbe=" + encodeURIComponent(toBase64Url(report));
      await sleep(700);
      location.href = destination;
    } catch (err) {
      setStatus("Probe failed", err && err.message ? err.message : String(err));
    }
  }

  run();
})();
