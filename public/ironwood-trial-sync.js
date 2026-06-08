/**
 * Runs on https://ironwoodrpg.com/guild via userscript or bookmarklet.
 * Navigates to /guild, opens the Trials tab, reads assignments, returns to planner.
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
  var SCRIPT_VERSION = "1.1.0";

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
    if (!obj || depth > 14) return null;
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

  function getNgComponent(el) {
    if (typeof window.ng === "undefined" || typeof window.ng.getComponent !== "function") {
      return null;
    }
    try {
      return window.ng.getComponent(el);
    } catch (e) {
      return null;
    }
  }

  function isGuildComponent(cmp) {
    return Boolean(cmp && cmp.guild$ && cmp.changeTab && cmp.GuildTabEnum);
  }

  function isGuildTrialsComponent(cmp) {
    return Boolean(cmp && cmp.guild$ && (cmp.trialSkills$ || cmp.SKILL_DATA));
  }

  function findGuildComponent() {
    var selectors = ["guild-page", "app-guild", "app-root", "[class*='guild']"];
    for (var s = 0; s < selectors.length; s++) {
      var nodes = document.querySelectorAll(selectors[s]);
      for (var n = 0; n < nodes.length; n++) {
        var cmp = getNgComponent(nodes[n]);
        if (isGuildComponent(cmp) || isGuildTrialsComponent(cmp)) return cmp;
        if (nodes[n].__ngContext__) {
          var fromCtx = findInNgContext(
            nodes[n].__ngContext__,
            new WeakSet(),
            0,
            function (obj) {
              return isGuildComponent(obj) || isGuildTrialsComponent(obj);
            },
          );
          if (fromCtx) return fromCtx;
        }
      }
    }

    var all = document.querySelectorAll("*");
    var limit = Math.min(all.length, 800);
    for (var i = 0; i < limit; i++) {
      var cmp2 = getNgComponent(all[i]);
      if (isGuildComponent(cmp2) || isGuildTrialsComponent(cmp2)) return cmp2;
    }
    return null;
  }

  function clickTrialsTabDom() {
    var candidates = document.querySelectorAll("button, a, [role='button']");
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text === "Trials") {
        el.click();
        return true;
      }
    }
    for (var j = 0; j < candidates.length; j++) {
      var el2 = candidates[j];
      var text2 = (el2.textContent || "").replace(/\s+/g, " ").trim();
      if (/^Trials\b/.test(text2) && text2.length < 40) {
        el2.click();
        return true;
      }
    }
    return false;
  }

  function navigateToTrialsTab(cmp) {
    if (cmp && cmp.changeTab && cmp.GuildTabEnum && cmp.GuildTabEnum.Trials != null) {
      try {
        cmp.changeTab(cmp.GuildTabEnum.Trials);
        return true;
      } catch (e) {
        /* fall through */
      }
    }
    return clickTrialsTabDom();
  }

  function isTrialsTabActive(cmp) {
    if (!cmp || !cmp.GuildTabEnum) return false;
    var tab = readObservableValue(cmp.guildTab$);
    if (tab == null && typeof cmp.guildTab !== "undefined") tab = cmp.guildTab;
    return tab === cmp.GuildTabEnum.Trials;
  }

  function skillNameFromId(cmp, skillId) {
    if (!cmp || !cmp.SKILL_DATA) return null;
    var data = cmp.SKILL_DATA[skillId];
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

  function buildPayload(cmp) {
    var guild = readObservableValue(cmp.guild$);
    if (!guild || !guild.trial) {
      throw new Error("No active guild trial on this guild.");
    }

    var trial = guild.trial;
    var trialSkills = readObservableValue(cmp.trialSkills$);
    if (!trialSkills) {
      trialSkills = Object.values(trial.skills || {}).map(function (skill) {
        return Object.assign({}, skill, {
          members: Object.values(trial.members || {}).filter(function (m) {
            return m.skillId === skill.id;
          }),
        });
      });
    }

    var skills = [];
    var errors = [];

    for (var si = 0; si < trialSkills.length; si++) {
      var row = trialSkills[si];
      var skillId = row.id;
      var skillName = skillNameFromId(cmp, skillId);
      if (!skillName) {
        errors.push("Unmapped skill id " + skillId);
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
          method: "component",
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

  async function ensureGuildTrialsReady() {
    if (!onGuildPage()) {
      setStatus("Opening guild page…", GUILD_PATH);
      location.assign(guildUrlWithParams());
      await sleep(120000);
      return null;
    }

    var cmp = null;
    for (var loadAttempt = 0; loadAttempt < 60; loadAttempt++) {
      cmp = findGuildComponent();
      var guild = cmp ? readObservableValue(cmp.guild$) : null;
      if (cmp && guild) break;
      setStatus(
        "Loading guild page…",
        loadAttempt === 0
          ? "Make sure you are logged in and in a guild."
          : "Still loading (" + (loadAttempt + 1) + "/60)…",
      );
      await sleep(500);
    }

    if (!cmp) {
      throw new Error("Could not load guild page. Log in and open your guild first.");
    }

    var guildData = readObservableValue(cmp.guild$);
    if (!guildData) {
      throw new Error("Guild data not available. Are you in a guild?");
    }

    if (!isTrialsTabActive(cmp)) {
      setStatus("Opening Trials tab…", "");
      navigateToTrialsTab(cmp);
      await sleep(600);
    }

    for (var trialAttempt = 0; trialAttempt < 40; trialAttempt++) {
      cmp = findGuildComponent() || cmp;
      guildData = readObservableValue(cmp.guild$);
      if (guildData && guildData.trial) {
        if (!isTrialsTabActive(cmp)) navigateToTrialsTab(cmp);
        return cmp;
      }
      if (trialAttempt === 5 || trialAttempt === 15) {
        navigateToTrialsTab(cmp);
      }
      setStatus(
        "Waiting for trial data…",
        trialAttempt === 0
          ? "Selecting the Trials tab."
          : "Still waiting (" + (trialAttempt + 1) + "/40)…",
      );
      await sleep(600);
    }

    throw new Error(
      "No active guild trial found. Start trials in-game or open the Trials tab on /guild.",
    );
  }

  async function runSync() {
    try {
      var cmp = await ensureGuildTrialsReady();
      if (!cmp) return;

      var payload = buildPayload(cmp);

      var activeCount = 0;
      for (var i = 0; i < payload.skills.length; i++) {
        activeCount += payload.skills[i].members.length;
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
