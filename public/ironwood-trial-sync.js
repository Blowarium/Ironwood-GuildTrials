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
    var origin;
    try {
      origin = new URL(returnUrl).origin;
    } catch (e) {
      origin = "https://ironwood-guild-trials.vercel.app";
    }
    var script = document.createElement("script");
    script.src = origin + "/ironwood-guild-capture.js?v=1.6.0";
    (document.head || document.documentElement).appendChild(script);
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

  function findGuildTrialsComponent() {
    var selectors = ["guild-component", "guild-page", "app-guild", "app-root"];
    for (var s = 0; s < selectors.length; s++) {
      var nodes = document.querySelectorAll(selectors[s]);
      for (var n = 0; n < nodes.length; n++) {
        var el = nodes[n];
        if (typeof window.ng !== "undefined" && typeof window.ng.getComponent === "function") {
          try {
            var cmp = window.ng.getComponent(el);
            if (cmp && cmp.guild$ && (cmp.trialSkills$ || cmp.getTrial)) return cmp;
          } catch (e) {
            /* continue */
          }
        }
        if (el.__ngContext__) {
          var lView = el.__ngContext__;
          if (Array.isArray(lView)) {
            for (var li = 0; li < lView.length; li++) {
              var item = lView[li];
              if (item && item.guild$ && (item.trialSkills$ || item.getTrial || item.changeTab)) {
                return item;
              }
            }
          }
          var fromCtx = findInNgContext(
            el.__ngContext__,
            new WeakSet(),
            0,
            function (obj) {
              return obj && obj.guild$ && (obj.trialSkills$ || obj.getTrial || obj.changeTab);
            },
          );
          if (fromCtx) return fromCtx;
        }
      }
    }

    var all = document.querySelectorAll("*");
    var limit = Math.min(all.length, 3000);
    for (var i = 0; i < limit; i++) {
      var node = all[i];
      if (!node.__ngContext__) continue;
      var hit = findInNgContext(
        node.__ngContext__,
        new WeakSet(),
        0,
        function (obj) {
          return obj && obj.guild$ && (obj.trialSkills$ || obj.getTrial || obj.changeTab);
        },
      );
      if (hit) return hit;
    }
    return null;
  }

  function findGuildHost() {
    return findGuildTrialsComponent();
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

  var FALLBACK_SKILL_ID_MAP = {};
  for (var fi = 0; fi < SKILL_ORDER.length; fi++) {
    FALLBACK_SKILL_ID_MAP[fi + 1] = SKILL_ORDER[fi];
    FALLBACK_SKILL_ID_MAP[String(fi + 1)] = SKILL_ORDER[fi];
  }

  function skillNameFromId(skillData, skillId) {
    if (!skillId && skillId !== 0) return null;
    if (skillData) {
      var data =
        skillData[skillId] || skillData[String(skillId)] || skillData[Number(skillId)];
      if (data && data.name) return data.name;
    }
    return FALLBACK_SKILL_ID_MAP[skillId] || FALLBACK_SKILL_ID_MAP[String(skillId)] || null;
  }

  function skillNameForRow(skillData, row) {
    var fromRow = row && (row.name || row.skillName);
    if (fromRow && SKILL_ORDER.indexOf(fromRow) >= 0) return fromRow;
    return skillNameFromId(skillData, row && row.id);
  }

  function membersForSkillRow(trial, row) {
    var skillId = row.id;
    var fromTrial = trialMembersForSkill(trial, skillId);
    if (fromTrial.length) return fromTrial;

    var rowMembers = row.members;
    if (Array.isArray(rowMembers) && rowMembers.length) return rowMembers;
    if (rowMembers && typeof rowMembers === "object") {
      var vals = Object.values(rowMembers);
      if (vals.length) return vals;
    }
    return [];
  }

  function mapMemberRecord(m, skillName, method) {
    return {
      displayName: m.displayName,
      skillId: m.skillId,
      skillName: skillName,
      exp: m.exp,
      endDate: m.endDate,
      inferredStartAt: inferStart(m.endDate),
      actionId: m.actionId != null ? m.actionId : null,
      method: method,
    };
  }

  function countMembersInPayload(payload) {
    if (!payload || !payload.skills) return 0;
    var n = 0;
    for (var i = 0; i < payload.skills.length; i++) {
      n += (payload.skills[i].members || []).length;
    }
    return n;
  }

  function payloadScore(payload) {
    if (!payload || !payload.skills) return -1;
    var members = countMembersInPayload(payload);
    if (!members) return -1;
    var sourceBonus = payload.source === "component" ? 3 : payload.source === "api" ? 2 : 0;
    return members * 10 + sourceBonus;
  }

  function trialMembersForSkill(trial, skillId) {
    return Object.values(trial.members || {}).filter(function (m) {
      return String(m.skillId) === String(skillId);
    });
  }

  function payloadHasDuplicateMembers(payload) {
    var seen = {};
    for (var i = 0; i < payload.skills.length; i++) {
      var row = payload.skills[i];
      for (var j = 0; j < (row.members || []).length; j++) {
        var name = row.members[j].displayName;
        if (seen[name]) return true;
        seen[name] = row.skill;
      }
    }
    return false;
  }

  function finalizePayload(payload, guild, trial, skillValues, credit) {
    payload.v = 1;
    payload.importedAt = new Date().toISOString();
    payload.guildName = guild.name;
    payload.guildId = guild.id;
    payload.trialWeekStart = guildWeekStartFromInstant(trial.startDate);
    payload.trialStartDate = trial.startDate;
    payload.trialEndDate = trial.endDate;
    payload.requiredExp = trial.requiredExp;
    payload.trialsCompleted = countCompleted(skillValues, trial.requiredExp);
    payload.trialsTotal = 16;
    payload.guildCreditsEarned = credit.earned;
    payload.guildCreditsMax = credit.max;
    return payload;
  }

  function buildSkillsPayload(guild, skillData, cmp, source) {
    if (!guild || !guild.trial) return null;
    var trial = guild.trial;
    var trialSkills = cmp ? readObservableValue(cmp.trialSkills$) : null;
    var skillRows = trialSkills || Object.values(trial.skills || {});
    var skills = [];
    var errors = [];

    for (var si = 0; si < skillRows.length; si++) {
      var row = skillRows[si];
      var skillId = row.id;
      var skillName = skillNameForRow(skillData, row);
      if (!skillName || SKILL_ORDER.indexOf(skillName) < 0) {
        errors.push("Unmapped skill id " + String(skillId));
        continue;
      }

      var members = membersForSkillRow(trial, row).map(function (m) {
        return mapMemberRecord(m, skillName, source);
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

    if (!skills.length && Object.keys(trial.members || {}).length) {
      var grouped = {};
      Object.values(trial.members || {}).forEach(function (m) {
        var sid = String(m.skillId);
        if (!grouped[sid]) grouped[sid] = [];
        grouped[sid].push(m);
      });
      var skillMeta = {};
      Object.values(trial.skills || {}).forEach(function (s) {
        skillMeta[String(s.id)] = s;
      });
      Object.keys(grouped).forEach(function (sid) {
        var skillName = skillNameFromId(skillData, sid);
        if (!skillName) return;
        var meta = skillMeta[sid] || {};
        skills.push({
          skill: skillName,
          skillId: sid,
          currentExp: meta.currentExp || 0,
          requiredExp: trial.requiredExp,
          complete: (meta.currentExp || 0) >= trial.requiredExp,
          members: grouped[sid].map(function (m) {
            return mapMemberRecord(m, skillName, source);
          }),
        });
      });
    }

    skills.sort(function (a, b) {
      return SKILL_ORDER.indexOf(a.skill) - SKILL_ORDER.indexOf(b.skill);
    });

    var skillValues = Object.values(trial.skills || {});
    var credit = calcCreditProgress(skillValues, trial.requiredExp, trial.creditReward);
    var payload = finalizePayload(
      { source: source, skills: skills, errors: errors.length ? errors : undefined },
      guild,
      trial,
      skillValues,
      credit,
    );
    return payload;
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

  function normalizeFromComponent(cmp) {
    if (!cmp) return null;
    var guild = readGuildFromHost(cmp);
    if (!guild || !guild.trial) {
      return { error: "No active guild trial on guild$.trial", guild: guild || null };
    }
    return buildSkillsPayload(guild, cmp.SKILL_DATA || findSkillDataMap(), cmp, "component");
  }

  function isNodeAfter(startEl, node) {
    if (!startEl || !node || !startEl.compareDocumentPosition) return false;
    return Boolean(startEl.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function isNodeBefore(endEl, node) {
    if (!endEl || !node || !endEl.compareDocumentPosition) return true;
    return Boolean(endEl.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function parseMemberButton(btnText) {
    var xpMatch = btnText.match(/([\d,]+)\s*XP/i);
    if (!xpMatch) return null;
    var withoutXp = btnText.replace(/[\d,]+/g, " ").replace(/XP/gi, " ").replace(/\s+/g, " ").trim();
    if (withoutXp.length < 2) return null;
    return {
      displayName: withoutXp,
      exp: Number(xpMatch[1].replace(/,/g, "")),
    };
  }

  function normalizeFromDomScoped() {
    var headers = document.querySelectorAll("div, span, button, h1, h2, h3, h4");
    var skillBlocks = [];
    var seenSkills = {};

    for (var i = 0; i < headers.length; i++) {
      var text = (headers[i].textContent || "").trim();
      var trialMatch = text.match(/^(.+) Trial$/);
      if (!trialMatch) continue;
      var skillName = trialMatch[1];
      if (SKILL_ORDER.indexOf(skillName) < 0 || seenSkills[skillName]) continue;
      seenSkills[skillName] = true;
      skillBlocks.push({ el: headers[i], skillName: skillName });
    }

    if (!skillBlocks.length) return null;

    var skills = [];
    var allButtons = document.querySelectorAll("button");

    for (var b = 0; b < skillBlocks.length; b++) {
      var block = skillBlocks[b];
      var nextEl = skillBlocks[b + 1] ? skillBlocks[b + 1].el : null;
      var members = [];

      for (var bi = 0; bi < allButtons.length; bi++) {
        var btn = allButtons[bi];
        if (!isNodeAfter(block.el, btn)) continue;
        if (nextEl && !isNodeBefore(nextEl, btn)) continue;
        var parsed = parseMemberButton(btn.textContent || "");
        if (!parsed) continue;
        members.push({
          displayName: parsed.displayName,
          skillName: block.skillName,
          exp: parsed.exp,
          endDate: new Date(Date.now() + TRIAL_MS).toISOString(),
          inferredStartAt: new Date().toISOString(),
          method: "dom",
        });
      }

      if (members.length) {
        skills.push({ skill: block.skillName, members: members });
      }
    }

    if (!skills.length) return null;

    return {
      v: 1,
      importedAt: new Date().toISOString(),
      source: "dom",
      guildName: null,
      guildId: null,
      trialWeekStart: guildWeekStartFromInstant(new Date().toISOString()),
      trialStartDate: null,
      trialEndDate: null,
      requiredExp: null,
      trialsCompleted: 0,
      trialsTotal: 16,
      guildCreditsEarned: 0,
      guildCreditsMax: 0,
      skills: skills,
      errors: ["DOM fallback — verify synced times in planner"],
    };
  }

  function readTrialPayloadFromPage() {
    var candidates = [];
    var cmp = findGuildTrialsComponent();
    var guild = readGuildFromAnySource();
    var skillData = findSkillDataMap();

    if (cmp) {
      var fromComponent = normalizeFromComponent(cmp);
      if (fromComponent && !fromComponent.error) candidates.push(fromComponent);
    }

    if (guild && guild.trial) {
      candidates.push(buildSkillsPayload(guild, skillData, cmp, "api"));
    }

    var fromDom = normalizeFromDomScoped();
    if (fromDom && !payloadHasDuplicateMembers(fromDom)) candidates.push(fromDom);

    var best = null;
    var bestScore = -1;
    for (var ci = 0; ci < candidates.length; ci++) {
      var score = payloadScore(candidates[ci]);
      if (score > bestScore) {
        bestScore = score;
        best = candidates[ci];
      }
    }

    return best;
  }

  function buildPayload(guild, skillData) {
    return buildSkillsPayload(guild, skillData, findGuildTrialsComponent(), "api");
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

    for (var loadAttempt = 0; loadAttempt < 60; loadAttempt++) {
      if (guildUiVisible()) break;
      setStatus(
        "Loading guild page…",
        loadAttempt === 0
          ? "Waiting for guild UI."
          : "Still loading (" + (loadAttempt + 1) + "/60)…",
      );
      await sleep(500);
    }

    if (!guildUiVisible()) {
      throw new Error(
        "Could not load guild page. Log in and open your guild first, then try again.",
      );
    }

    var host = findGuildTrialsComponent();
    setStatus("Opening Trials tab…", "Loading trial assignments.");
    await triggerTrialLoad(host);
    await sleep(1200);

    for (var trialAttempt = 0; trialAttempt < 60; trialAttempt++) {
      host = findGuildTrialsComponent() || host;
      if (trialAttempt === 4 || trialAttempt === 12 || trialAttempt === 24) {
        await triggerTrialLoad(host);
        await sleep(800);
      }

      var payload = readTrialPayloadFromPage();
      if (payload && countMembersInPayload(payload) > 0) {
        setStatus(
          "Trial data ready",
          countMembersInPayload(payload) +
            " assignment(s) via " +
            (payload.source || "unknown") +
            ".",
        );
        return payload;
      }

      var cmp = findGuildTrialsComponent();
      var guild = readGuildFromAnySource();
      var detail =
        "component=" +
        (cmp ? "yes" : "no") +
        ", guild.trial=" +
        (guild && guild.trial ? "yes" : "no") +
        ", trial.members=" +
        (guild && guild.trial && guild.trial.members
          ? Object.keys(guild.trial.members).length
          : 0);

      setStatus(
        "Loading trial data…",
        trialAttempt === 0 ? detail : detail + " (" + (trialAttempt + 1) + "/60)",
      );
      await sleep(600);
    }

    throw new Error(
      "Could not read trial assignments from Ironwood. Open Guild → Trials, wait for assignments to load, then sync again.",
    );
  }

  function countActiveAssignments(payload) {
    var activeCount = 0;
    var nowMs = Date.now();
    for (var i = 0; i < payload.skills.length; i++) {
      var members = payload.skills[i].members || [];
      for (var m = 0; m < members.length; m++) {
        var endMs = new Date(members[m].endDate).getTime();
        if (Number.isNaN(endMs) || endMs > nowMs) activeCount++;
      }
    }
    return activeCount;
  }

  async function runSync() {
    try {
      var payload = await ensureGuildTrialsReady();
      if (!payload) return;

      var activeCount = countActiveAssignments(payload);

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
