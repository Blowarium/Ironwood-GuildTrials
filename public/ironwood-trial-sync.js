/**
 * Runs on https://ironwoodrpg.com/guild via userscript or bookmarklet.
 * Captures getGuild/getGuildTrial API data, opens Trials tab, syncs to planner.
 */
(function ironwoodGuildTrialsSync() {
  if (!/ironwoodrpg\.com$/i.test(location.hostname)) {
    alert("Guild Trials sync must be run on ironwoodrpg.com while logged in.");
    return;
  }

  var TRIAL_MS = 24 * 60 * 60 * 1000;
  var GUILD_PATH = "/guild";
  var SYNC_RUN_KEY = "igt-trial-sync-run";
  var SYNC_RETURN_KEY = "igt-trial-sync-return";

  var SKILL_ORDER = [
    "Woodcutting",
    "Mining",
    "Smelting",
    "Smithing",
    "Enchanting",
    "Farming",
    "Alchemy",
    "Fishing",
    "Cooking",
    "Delving",
    "Imbuing",
    "Exploring",
    "One-handed",
    "Two-handed",
    "Ranged",
    "Defense",
  ];

  var scriptEl = document.currentScript;
  var scriptUrl = scriptEl && scriptEl.src ? new URL(scriptEl.src) : null;
  var params = new URLSearchParams(location.search);
  var returnUrl =
    (scriptUrl && scriptUrl.searchParams.get("return")) ||
    params.get("igtReturn") ||
    sessionStorage.getItem(SYNC_RETURN_KEY) ||
    "";

  if (!returnUrl) {
    alert(
      "Missing return URL. Start sync from the Guild Trials planner so the link includes where to send trial data.",
    );
    return;
  }

  sessionStorage.setItem(SYNC_RETURN_KEY, returnUrl);
  sessionStorage.setItem(SYNC_RUN_KEY, "1");

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function normalizedPath() {
    var path = location.pathname.replace(/\/$/, "");
    return path || "/";
  }

  function onGuildPage() {
    return normalizedPath() === GUILD_PATH;
  }

  function guildUrlWithParams() {
    var next = new URL(location.origin + GUILD_PATH);
    next.searchParams.set("igtTrialSync", "1");
    next.searchParams.set("igtReturn", returnUrl);
    return next.toString();
  }

  function installCaptureHook() {
    if (window.__IGT_GUILD_CAPTURE_INSTALLED__) return;
    window.__IGT_GUILD_CAPTURE_INSTALLED__ = 1;
    var capture = { guild: null, raw: [] };
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

    function inspect(text, url) {
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
        var u = x.__igtUrl || "";
        if (/getGuild/i.test(u)) inspect(x.responseText, u);
      });
      return oSend.apply(this, arguments);
    };

    if (window.fetch) {
      var oFetch = window.fetch;
      window.fetch = function (input, init) {
        var u = typeof input === "string" ? input : (input && input.url) || "";
        return oFetch.apply(this, arguments).then(function (res) {
          if (/getGuild/i.test(u)) {
            res
              .clone()
              .text()
              .then(function (t) {
                inspect(t, u);
              })
              .catch(function () {});
          }
          return res;
        });
      };
    }
  }

  installCaptureHook();

  function captureState() {
    return window.__IGT_GUILD_CAPTURE__ || { guild: null };
  }

  function guildLooksLoaded(guild) {
    if (!guild) return false;
    if (guild.name || guild.id) return true;
    if (guild.trial) return true;
    if (guild.members) return true;
    return false;
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
    if (typeof subject.getValue === "function") return subject.getValue();
    if (typeof subject.value !== "undefined") return subject.value;
    return null;
  }

  function findInNgContext(obj, seen, depth, matcher) {
    if (!obj || depth > 20) return null;
    if (typeof obj !== "object") return null;
    if (seen.has(obj)) return null;
    seen.add(obj);
    if (matcher(obj)) return obj;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        var fromArray = findInNgContext(obj[i], seen, depth + 1, matcher);
        if (fromArray) return fromArray;
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

  function scanPageContext(matcher) {
    var roots = [
      document.querySelector("guild-component"),
      document.querySelector("guild-page"),
      document.querySelector("app-root"),
    ];
    for (var r = 0; r < roots.length; r++) {
      var el = roots[r];
      if (!el) continue;
      if (el.__ngContext__) {
        var fromCtx = findInNgContext(el.__ngContext__, new WeakSet(), 0, matcher);
        if (fromCtx) return fromCtx;
      }
      if (typeof window.ng !== "undefined" && typeof window.ng.getComponent === "function") {
        try {
          var fromNg = window.ng.getComponent(el);
          if (matcher(fromNg)) return fromNg;
        } catch (e2) {
          /* continue */
        }
      }
    }

    var all = document.querySelectorAll("*");
    var limit = Math.min(all.length, 2500);
    for (var i = 0; i < limit; i++) {
      var node = all[i];
      if (!node.__ngContext__) continue;
      var hit = findInNgContext(node.__ngContext__, new WeakSet(), 0, matcher);
      if (hit) return hit;
    }
    return null;
  }

  function isGuildHost(obj) {
    return Boolean(
      obj &&
        obj.guild$ &&
        typeof obj.changeTab === "function" &&
        typeof obj.getTrial === "function",
    );
  }

  function findGuildHost() {
    return scanPageContext(isGuildHost);
  }

  function findSkillDataMap() {
    var host = findGuildHost();
    if (host && host.SKILL_DATA) return host.SKILL_DATA;
    var skillHost = scanPageContext(function (obj) {
      return obj && obj.SKILL_DATA && typeof obj.SKILL_DATA === "object";
    });
    return skillHost && skillHost.SKILL_DATA ? skillHost.SKILL_DATA : null;
  }

  function readGuildFromHost(host) {
    if (!host) return null;
    if (host.guild) return host.guild;
    return readObservableValue(host.guild$);
  }

  function readGuildFromAnySource() {
    var capture = captureState().guild;
    if (capture && capture.trial) return capture;
    var host = findGuildHost();
    var fromHost = readGuildFromHost(host);
    if (fromHost && fromHost.trial) return fromHost;
    if (capture && guildLooksLoaded(capture)) return capture;
    if (fromHost && guildLooksLoaded(fromHost)) return fromHost;
    return capture || fromHost;
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
        return true;
      } catch (e) {
        /* fall through */
      }
    }
    return clickTrialsTabDom();
  }

  async function triggerTrialLoad(host) {
    if (host && typeof host.getTrial === "function") {
      try {
        var result = host.getTrial();
        if (result && typeof result.then === "function") {
          await result;
          return true;
        }
      } catch (e) {
        /* fall through */
      }
    }
    navigateToTrialsTab(host);
    return false;
  }

  function skillNameFromId(skillData, skillId) {
    if (!skillData) return null;
    var data = skillData[skillId];
    return data && data.name ? data.name : null;
  }

  function inferStart(endDate) {
    var end = new Date(endDate).getTime();
    if (Number.isNaN(end)) return new Date(0).toISOString();
    return new Date(end - TRIAL_MS).toISOString();
  }

  function guildWeekStartFromInstant(iso) {
    var GUILD_OFFSET_MS = 2 * 60 * 60 * 1000;
    var t = new Date(iso).getTime() + GUILD_OFFSET_MS;
    var d = new Date(t);
    var y = d.getUTCFullYear();
    var m = d.getUTCMonth();
    var day = d.getUTCDate();
    var dow = d.getUTCDay();
    var mondayDelta = dow === 0 ? -6 : 1 - dow;
    var mondayUtc = Date.UTC(y, m, day + mondayDelta, 0, 0, 0);
    var gd = new Date(mondayUtc);
    var yy = gd.getUTCFullYear();
    var mm = String(gd.getUTCMonth() + 1).padStart(2, "0");
    var dd = String(gd.getUTCDate()).padStart(2, "0");
    return yy + "-" + mm + "-" + dd;
  }

  function calcCreditProgress(skills, requiredExp, creditReward) {
    var earned = 0;
    var max = 0;
    for (var i = 0; i < skills.length; i++) {
      max += creditReward;
      var ratio = Math.min(Math.floor((skills[i].currentExp / requiredExp) * 10) / 10, 1);
      earned += Math.round(creditReward * ratio);
    }
    return { earned: earned, max: max };
  }

  function countCompleted(skills, requiredExp) {
    var n = 0;
    for (var i = 0; i < skills.length; i++) {
      if (skills[i].currentExp >= requiredExp) n++;
    }
    return n;
  }

  function buildPayload(guild, skillData) {
    if (!guild || !guild.trial) {
      throw new Error("No active guild trial on this guild.");
    }

    var trial = guild.trial;
    var trialSkills = Object.values(trial.skills || {}).map(function (skill) {
      return Object.assign({}, skill, {
        members: Object.values(trial.members || {}).filter(function (m) {
          return String(m.skillId) === String(skill.id);
        }),
      });
    });

    var skills = [];
    var errors = [];

    for (var si = 0; si < trialSkills.length; si++) {
      var row = trialSkills[si];
      var skillId = row.id;
      var skillName = skillNameFromId(skillData, skillId);
      if (!skillName) {
        errors.push("Unmapped skill id " + String(skillId));
        continue;
      }

      var members = (row.members || []).map(function (m) {
        return {
          displayName: m.displayName,
          skillId: m.skillId,
          skillName: skillName,
          exp: m.exp,
          endDate: m.endDate,
          inferredStartAt: inferStart(m.endDate),
          actionId: m.actionId != null ? m.actionId : null,
          method: "api",
        };
      });

      skills.push({
        skill: skillName,
        skillId: skillId,
        currentExp: row.currentExp,
        requiredExp: trial.requiredExp,
        complete: row.currentExp >= trial.requiredExp,
        members: members,
      });
    }

    skills.sort(function (a, b) {
      return SKILL_ORDER.indexOf(a.skill) - SKILL_ORDER.indexOf(b.skill);
    });

    var skillValues = Object.values(trial.skills || {});
    var credit = calcCreditProgress(skillValues, trial.requiredExp, trial.creditReward);

    return {
      v: 1,
      importedAt: new Date().toISOString(),
      guildName: guild.name,
      guildId: guild.id,
      trialWeekStart: guildWeekStartFromInstant(trial.startDate),
      trialStartDate: trial.startDate,
      trialEndDate: trial.endDate,
      requiredExp: trial.requiredExp,
      trialsCompleted: countCompleted(skillValues, trial.requiredExp),
      trialsTotal: 16,
      guildCreditsEarned: credit.earned,
      guildCreditsMax: credit.max,
      skills: skills,
      errors: errors.length ? errors : undefined,
    };
  }

  var overlay = document.createElement("div");
  overlay.id = "igt-trial-sync-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:999999;background:rgba(8,12,22,0.92);color:#e2e8f0;font:14px/1.5 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;";
  overlay.innerHTML =
    '<div style="max-width:420px;text-align:center">' +
    '<p style="font-size:18px;font-weight:600;margin:0 0 8px">Syncing guild trials</p>' +
    '<p id="igt-trial-sync-status" style="margin:0;color:#94a3b8">Opening guild page…</p>' +
    '<p id="igt-trial-sync-detail" style="margin:12px 0 0;font-size:12px;color:#64748b"></p>' +
    "</div>";
  document.body.appendChild(overlay);

  function setStatus(main, detail) {
    var s = document.getElementById("igt-trial-sync-status");
    var d = document.getElementById("igt-trial-sync-detail");
    if (s) s.textContent = main;
    if (d) d.textContent = detail || "";
  }

  function guildUiVisible() {
    var text = document.body ? document.body.innerText || "" : "";
    return /Members/i.test(text) && (/Trials/i.test(text) || /Quests/i.test(text));
  }

  async function ensureGuildTrialsReady() {
    if (!onGuildPage()) {
      setStatus("Opening guild page…", GUILD_PATH);
      location.assign(guildUrlWithParams());
      await sleep(120000);
      return null;
    }

    for (var loadAttempt = 0; loadAttempt < 80; loadAttempt++) {
      var guild = readGuildFromAnySource();
      if (guildLooksLoaded(guild) && guildUiVisible()) break;
      setStatus(
        "Loading guild page…",
        loadAttempt === 0
          ? "Reading guild data from the page."
          : "Still loading (" + (loadAttempt + 1) + "/80)…",
      );
      await sleep(500);
    }

    var host = findGuildHost();
    var guildData = readGuildFromAnySource();

    if (!guildLooksLoaded(guildData)) {
      throw new Error(
        "Could not read guild data. Stay on /guild while logged into your guild, then try again.",
      );
    }

    setStatus("Opening Trials tab…", "Loading trial assignments.");
    await triggerTrialLoad(host);
    await sleep(900);

    for (var trialAttempt = 0; trialAttempt < 50; trialAttempt++) {
      host = findGuildHost() || host;
      guildData = readGuildFromAnySource();
      if (guildData && guildData.trial) {
        return { guild: guildData, skillData: findSkillDataMap() };
      }
      if (trialAttempt === 3 || trialAttempt === 8 || trialAttempt === 16) {
        await triggerTrialLoad(host);
      }
      setStatus(
        "Loading trial data…",
        trialAttempt === 0
          ? "Waiting for getGuildTrial."
          : "Still loading (" + (trialAttempt + 1) + "/50)…",
      );
      await sleep(600);
    }

    throw new Error(
      "No active guild trial found. Start trials in-game, open the Trials tab, then sync again.",
    );
  }

  async function runSync() {
    try {
      var ready = await ensureGuildTrialsReady();
      if (!ready) return;

      var payload = buildPayload(ready.guild, ready.skillData);

      var activeCount = 0;
      var nowMs = Date.now();
      for (var i = 0; i < payload.skills.length; i++) {
        var members = payload.skills[i].members || [];
        for (var m = 0; m < members.length; m++) {
          var endMs = new Date(members[m].endDate).getTime();
          if (Number.isNaN(endMs) || endMs > nowMs) activeCount++;
        }
      }

      if (activeCount === 0) {
        setStatus(
          "No active trial assignments found.",
          "Members must be on a trial slot (timer running) to sync.",
        );
        await sleep(4000);
        overlay.remove();
        sessionStorage.removeItem(SYNC_RUN_KEY);
        return;
      }

      var sep = returnUrl.indexOf("?") >= 0 ? "&" : "?";
      var destination = returnUrl + sep + "trialSync=" + encodeURIComponent(toBase64Url(payload));

      setStatus(
        "Done! Returning to Guild Trials…",
        activeCount + " active assignment(s) for week " + payload.trialWeekStart,
      );
      sessionStorage.removeItem(SYNC_RUN_KEY);
      await sleep(600);
      location.href = destination;
    } catch (err) {
      setStatus("Sync failed", err && err.message ? err.message : String(err));
    }
  }

  runSync();
})();
