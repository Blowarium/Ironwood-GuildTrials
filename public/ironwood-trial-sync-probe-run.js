/**
 * Automated trial data probe — runs on ironwoodrpg.com/guild via Tampermonkey helper.
 * Opens Trials, collects diagnostics, returns report to Guild Trials planner.
 */
(function ironwoodTrialProbeRun() {
  if (!/ironwoodrpg\.com$/i.test(location.hostname)) return;

  var TRIAL_MS = 24 * 60 * 60 * 1000;
  var GUILD_PATH = "/guild";

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

  function readObservableValue(subject) {
    if (!subject) return null;
    if (Array.isArray(subject)) return subject;
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

  function scanNgContexts(matcher, limit) {
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

  function findComponent() {
    var full = scanNgContexts(function (obj) {
      return obj && obj.guild$ && (obj.trialSkills$ || obj.getTrial);
    });
    if (full.hit) return full;

    var trialSkillsOnly = scanNgContexts(function (obj) {
      return obj && obj.trialSkills$;
    });
    return { hit: trialSkillsOnly.hit, ngContextCount: trialSkillsOnly.ngContextCount };
  }

  function captureState() {
    return window.__IGT_GUILD_CAPTURE__ || { guild: null, raw: [] };
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

  function clickTrialsTab() {
    var buttons = document.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      var text = (buttons[i].textContent || "").replace(/\s+/g, " ").trim();
      if (text === "Trials" || /^Trials(\s|\(|$)/i.test(text)) {
        buttons[i].click();
        return true;
      }
    }
    return false;
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
    "position:fixed;inset:0;z-index:999999;background:rgba(8,12,22,0.92);color:#e2e8f0;font:14px/1.5 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;";
  overlay.innerHTML =
    '<div style="max-width:440px;text-align:center">' +
    '<p style="font-size:18px;font-weight:600;margin:0 0 8px">Probing trial data</p>' +
    '<p id="igt-trial-probe-status" style="margin:0;color:#94a3b8">Starting…</p>' +
    '<p id="igt-trial-probe-detail" style="margin:12px 0 0;font-size:12px;color:#64748b"></p>' +
    "</div>";
  document.body.appendChild(overlay);

  function setStatus(main, detail) {
    var s = document.getElementById("igt-trial-probe-status");
    var d = document.getElementById("igt-trial-probe-detail");
    if (s) s.textContent = main;
    if (d) d.textContent = detail || "";
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

      for (var wait = 0; wait < 40; wait++) {
        if (guildUiVisible()) break;
        setStatus("Waiting for guild UI…", String(wait + 1) + "/40");
        await sleep(500);
      }

      setStatus("Opening Trials tab…", "");
      clickTrialsTab();
      await sleep(2500);

      var cmpScan = findComponent();
      var cmp = cmpScan.hit;
      var guildFromCmp = cmp && cmp.guild$ ? readObservableValue(cmp.guild$) : null;
      var capture = captureState();
      var guild = guildFromCmp || capture.guild || null;
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
          ngContextNodesWithContext: cmpScan.ngContextCount,
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
