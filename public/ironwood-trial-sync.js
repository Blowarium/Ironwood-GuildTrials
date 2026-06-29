/**
 * Runs on https://ironwoodrpg.com/guild via userscript or bookmarklet.
 * Captures getGuild/getGuildTrial API data, opens Trials tab, syncs to planner.
 */
(function ironwoodGuildTrialsSync() {
  if (!/(^|\.)ironwoodrpg\.com$/i.test(location.hostname)) {
    alert("Guild Trials sync must be run on ironwoodrpg.com while logged in.");
    return;
  }

  var TRIAL_MS = 24 * 60 * 60 * 1000;
  var GUILD_OFFSET_MS = 2 * 60 * 60 * 1000;
  var GUILD_DAILY_RESET_HOUR = 2;
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
  var SCRIPT_VERSION =
    (scriptUrl && scriptUrl.searchParams.get("v")) || "1.21.0";
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
    script.src = origin + "/ironwood-guild-capture.js?v=1.11.0";
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

  function returnToPlanner(destination) {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.location.href = destination;
        window.opener.focus();
        window.close();
        return;
      }
    } catch (e) {
      /* opener navigation blocked */
    }
    location.href = destination;
  }

  function collectPlannerDeliveryTargets(plannerName) {
    var targets = [];
    var seen = [];

    function add(win) {
      if (!win) return;
      try {
        if (win.closed) return;
        for (var i = 0; i < seen.length; i++) {
          if (seen[i] === win) return;
        }
        seen.push(win);
        targets.push(win);
      } catch (e) {
        /* ignore cross-origin access errors */
      }
    }

    try {
      add(window.opener);
    } catch (e) {
      /* ignore */
    }

    try {
      add(window.open("", plannerName));
    } catch (e) {
      /* ignore */
    }

    return targets;
  }

  function deliverGameSyncToPlanner(payload) {
    var plannerName = "igt-guild-trials-planner";
    var encoded = toBase64Url(payload);
    var sep = returnUrl.indexOf("?") >= 0 ? "&" : "?";
    var destination = returnUrl + sep + "gameSync=" + encodeURIComponent(encoded);
    var targetOrigin = new URL(returnUrl).origin;
    var message = { type: "igt-game-sync-payload", v: 1, payload: payload };

    var targets = collectPlannerDeliveryTargets(plannerName);
    var delivered = false;
    for (var ti = 0; ti < targets.length; ti++) {
      try {
        targets[ti].postMessage(message, targetOrigin);
        delivered = true;
        try {
          targets[ti].focus();
        } catch (focusErr) {
          /* ignore */
        }
        try {
          if (
            targets[ti].location &&
            new URL(targets[ti].location.href).origin === targetOrigin
          ) {
            targets[ti].history.replaceState({}, "", destination);
            targets[ti].dispatchEvent(new Event("igt-game-sync-url-updated"));
          }
        } catch (urlHandoffErr) {
          /* ignore */
        }
      } catch (postErr) {
        /* try next target */
      }
    }

    if (delivered) {
      try {
        window.close();
      } catch (closeErr) {
        /* ignore */
      }
      return;
    }

    try {
      var plannerWin = window.open(destination, plannerName);
      if (plannerWin) {
        try {
          plannerWin.focus();
        } catch (focusErr2) {
          /* ignore */
        }
        try {
          window.close();
        } catch (closeErr2) {
          /* ignore */
        }
        return;
      }
    } catch (openErr) {
      /* fall through */
    }

    returnToPlanner(destination);
  }

  function applyPayloadTrialWeekFromGuild(payload) {
    if (!payload) return payload;
    var guild = readGuildFromAnySource() || {};
    var trial = (guild && guild.trial) || findTrialRecordInPage() || {};
    if (trial.startDate) {
      payload.trialWeekStart = guildWeekStartFromInstant(trial.startDate);
      payload.trialStartDate = trial.startDate;
    }
    if (trial.endDate) payload.trialEndDate = trial.endDate;
    if (trial.requiredExp != null && trial.requiredExp !== "") {
      payload.requiredExp = trial.requiredExp;
    }
    if (guild.name) payload.guildName = guild.name;
    if (guild.id) payload.guildId = guild.id;
    return payload;
  }

  async function refreshTrialCompletionsAfterBuildings(payload, host) {
    setStatus("Reading skill completions…", "Returning to Trials tab.");
    host = host || findGuildHost();
    navigateToTrialsTab(host);
    await triggerTrialLoad(host);
    await sleep(2200);

    var fresh = readTrialPayloadFromPage();
    if (fresh) {
      if (fresh.trialWeekStart) payload.trialWeekStart = fresh.trialWeekStart;
      if (fresh.trialStartDate) payload.trialStartDate = fresh.trialStartDate;
      if (fresh.trialEndDate) payload.trialEndDate = fresh.trialEndDate;
      if (fresh.requiredExp != null) payload.requiredExp = fresh.requiredExp;
      if ((!payload.skills || !payload.skills.length) && fresh.skills && fresh.skills.length) {
        payload.skills = fresh.skills;
      } else if (fresh.skills && fresh.skills.length) {
        mergePayloadMembers(payload, fresh);
      }
    }

    applyPayloadTrialWeekFromGuild(payload);
    return enrichPayloadSkillCompletions(payload);
  }

  function readObservableValue(subject) {
    if (!subject) return null;
    if (typeof subject === "object" && !subject.getValue && Array.isArray(subject)) return subject;
    if (typeof subject.getValue === "function") return subject.getValue();
    if (typeof subject.value !== "undefined") return subject.value;
    if (typeof subject._value !== "undefined") return subject._value;
    return null;
  }

  function scanAllNgContexts(matcher, limit) {
    var all = document.querySelectorAll("*");
    var max = Math.min(all.length, limit || 8000);
    for (var i = 0; i < max; i++) {
      var node = all[i];
      if (!node.__ngContext__) continue;
      var hit = findInNgContext(node.__ngContext__, new WeakSet(), 0, matcher);
      if (hit) return hit;
    }
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

    return scanAllNgContexts(isHost, 8000) || scanAllNgContexts(isTrialSkillsHost, 8000);
  }

  function findTrialRecordInPage() {
    return scanAllNgContexts(function (obj) {
      return Boolean(
        obj &&
          obj.members &&
          obj.skills &&
          obj.requiredExp != null &&
          obj.startDate,
      );
    }, 8000);
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
    var host = findGuildTrialsComponent();
    var fromHost = readGuildFromHost(host);
    if (fromHost && fromHost.trial) return fromHost;

    var trialOnly = findTrialRecordInPage();
    if (trialOnly) {
      return { trial: trialOnly, name: capture && capture.name, id: capture && capture.id };
    }

    if (capture && guildLooksLoaded(capture)) return capture;
    if (fromHost && guildLooksLoaded(fromHost)) return fromHost;
    return capture || fromHost;
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

  function clickBuildingsTabDom() {
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
        if (text === "Buildings" || /^Buildings(\s|\(|$)/i.test(text)) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  }

  function navigateToBuildingsTab(host) {
    if (host && host.changeTab && host.GuildTabEnum && host.GuildTabEnum.Buildings != null) {
      try {
        host.changeTab(host.GuildTabEnum.Buildings);
        return true;
      } catch (e) {
        /* fall through */
      }
    }
    return clickBuildingsTabDom();
  }

  var BUILDING_NAME_TO_ID = {
    "Guild Hall": "GuildHall",
    "Guild Library": "GuildLibrary",
    "Guild Bank": "GuildBank",
    "Guild Storehouse": "GuildStorehouse",
    "Guild Workshop": "GuildWorkshop",
    "Guild Armoury": "GuildArmoury",
    "Guild Event Hall": "GuildEventHall",
    "Guild Trial Hall": "GuildTrialHall",
  };

  var MATERIAL_IDS =
    "Amethyst,AmethystCrystal,AncientLog,Apple,AstralBar,AstralOre,Banana,BirchLog,Blackcurrant,Blueberry,Bone,Cherry,Citrine,CitrineCrystal,CobaltBar,CobaltOre,CopperBar,CopperOre,Daisy,Diamond,DiamondCrystal,Emerald,EmeraldCrystal,Fang,GiantBone,GiantFang,GoldBar,GoldOre,Grapes,GreenApple,Hyacinth,InfernalBar,InfernalOre,IronBar,IronOre,IronbarkLog,LargeBone,LargeFang,Lilac,Logbook1,Logbook10,Logbook100,Logbook25,Logbook40,Logbook55,Logbook70,Logbook85,MahoganyLog,MediumBone,MediumFang,Moonstone,MoonstoneCrystal,Nemesia,ObsidianBar,ObsidianOre,Onyx,OnyxCrystal,Peony,PineLog,Raspberry,RawBass,RawCod,RawKingCrab,RawLobster,RawSalmon,RawShark,RawShrimp,RawSwordfish,RedwoodLog,Rose,Ruby,RubyCrystal,SilverBar,SilverOre,Snapdragon,SpruceLog,TeakLog,Topaz,TopazCrystal,Tulip".split(
      ",",
    );

  function formatMaterialId(id) {
    return id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/(\D)(\d+)/g, "$1 $2");
  }

  function materialNameToId(name) {
    var trimmed = String(name || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!trimmed) return null;
    var compact = trimmed.replace(/\s+/g, "");
    for (var i = 0; i < MATERIAL_IDS.length; i++) {
      var id = MATERIAL_IDS[i];
      if (id === compact) return id;
      if (formatMaterialId(id).toLowerCase() === trimmed.toLowerCase()) return id;
    }
    return null;
  }

  function parseCompactNumber(text) {
    return Math.max(0, Math.floor(Number(String(text).replace(/[^\d]/g, "")) || 0));
  }

  function parseLevelFromAmount(text) {
    var match = String(text || "").match(/Lv\.?\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  function parseAmountFraction(text) {
    var parts = String(text || "").split("/");
    if (parts.length < 2) return null;
    return {
      deposited: parseCompactNumber(parts[0]),
      required: parseCompactNumber(parts[1]),
    };
  }

  function findBuildingsCard() {
    var cards = document.querySelectorAll(".card");
    for (var i = 0; i < cards.length; i++) {
      var header = cards[i].querySelector(".header .name");
      if (header && (header.textContent || "").trim() === "Buildings") {
        return cards[i];
      }
    }
    return null;
  }

  function findRequirementsCard() {
    var cards = document.querySelectorAll(".card");
    for (var c = 0; c < cards.length; c++) {
      var reqHeader = cards[c].querySelector(".header .name");
      if (reqHeader && (reqHeader.textContent || "").trim() === "Requirements") {
        return cards[c];
      }
    }
    return null;
  }

  function scrapeRequirements(reqCard) {
    if (!reqCard) return null;

    var materials = {};
    var coins = null;
    var rows = reqCard.querySelectorAll(".row, button.row");
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var nameEl = row.querySelector(".name");
      var amountEl = row.querySelector(".amount");
      if (!nameEl || !amountEl) continue;
      var itemName = (nameEl.textContent || "").trim();
      if (!itemName || itemName === "Guild" || itemName === "Credits") {
        continue;
      }
      var frac = parseAmountFraction(amountEl.textContent || "");
      if (!frac || frac.required <= 0) continue;
      if (itemName === "Coins") {
        coins = frac.deposited;
        continue;
      }
      var materialId = materialNameToId(itemName);
      if (!materialId) continue;
      materials[materialId] = frac.deposited;
    }

    if (Object.keys(materials).length === 0 && coins == null) return null;

    return { materials: materials, coins: coins };
  }

  function scrapeActiveBuildingMaterials() {
    var buildingsCard = findBuildingsCard();
    if (!buildingsCard) return null;

    var activeRow =
      buildingsCard.querySelector("button.row.row-active") ||
      buildingsCard.querySelector("button.row");
    if (!activeRow) return null;

    var buildingName = ((activeRow.querySelector(".name") || {}).textContent || "").trim();
    var level = parseLevelFromAmount((activeRow.querySelector(".amount") || {}).textContent || "");
    var buildingId = BUILDING_NAME_TO_ID[buildingName];
    if (!buildingId || level == null) return null;

    var req = scrapeRequirements(findRequirementsCard());
    if (!req) return null;

    var entry = {
      buildingId: buildingId,
      fromLevel: level,
      materials: req.materials,
      source: "dom",
    };
    if (req.coins != null) entry.coins = req.coins;
    return entry;
  }

  function scrapeBuildingMaterialsFromDom() {
    return scrapeActiveBuildingMaterials();
  }

  async function readBuildingMaterialsPayload(host) {
    navigateToBuildingsTab(host);

    var buildingsCard = null;
    for (var attempt = 0; attempt < 20; attempt++) {
      buildingsCard = findBuildingsCard();
      if (buildingsCard) break;
      await sleep(400);
    }
    if (!buildingsCard) return null;

    var rows = buildingsCard.querySelectorAll("button.row");
    if (!rows.length) return null;

    var results = [];
    var seen = {};

    for (var i = 0; i < rows.length; i++) {
      rows[i].click();
      var entry = null;
      for (var wait = 0; wait < 12; wait++) {
        await sleep(300);
        entry = scrapeActiveBuildingMaterials();
        if (entry) break;
      }
      if (!entry) continue;
      var key = entry.buildingId + ":" + entry.fromLevel;
      if (seen[key]) continue;
      seen[key] = true;
      results.push(entry);
    }

    return results.length ? results : null;
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
    var endDate = m.endDate || null;
    var inferredStartAt =
      m.inferredStartAt || (endDate ? inferStart(endDate) : null);
    return {
      displayName: m.displayName,
      skillId: m.skillId,
      skillName: skillName,
      exp: m.exp,
      endDate: endDate,
      inferredStartAt: inferredStartAt,
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

  function countMembersWithTimedEndDate(payload) {
    if (!payload || !payload.skills) return 0;
    var now = Date.now();
    var count = 0;
    for (var i = 0; i < payload.skills.length; i++) {
      var row = payload.skills[i];
      for (var j = 0; j < (row.members || []).length; j++) {
        var endMs = new Date(row.members[j].endDate).getTime();
        if (!Number.isNaN(endMs) && endMs > now) count++;
      }
    }
    return count;
  }

  function payloadHasUsableTrialData(payload) {
    if (!payload || !payload.skills) return false;
    if (countMembersInPayload(payload) > 0) return true;
    for (var i = 0; i < payload.skills.length; i++) {
      var row = payload.skills[i];
      if (row.complete || (row.currentExp && row.currentExp > 0)) return true;
    }
    return false;
  }

  function buildMinimalGameSyncPayload() {
    var guild = readGuildFromAnySource() || guildFromCaptureRaw() || {};
    var trial = (guild && guild.trial) || findTrialRecordInPage() || {};
    var startDate = trial.startDate || new Date().toISOString();
    var payload = {
      v: 1,
      importedAt: new Date().toISOString(),
      source: "minimal",
      guildName: guild.name || null,
      guildId: guild.id || null,
      trialWeekStart: guildWeekStartFromInstant(startDate),
      trialStartDate: trial.startDate || null,
      trialEndDate: trial.endDate || null,
      requiredExp: trial.requiredExp || null,
      trialsCompleted: 0,
      trialsTotal: 16,
      guildCreditsEarned: 0,
      guildCreditsMax: 0,
      skills: [],
    };
    return applyPayloadTrialWeekFromGuild(payload);
  }

  function buildingMaterialsCount(payload) {
    if (!payload || !payload.buildingMaterials) return 0;
    var bm = payload.buildingMaterials;
    return Array.isArray(bm) ? bm.length : 1;
  }

  function hasSyncableGameData(payload, activeCount) {
    if (activeCount > 0) return true;
    if (payload.skillCompletions && Object.keys(payload.skillCompletions).length > 0) return true;
    if (buildingMaterialsCount(payload) > 0) return true;
    return false;
  }

  function syncResultSummary(payload, activeCount) {
    var parts = [];
    if (activeCount > 0) parts.push(activeCount + " active assignment(s)");
    if (payload.skillCompletions) {
      var completionCount = Object.keys(payload.skillCompletions).length;
      if (completionCount > 0) parts.push(completionCount + " completed skill(s)");
    }
    var buildingCount = buildingMaterialsCount(payload);
    if (buildingCount > 0) parts.push(buildingCount + " building deposit snapshot(s)");
    if (parts.length) return parts.join(", ");
    return "Week " + (payload.trialWeekStart || "unknown");
  }

  function countAssignableMembersInPayload(payload, nowMs) {
    if (!payload || !payload.skills) return 0;
    if (nowMs == null) nowMs = Date.now();
    var count = 0;
    for (var i = 0; i < payload.skills.length; i++) {
      var members = payload.skills[i].members || [];
      for (var j = 0; j < members.length; j++) {
        var endMs = new Date(members[j].endDate).getTime();
        if (Number.isNaN(endMs) || endMs > nowMs) count++;
      }
    }
    return count;
  }

  function mergePayloadMembers(target, donor) {
    if (!target || !donor || !donor.skills || !donor.skills.length) return target;
    if (!target.skills) target.skills = [];

    var bySkill = {};
    for (var i = 0; i < target.skills.length; i++) {
      bySkill[target.skills[i].skill] = target.skills[i];
    }

    for (var di = 0; di < donor.skills.length; di++) {
      var dRow = donor.skills[di];
      if (!dRow.members || !dRow.members.length) continue;

      var tRow = bySkill[dRow.skill];
      if (!tRow) {
        tRow = {
          skill: dRow.skill,
          skillId: dRow.skillId || dRow.skill,
          currentExp: dRow.currentExp || 0,
          requiredExp: dRow.requiredExp || 0,
          complete: !!dRow.complete,
          members: dRow.members.slice(),
        };
        target.skills.push(tRow);
        bySkill[dRow.skill] = tRow;
        continue;
      }

      if (!tRow.members) tRow.members = [];
      var seen = {};
      for (var mi = 0; mi < tRow.members.length; mi++) {
        seen[normalizeMemberKey(tRow.members[mi].displayName)] = true;
      }
      for (var mj = 0; mj < dRow.members.length; mj++) {
        var dm = dRow.members[mj];
        var key = normalizeMemberKey(dm.displayName);
        if (seen[key]) continue;
        seen[key] = true;
        tRow.members.push(dm);
      }
    }

    return target;
  }

  function ensureTrialMembersOnPayload(payload, guild, skillData) {
    if (!payload || !payload.skills || !guild || !guild.trial || !guild.trial.members) {
      return payload;
    }

    var trial = guild.trial;
    var bySkill = {};
    for (var i = 0; i < payload.skills.length; i++) {
      bySkill[payload.skills[i].skill] = payload.skills[i];
      if (payload.skills[i].skillId != null) {
        bySkill[String(payload.skills[i].skillId)] = payload.skills[i];
      }
    }

    Object.values(trial.members).forEach(function (m) {
      if (!m || !m.displayName) return;
      var skillName = skillNameFromId(skillData, m.skillId);
      if (!skillName) return;

      var row = bySkill[skillName] || bySkill[String(m.skillId)];
      if (!row) {
        row = {
          skill: skillName,
          skillId: m.skillId,
          currentExp: 0,
          requiredExp: trial.requiredExp || 0,
          complete: false,
          members: [],
        };
        payload.skills.push(row);
        bySkill[skillName] = row;
        bySkill[String(m.skillId)] = row;
      }

      if (!row.members) row.members = [];
      var memberKey = normalizeMemberKey(m.displayName);
      for (var ri = 0; ri < row.members.length; ri++) {
        if (normalizeMemberKey(row.members[ri].displayName) === memberKey) return;
      }
      row.members.push(mapMemberRecord(m, skillName, "trial.members"));
    });

    payload.skills.sort(function (a, b) {
      return SKILL_ORDER.indexOf(a.skill) - SKILL_ORDER.indexOf(b.skill);
    });
    return payload;
  }

  function finalizeTrialPayload(payload) {
    if (!payload) return payload;
    applyPayloadTrialWeekFromGuild(payload);
    return payload;
  }

  function attachDomAssignmentsToPayload(payload) {
    if (!payload) return payload;
    if (!payload.skills) payload.skills = [];

    var donors = [
      normalizeFromDomRows(),
      normalizeFromVisibleText(),
      normalizeFromDomScoped(),
      normalizeFromDomColumns(),
    ];
    for (var di = 0; di < donors.length; di++) {
      if (donors[di] && countMembersInPayload(donors[di]) > 0) {
        mergePayloadMembers(payload, donors[di]);
      }
    }

    var guild = readGuildFromAnySource();
    if (!guild || !guild.trial) {
      var capturedGuild = guildFromCaptureRaw();
      if (capturedGuild) guild = capturedGuild;
    }
    ensureTrialMembersOnPayload(payload, guild, findSkillDataMap());
    return finalizeTrialPayload(payload);
  }

  function payloadScore(payload) {
    if (!payload || !payload.skills) return -1;
    var members = countMembersInPayload(payload);
    if (!members) {
      var progressScore = 0;
      for (var pi = 0; pi < payload.skills.length; pi++) {
        var skillRow = payload.skills[pi];
        if (skillRow.complete) progressScore += 3;
        else if (skillRow.currentExp > 0) progressScore += 1;
      }
      return progressScore > 0 ? progressScore : -1;
    }

    var assignable = countAssignableMembersInPayload(payload);
    var timed = countMembersWithTimedEndDate(payload);
    var sourceBonus =
      payload.source === "component"
        ? 3
        : payload.source === "api"
          ? 2
          : payload.source === "dom-rows"
            ? 5
            : payload.source === "dom-text"
              ? 4
              : payload.source === "dom"
                ? 2
                : payload.source === "dom-columns"
                  ? 0
                  : 0;
    return assignable * 40 + timed * 15 + members * 8 + sourceBonus;
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

  function buildPayloadFromTrialSkillsOnly(cmp, skillData, source) {
    if (!cmp || !cmp.trialSkills$) return null;
    var trialSkills = readObservableValue(cmp.trialSkills$);
    if (!Array.isArray(trialSkills) || !trialSkills.length) return null;

    var guild = readGuildFromHost(cmp) || guildFromCaptureRaw() || {};
    var trial = guild.trial || findTrialRecordInPage() || {};
    var requiredExp = trial.requiredExp || 0;
    var skills = [];

    for (var si = 0; si < trialSkills.length; si++) {
      var row = trialSkills[si];
      if (row.requiredExp && !requiredExp) requiredExp = row.requiredExp;
      var skillName = skillNameForRow(skillData, row);
      if (!skillName || SKILL_ORDER.indexOf(skillName) < 0) continue;

      var members = membersForSkillRow(trial, row).map(function (m) {
        return mapMemberRecord(m, skillName, source);
      });
      if (!members.length && !skillRowCompletion(row, requiredExp).complete) continue;

      var completion = skillRowCompletion(row, requiredExp || row.requiredExp || 0);
      skills.push({
        skill: skillName,
        skillId: row.id,
        currentExp: completion.currentExp,
        requiredExp: completion.requiredExp,
        complete: completion.complete,
        members: members,
      });
    }

    if (!skills.length) return null;

    var startDate = trial.startDate || new Date().toISOString();
    if (!trial.startDate) trial = Object.assign({}, trial, { startDate: startDate, requiredExp: requiredExp });
    if (!guild.trial) guild = Object.assign({}, guild, { trial: trial });

    skills.sort(function (a, b) {
      return SKILL_ORDER.indexOf(a.skill) - SKILL_ORDER.indexOf(b.skill);
    });

    var skillValues = Object.values(trial.skills || {});
    var credit = calcCreditProgress(
      skillValues.length ? skillValues : skills,
      requiredExp || 1,
      trial.creditReward || 0,
    );
    return finalizePayload(
      { source: source, skills: skills },
      guild,
      trial,
      skillValues.length ? skillValues : skills,
      credit,
    );
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

      var completion = skillRowCompletion(row, trial.requiredExp);
      skills.push({
        skill: skillName,
        skillId: skillId,
        currentExp: completion.currentExp,
        requiredExp: completion.requiredExp || trial.requiredExp,
        complete: completion.complete,
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
        var completion = skillRowCompletion(meta, trial.requiredExp);
        skills.push({
          skill: skillName,
          skillId: sid,
          currentExp: completion.currentExp,
          requiredExp: completion.requiredExp || trial.requiredExp,
          complete: completion.complete,
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

  function guildDateFromInstant(iso) {
    var t = new Date(iso).getTime() + GUILD_OFFSET_MS;
    var d = new Date(t);
    var y = d.getUTCFullYear();
    var m = String(d.getUTCMonth() + 1).padStart(2, "0");
    var day = String(d.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function guildTimeParts(iso) {
    var t = new Date(iso).getTime() + GUILD_OFFSET_MS;
    var d = new Date(t);
    return { hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
  }

  function guildAddDays(dateIso, days) {
    var parts = dateIso.split("-").map(Number);
    var anchor = Date.UTC(parts[0], parts[1] - 1, parts[2] + days, 0, 0, 0) - GUILD_OFFSET_MS;
    return guildDateFromInstant(new Date(anchor));
  }

  function guildInstantFromLocal(dateIso, hours, minutes) {
    var parts = dateIso.split("-").map(Number);
    return new Date(
      Date.UTC(parts[0], parts[1] - 1, parts[2], hours, minutes || 0, 0) - GUILD_OFFSET_MS,
    ).toISOString();
  }

  function snapStartAtToWholeHour(iso) {
    if (!iso) return iso;
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    var date = guildDateFromInstant(iso);
    var parts = guildTimeParts(iso);
    var h = parts.hours;
    if (parts.minutes >= 30) {
      h += 1;
      if (h >= 24) {
        h = 0;
        date = guildAddDays(date, 1);
      }
    }
    return guildInstantFromLocal(date, h, 0);
  }

  function inferStart(endDate) {
    var end = new Date(endDate).getTime();
    if (Number.isNaN(end)) return new Date(0).toISOString();
    return snapStartAtToWholeHour(new Date(end - TRIAL_MS).toISOString());
  }

  function resolveMemberSchedule(parsed) {
    if (!parsed) {
      return { endDate: null, inferredStartAt: null };
    }
    if (!parsed.endDate) {
      var fallbackEnd = new Date(Date.now() + TRIAL_MS).toISOString();
      return {
        endDate: fallbackEnd,
        inferredStartAt: parsed.inferredStartAt || inferStart(fallbackEnd),
      };
    }
    var endDate = parsed.endDate;
    return {
      endDate: endDate,
      inferredStartAt: parsed.inferredStartAt || inferStart(endDate),
    };
  }

  function snapToLastDailyReset(at) {
    var date = guildDateFromInstant(at);
    var parts = guildTimeParts(at);
    var pastResetToday =
      parts.hours > GUILD_DAILY_RESET_HOUR ||
      (parts.hours === GUILD_DAILY_RESET_HOUR && parts.minutes >= 0);
    var resetDate = pastResetToday ? date : guildAddDays(date, -1);
    return new Date(guildInstantFromLocal(resetDate, GUILD_DAILY_RESET_HOUR, 0));
  }

  function guildDayOfWeek(iso) {
    var t = new Date(iso).getTime() + GUILD_OFFSET_MS;
    return new Date(t).getUTCDay();
  }

  function guildWeekStartFromInstant(iso) {
    var at = new Date(iso);
    if (Number.isNaN(at.getTime())) {
      return guildWeekStartFromInstant(new Date().toISOString());
    }
    var lastReset = snapToLastDailyReset(at);
    var resetDate = guildDateFromInstant(lastReset);
    var day = guildDayOfWeek(guildInstantFromLocal(resetDate, 12, 0));
    var mondayOffset = day === 0 ? -6 : 1 - day;
    var mondayDate = guildAddDays(resetDate, mondayOffset);
    var weekStartMs = new Date(
      guildInstantFromLocal(mondayDate, GUILD_DAILY_RESET_HOUR, 0),
    ).getTime();
    return guildDateFromInstant(new Date(weekStartMs));
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
    var skillData = cmp.SKILL_DATA || findSkillDataMap();
    var fromTrialSkills = buildPayloadFromTrialSkillsOnly(cmp, skillData, "component");
    if (fromTrialSkills) return fromTrialSkills;

    var guild = readGuildFromHost(cmp);
    if (!guild || !guild.trial) {
      return { error: "No active guild trial on guild$.trial", guild: guild || null };
    }
    return buildSkillsPayload(guild, skillData, cmp, "component");
  }

  function isNodeAfter(startEl, node) {
    if (!startEl || !node || !startEl.compareDocumentPosition) return false;
    return Boolean(startEl.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function isNodeBefore(endEl, node) {
    if (!endEl || !node) return true;
    if (!node.compareDocumentPosition) return true;
    return Boolean(node.compareDocumentPosition(endEl) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function findSkillBlocksSorted() {
    var skillBlocks = [];
    var seenSkills = {};
    var trialRows = findSkillTrialSummaryRows();

    for (var tr = 0; tr < trialRows.length; tr++) {
      var btn = trialRows[tr];
      var nameEl = btn.querySelector(".name");
      var skillName = skillNameFromTrialRowName(nameEl && nameEl.textContent ? nameEl.textContent : "");
      if (!skillName || seenSkills[skillName]) continue;
      seenSkills[skillName] = true;
      skillBlocks.push({ el: btn, skillName: skillName });
    }

    if (!skillBlocks.length) {
      var headers = document.querySelectorAll("div, span, button, h1, h2, h3, h4, p");
      for (var i = 0; i < headers.length; i++) {
        var headerSkill = headerSkillName(headers[i]);
        if (!headerSkill || seenSkills[headerSkill]) continue;
        seenSkills[headerSkill] = true;
        skillBlocks.push({ el: headers[i], skillName: headerSkill });
      }
    }

    skillBlocks.sort(function (a, b) {
      var ar = a.el.getBoundingClientRect();
      var br = b.el.getBoundingClientRect();
      if (Math.abs(ar.left - br.left) > 8) return ar.left - br.left;
      return ar.top - br.top;
    });

    return skillBlocks;
  }

  function skillNameForDomNode(node, skillBlocks) {
    if (!node || !skillBlocks.length) return null;
    var rect = node.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    var cx = rect.left + rect.width / 2;

    for (var b = 0; b < skillBlocks.length; b++) {
      var block = skillBlocks[b];
      var hRect = block.el.getBoundingClientRect();
      var left = hRect.left - 12;
      var right =
        b < skillBlocks.length - 1
          ? skillBlocks[b + 1].el.getBoundingClientRect().left - 4
          : hRect.right + Math.max(220, window.innerWidth - hRect.right);
      if (cx >= left && cx < right) return block.skillName;
    }

    var best = null;
    var bestDist = Infinity;
    for (var j = 0; j < skillBlocks.length; j++) {
      var candidate = skillBlocks[j].el.getBoundingClientRect();
      var center = candidate.left + candidate.width / 2;
      var dist = Math.abs(cx - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = skillBlocks[j].skillName;
      }
    }
    return best;
  }

  function normalizeFromDomColumns() {
    var skillBlocks = findSkillBlocksSorted();
    if (!skillBlocks.length) return null;

    var membersBySkill = {};
    for (var si = 0; si < SKILL_ORDER.length; si++) {
      membersBySkill[SKILL_ORDER[si]] = [];
    }

    var seenMemberKeys = {};
    var buttons = document.querySelectorAll("button, [role='button']");
    for (var bi = 0; bi < buttons.length; bi++) {
      var btn = buttons[bi];
      var parsed = parseMemberButton(btn.textContent || "");
      if (!parsed) continue;

      var skillName = skillNameForDomNode(btn, skillBlocks);
      if (!skillName) continue;

      var memberKey = normalizeMemberKey(parsed.displayName);
      if (seenMemberKeys[memberKey]) continue;
      seenMemberKeys[memberKey] = skillName;

      var endDate = parsed.endDate;
      var inferredStartAt = parsed.inferredStartAt;
      if (!endDate) {
        endDate = new Date(Date.now() + TRIAL_MS).toISOString();
        inferredStartAt = inferStart(endDate);
      } else if (!inferredStartAt) {
        inferredStartAt = inferStart(endDate);
      }

      membersBySkill[skillName].push({
        displayName: parsed.displayName,
        skillName: skillName,
        skillId: skillName,
        exp: parsed.exp,
        endDate: endDate,
        inferredStartAt: inferredStartAt,
        method: "dom-columns",
      });
    }

    var skills = [];
    for (var sk = 0; sk < SKILL_ORDER.length; sk++) {
      var skill = SKILL_ORDER[sk];
      var members = membersBySkill[skill];
      if (members.length) {
        skills.push({ skill: skill, skillId: skill, members: members });
      }
    }

    if (!skills.length) return null;

    return {
      v: 1,
      importedAt: new Date().toISOString(),
      source: "dom-columns",
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
      errors: ["Column DOM sync — verify skills and times in planner"],
    };
  }

  function skillNameFromTrialRowName(text) {
    var name = String(text || "")
      .split("\n")[0]
      .trim();
    if (!name || name.length > 80) return null;
    for (var si = 0; si < SKILL_ORDER.length; si++) {
      var skill = SKILL_ORDER[si];
      if (new RegExp("^" + skill.replace(/-/g, "\\-") + "\\s+Trial\\b", "i").test(name)) {
        return skill;
      }
    }
    return null;
  }

  function headerSkillName(el) {
    if (!el) return null;
    var fromName = el.querySelector && el.querySelector(".name");
    if (fromName) {
      var direct = skillNameFromTrialRowName(fromName.textContent || "");
      if (direct) return direct;
    }
    var text = (el.textContent || "").trim();
    if (text.length > 80) return null;
    return skillNameFromTrialRowName(text);
  }

  /** Skill trial header row: button.row with div.name "Woodcutting Trial" and div.amount. */
  function isSkillTrialSummaryRow(el) {
    if (!el || el.tagName !== "BUTTON") return false;
    if (elementHasClass(el, "row-dark")) return false;
    if (!elementHasClass(el, "row")) return false;
    var nameEl = el.querySelector(".name");
    var amountEl = el.querySelector(".amount");
    if (!nameEl || !amountEl) return false;
    return !!skillNameFromTrialRowName(nameEl.textContent || "");
  }

  function findSkillTrialSummaryRows() {
    var buttons = queryButtonsIncludingShadow(document.body, "button.row");
    var out = [];
    var seen = {};
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (!isSkillTrialSummaryRow(btn) || seen[btn]) continue;
      seen[btn] = true;
      out.push(btn);
    }
    return out;
  }

  function parseCompactXpNumber(raw) {
    if (raw == null || raw === "") return null;
    var s = String(raw).replace(/,/g, "").trim();
    var m = s.match(/^([\d.]+)\s*([kKmM])?$/);
    if (!m) {
      var n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    var num = parseFloat(m[1]);
    if (Number.isNaN(num)) return null;
    var suffix = (m[2] || "").toLowerCase();
    if (suffix === "k") return Math.round(num * 1000);
    if (suffix === "m") return Math.round(num * 1000000);
    return Math.round(num);
  }

  /** Ironwood shows "Complete" instead of "X / Y XP" on finished skill trial rows. */
  function parseSkillTrialProgressText(text) {
    if (!text) return null;
    var flat = String(text).replace(/\s+/g, " ").trim();
    if (/^\s*complete(?:d)?\s*$/i.test(flat)) {
      return { complete: true, currentExp: null, requiredExp: null };
    }
    var slash = flat.match(/([\d.,]+[kKmM]?)\s*\/\s*([\d.,]+[kKmM]?)(?:\s*XP)?/i);
    if (slash) {
      var current = parseCompactXpNumber(slash[1]);
      var required = parseCompactXpNumber(slash[2]);
      if (current != null && required != null) {
        return {
          complete: current >= required,
          currentExp: current,
          requiredExp: required,
        };
      }
    }
    return null;
  }

  function parseSkillTrialProgressFromAmountEl(amountEl) {
    if (!amountEl) return null;
    var candidates = [];
    var span = amountEl.querySelector("span");
    if (span) candidates.push(span.textContent || "");
    candidates.push(amountEl.textContent || "");
    for (var ci = 0; ci < candidates.length; ci++) {
      var text = candidates[ci];
      var progress = parseSkillTrialProgressText(text);
      if (progress) return progress;
      if (/^\s*complete(?:d)?\s*$/i.test(String(text || "").trim())) {
        return { complete: true, currentExp: null, requiredExp: null };
      }
    }
    return null;
  }

  function mergeSkillProgressMaps(into, from) {
    if (!from) return into;
    for (var skill in from) {
      if (!Object.prototype.hasOwnProperty.call(from, skill)) continue;
      if (!into[skill]) into[skill] = from[skill];
    }
    return into;
  }

  function collectDomSkillProgressFromBodyText() {
    var bodyText = document.body ? document.body.innerText || "" : "";
    if (!/\bTrial\b/i.test(bodyText)) return {};

    var bySkill = {};
    for (var s = 0; s < SKILL_ORDER.length; s++) {
      var skill = SKILL_ORDER[s];
      var escaped = skill.replace(/-/g, "\\-");
      var nextPattern = SKILL_ORDER.map(function (sk) {
        return sk.replace(/-/g, "\\-");
      }).join("|");
      var re = new RegExp(
        escaped + "\\s+Trial\\s*([\\s\\S]*?)(?=(?:" + nextPattern + ")\\s+Trial\\b|$)",
        "i",
      );
      var match = bodyText.match(re);
      if (!match) continue;

      var section = match[1] || "";
      var progress = null;
      var lines = section.split("\n");
      for (var li = 0; li < lines.length; li++) {
        progress = parseSkillTrialProgressText(lines[li]);
        if (progress) break;
      }
      if (progress) bySkill[skill] = progress;
    }
    return bySkill;
  }

  function collectDomSkillProgress() {
    var bySkill = {};
    var trialRows = findSkillTrialSummaryRows();
    for (var ri = 0; ri < trialRows.length; ri++) {
      var btn = trialRows[ri];
      var nameEl = btn.querySelector(".name");
      var amountEl = btn.querySelector(".amount");
      if (!nameEl || !amountEl) continue;
      var skillName = skillNameFromTrialRowName(nameEl.textContent || "");
      if (!skillName) continue;
      var progress = parseSkillTrialProgressFromAmountEl(amountEl);
      if (progress) bySkill[skillName] = progress;
    }

    mergeSkillProgressMaps(bySkill, collectDomSkillProgressFromBodyText());

    var headers = document.querySelectorAll("div, span, button, h1, h2, h3, h4, p");
    for (var i = 0; i < headers.length; i++) {
      var skillNameFallback = headerSkillName(headers[i]);
      if (!skillNameFallback || bySkill[skillNameFallback]) continue;
      var amountElFallback =
        headers[i].querySelector && headers[i].querySelector(".amount");
      var progressFallback = amountElFallback
        ? parseSkillTrialProgressFromAmountEl(amountElFallback)
        : null;
      if (!progressFallback) {
        var text = headers[i].textContent || "";
        progressFallback = parseSkillTrialProgressText(text);
        if (!progressFallback) {
          var lines = text.split("\n");
          for (var li = 0; li < lines.length; li++) {
            progressFallback = parseSkillTrialProgressText(lines[li]);
            if (progressFallback) break;
          }
        }
      }
      if (progressFallback) bySkill[skillNameFallback] = progressFallback;
    }
    return bySkill;
  }

  function trialSkillMetaByName(guild, skillData, cmp) {
    var trial = guild && guild.trial;
    if (!trial) return {};
    var meta = {};
    var rows = [];
    if (cmp && cmp.trialSkills$) {
      var ts = readObservableValue(cmp.trialSkills$);
      if (Array.isArray(ts)) rows = ts;
    }
    if (!rows.length && trial.skills) rows = Object.values(trial.skills);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var name = skillNameForRow(skillData, row);
      if (name) meta[name] = row;
    }
    return meta;
  }

  function resolveSkillProgress(skillName, payloadRequiredExp, metaRow, domProgress) {
    var requiredExp =
      payloadRequiredExp ||
      (metaRow && metaRow.requiredExp) ||
      (domProgress && domProgress.requiredExp) ||
      0;

    var explicitComplete =
      (metaRow && (metaRow.complete === true || metaRow.completed === true)) ||
      (domProgress && domProgress.complete === true);

    var currentExp =
      metaRow && metaRow.currentExp != null
        ? metaRow.currentExp
        : domProgress && domProgress.currentExp != null
          ? domProgress.currentExp
          : 0;

    if (explicitComplete && requiredExp && (!currentExp || currentExp < requiredExp)) {
      currentExp = requiredExp;
    }

    var complete =
      explicitComplete || (requiredExp > 0 && currentExp >= requiredExp);

    return {
      currentExp: currentExp || 0,
      requiredExp: requiredExp || 0,
      complete: complete,
    };
  }

  function skillRowCompletion(row, requiredExp) {
    if (!row) {
      return { currentExp: 0, requiredExp: requiredExp || 0, complete: false };
    }
    if (row.complete === true || row.completed === true) {
      var req = requiredExp || row.requiredExp || 0;
      var cur = row.currentExp != null ? row.currentExp : req;
      if (req && cur < req) cur = req;
      return { currentExp: cur || 0, requiredExp: req, complete: true };
    }
    var req2 = requiredExp || row.requiredExp || 0;
    var cur2 = row.currentExp || 0;
    return {
      currentExp: cur2,
      requiredExp: req2,
      complete: req2 > 0 && cur2 >= req2,
    };
  }

  function enrichPayloadSkillCompletions(payload) {
    if (!payload || !payload.skills) return payload;

    var guild = readGuildFromAnySource() || {};
    var skillData = findSkillDataMap();
    var cmp = findGuildTrialsComponent();
    var domProgress = collectDomSkillProgress();
    var metaBySkill = trialSkillMetaByName(guild, skillData, cmp);

    var payloadRequiredExp =
      payload.requiredExp || (guild.trial && guild.trial.requiredExp) || null;

    if (!payloadRequiredExp) {
      var bodyMatch = (document.body.innerText || "").match(
        /required\s*exp\s*([\d.,]+[kKmM]?)/i,
      );
      if (bodyMatch) payloadRequiredExp = parseCompactXpNumber(bodyMatch[1]);
    }

    var bySkill = {};
    for (var i = 0; i < payload.skills.length; i++) {
      bySkill[payload.skills[i].skill] = payload.skills[i];
    }

    for (var si = 0; si < payload.skills.length; si++) {
      var skillRow = payload.skills[si];
      var resolved = resolveSkillProgress(
        skillRow.skill,
        payloadRequiredExp || skillRow.requiredExp,
        metaBySkill[skillRow.skill],
        domProgress[skillRow.skill],
      );
      skillRow.currentExp = resolved.currentExp;
      skillRow.requiredExp =
        resolved.requiredExp || skillRow.requiredExp || payloadRequiredExp || 0;
      skillRow.complete = resolved.complete;
    }

    for (var sk = 0; sk < SKILL_ORDER.length; sk++) {
      var skill = SKILL_ORDER[sk];
      if (bySkill[skill]) continue;
      var meta = metaBySkill[skill];
      var dom = domProgress[skill];
      if (!meta && !dom) continue;
      var resolved2 = resolveSkillProgress(skill, payloadRequiredExp, meta, dom);
      if (!resolved2.complete && !(meta && meta.currentExp > 0)) continue;
      payload.skills.push({
        skill: skill,
        skillId: (meta && meta.id) || skill,
        currentExp: resolved2.currentExp,
        requiredExp: resolved2.requiredExp || payloadRequiredExp || 0,
        complete: resolved2.complete,
        members: [],
      });
      bySkill[skill] = true;
    }

    if (payloadRequiredExp) payload.requiredExp = payloadRequiredExp;

    var skillCompletions = {};
    for (var ski = 0; ski < SKILL_ORDER.length; ski++) {
      var skName = SKILL_ORDER[ski];
      var rowRef = bySkill[skName];
      if (rowRef && rowRef.complete) skillCompletions[skName] = true;
      else if (domProgress[skName] && domProgress[skName].complete) skillCompletions[skName] = true;
    }
    if (Object.keys(skillCompletions).length) payload.skillCompletions = skillCompletions;

    var completed = 0;
    for (var ci = 0; ci < payload.skills.length; ci++) {
      if (payload.skills[ci].complete) completed++;
    }
    payload.trialsCompleted = completed;

    payload.skills.sort(function (a, b) {
      return SKILL_ORDER.indexOf(a.skill) - SKILL_ORDER.indexOf(b.skill);
    });

    applyPayloadTrialWeekFromGuild(payload);
    return payload;
  }

  function elementHasClass(el, className) {
    if (!el) return false;
    if (el.classList && el.classList.contains) {
      return el.classList.contains(className);
    }
    if (!el.className || typeof el.className !== "string") return false;
    return (" " + el.className + " ").indexOf(" " + className + " ") >= 0;
  }

  function hoursFromTimeText(text) {
    var m = String(text || "").match(/\b(\d+)\s*h(?:ours?)?\b/i);
    return m ? Number(m[1]) : null;
  }

  function scheduleFromHoursLeft(hoursLeft) {
    if (hoursLeft == null || hoursLeft < 0 || hoursLeft > 24) {
      return { endDate: null, inferredStartAt: null };
    }
    var endMs = Date.now() + hoursLeft * 60 * 60 * 1000;
    var endDate = new Date(endMs).toISOString();
    return {
      endDate: endDate,
      inferredStartAt: inferStart(endDate),
    };
  }

  function appendAdjacentHours(lines, li, chunk) {
    if (li + 1 >= lines.length) return chunk;
    var next = lines[li + 1].trim();
    if (/^\d+\s*h(?:ours?)?$/i.test(next)) return chunk + " " + next;
    return chunk;
  }

  function queryButtonsIncludingShadow(root, selector) {
    var out = [];
    var seen = {};
    function walk(node) {
      if (!node) return;
      try {
        if (node.querySelectorAll) {
          var matches = node.querySelectorAll(selector);
          for (var i = 0; i < matches.length; i++) {
            if (!seen[matches[i]]) {
              seen[matches[i]] = true;
              out.push(matches[i]);
            }
          }
        }
      } catch (e) {
        /* skip */
      }
      if (node.shadowRoot) walk(node.shadowRoot);
      var children = node.children;
      if (!children) return;
      for (var c = 0; c < children.length; c++) walk(children[c]);
    }
    walk(root || document.body);
    return out;
  }

  function isTrialAssignmentButton(el) {
    if (!el || el.tagName !== "BUTTON") return false;
    if (!elementHasClass(el, "row-dark")) return false;
    var nameEl = el.querySelector(".name");
    var amountEl = el.querySelector(".amount");
    if (!nameEl || !amountEl) return false;
    if (!/XP/i.test(amountEl.textContent || "")) return false;
    return isLikelyMemberName((nameEl.textContent || "").trim());
  }

  function skillForTrialAssignmentButton(btn) {
    var node = btn;
    while (node && node !== document.body) {
      var sib = node.previousElementSibling;
      while (sib) {
        if (sib.tagName === "BUTTON") {
          if (isSkillTrialSummaryRow(sib)) {
            var nameEl = sib.querySelector(".name");
            return skillNameFromTrialRowName(nameEl && nameEl.textContent ? nameEl.textContent : "");
          }
          if (elementHasClass(sib, "row-dark")) {
            sib = sib.previousElementSibling;
            continue;
          }
        }
        var skill = headerSkillName(sib);
        if (skill) return skill;
        sib = sib.previousElementSibling;
      }
      node = node.parentElement;
    }
    return null;
  }

  function parseTrialAssignmentButton(btn) {
    var nameEl = btn.querySelector(".name");
    var amountEl = btn.querySelector(".amount");
    var timeEl = btn.querySelector(".time");
    if (!nameEl || !amountEl) return parseMemberButton(btn.textContent || "");

    var displayName = (nameEl.textContent || "").trim();
    var xpM = (amountEl.textContent || "").match(/([\d,]+)\s*XP/i);
    if (!xpM || !isLikelyMemberName(displayName)) return null;

    var hoursLeft =
      (timeEl ? hoursFromTimeText(timeEl.textContent) : null) ||
      hoursFromTimeText(btn.textContent || "");
    var exp = Number(xpM[1].replace(/,/g, ""));
    var schedule = scheduleFromHoursLeft(hoursLeft);

    return {
      displayName: displayName,
      exp: exp,
      endDate: schedule.endDate,
      inferredStartAt: schedule.inferredStartAt,
      hoursLeft: hoursLeft,
    };
  }

  function findTrialAssignmentButtons() {
    var buttons = queryButtonsIncludingShadow(
      document.body,
      "button.row-dark, button.row.row-dark",
    );
    var out = [];
    var seen = {};
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (!isTrialAssignmentButton(btn) || seen[btn]) continue;
      seen[btn] = true;
      out.push(btn);
    }
    return out;
  }

  function normalizeFromDomRows() {
    var buttons = findTrialAssignmentButtons();
    if (!buttons.length) return null;

    var membersBySkill = {};
    for (var si = 0; si < SKILL_ORDER.length; si++) {
      membersBySkill[SKILL_ORDER[si]] = [];
    }

    var seenMemberKeys = {};
    for (var bi = 0; bi < buttons.length; bi++) {
      var btn = buttons[bi];
      var parsed = parseTrialAssignmentButton(btn);
      if (!parsed) continue;

      var skillName = skillForTrialAssignmentButton(btn);
      if (!skillName) continue;

      var memberKey = normalizeMemberKey(parsed.displayName);
      if (seenMemberKeys[memberKey]) continue;
      seenMemberKeys[memberKey] = true;

      var schedule = resolveMemberSchedule(parsed);
      membersBySkill[skillName].push({
        displayName: parsed.displayName,
        skillName: skillName,
        skillId: skillName,
        exp: parsed.exp,
        endDate: schedule.endDate,
        inferredStartAt: schedule.inferredStartAt,
        method: "dom-rows",
      });
    }

    var skills = [];
    for (var sk = 0; sk < SKILL_ORDER.length; sk++) {
      var skill = SKILL_ORDER[sk];
      var members = membersBySkill[skill];
      if (members.length) {
        skills.push({ skill: skill, skillId: skill, members: members });
      }
    }

    if (!skills.length) return null;

    return {
      v: 1,
      importedAt: new Date().toISOString(),
      source: "dom-rows",
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
      errors: [],
    };
  }

  function collectClickablesBetween(startEl, endEl) {
    var nodes = document.querySelectorAll("button, [role='button'], a, div, span");
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!isNodeAfter(startEl, node)) continue;
      if (endEl && !isNodeBefore(endEl, node)) continue;
      out.push(node);
    }
    return out;
  }

  function normalizeMemberKey(name) {
    return (name || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isLikelyMemberName(name) {
    if (!name || name.length < 2 || name.length > 40) return false;
    var lower = name.toLowerCase().trim();
    if (
      /^(required|complete|join|choose|start|cancel|remove|add|trial|guild|credit|credits|exp|xp|none|empty|members|quests|trials|overview|settings|\d)/i.test(
        lower,
      )
    ) {
      return false;
    }
    for (var si = 0; si < SKILL_ORDER.length; si++) {
      if (lower === SKILL_ORDER[si].toLowerCase()) return false;
      if (
        new RegExp("^" + SKILL_ORDER[si].replace(/-/g, "\\-") + "\\s+trial", "i").test(name)
      ) {
        return false;
      }
    }
    if (/\d\s*\/\s*\d/.test(name)) return false;
    return true;
  }

  function isTrialMemberXpLine(line) {
    if (!line || !/[\d,]+\s*XP/i.test(line)) return false;
    if (/\d[\d,]*\s*\/\s*\d[\d,]*\s*XP/i.test(line)) return false;
    if (/required\s*exp/i.test(line)) return false;
    if (/^\s*complete\s*$/i.test(line)) return false;
    return true;
  }

  function parseTrialMemberText(raw) {
    if (!raw) return null;
    var text = String(raw).replace(/\s+/g, " ").trim();
    var xpM = text.match(/([\d,]+)\s*XP/i);
    if (!xpM) return null;

    var exp = Number(xpM[1].replace(/,/g, ""));
    var hoursM = text.match(/\b(\d+)\s*h(?:ours?)?\b/i);
    var hoursLeft = hoursM ? Number(hoursM[1]) : null;

    var name = text
      .replace(/([\d,]+)\s*XP/gi, " ")
      .replace(/\b(\d+)\s*h(?:ours?)?\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!isLikelyMemberName(name)) return null;

    var endDate = null;
    var inferredStartAt = null;
    if (hoursLeft != null) {
      var schedule = scheduleFromHoursLeft(hoursLeft);
      endDate = schedule.endDate;
      inferredStartAt = schedule.inferredStartAt;
    }

    return {
      displayName: name,
      exp: exp,
      endDate: endDate,
      inferredStartAt: inferredStartAt,
      hoursLeft: hoursLeft,
    };
  }

  function parseMemberContextFromLines(lines, li) {
    var line = lines[li].trim();
    if (!isTrialMemberXpLine(line)) return null;

    var chunk = line;
    if (li > 0) {
      var prev = lines[li - 1].trim();
      if (/^\d+\s*h(?:ours?)?$/i.test(prev)) {
        chunk = (li > 1 ? lines[li - 2].trim() + " " : "") + prev + " " + line;
      } else if (!/XP/i.test(prev) && !/^\d+\s*h/i.test(prev)) {
        chunk = prev + " " + line;
      }
    }
    chunk = appendAdjacentHours(lines, li, chunk);

    return parseTrialMemberText(chunk);
  }

  function parseMemberLine(line, prevLine, nextLine) {
    if (!isTrialMemberXpLine(line)) return null;
    var chunk = line;
    if (prevLine) {
      var prev = String(prevLine).trim();
      if (/^\d+\s*h(?:ours?)?$/i.test(prev)) {
        chunk = prev + " " + line;
      } else if (!/XP/i.test(prev) && !/^\d+\s*h/i.test(prev)) {
        chunk = prev + " " + line;
      }
    }
    if (nextLine && /^\d+\s*h(?:ours?)?$/i.test(String(nextLine).trim())) {
      chunk = chunk + " " + String(nextLine).trim();
    }
    return parseTrialMemberText(chunk);
  }

  function dedupeSkillsByMemberName(skills) {
    var seenMembers = {};
    var out = [];
    for (var i = 0; i < skills.length; i++) {
      var skill = skills[i];
      var members = [];
      for (var j = 0; j < (skill.members || []).length; j++) {
        var m = skill.members[j];
        if (!isLikelyMemberName(m.displayName)) continue;
        var key = normalizeMemberKey(m.displayName);
        if (seenMembers[key]) continue;
        seenMembers[key] = true;
        members.push(m);
      }
      if (members.length) {
        out.push({
          skill: skill.skill,
          skillId: skill.skillId,
          members: members,
        });
      }
    }
    return out;
  }

  function parseMemberButton(btnText) {
    var flat = parseTrialMemberText(String(btnText).replace(/\n/g, " "));
    if (flat) return flat;

    var lines = String(btnText)
      .split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    for (var li = 0; li < lines.length; li++) {
      var parsed = parseMemberContextFromLines(lines, li);
      if (parsed) return parsed;
    }
    return null;
  }

  function normalizeFromDomScoped() {
    var headers = document.querySelectorAll("div, span, button, h1, h2, h3, h4, p");
    var skillBlocks = [];
    var seenSkills = {};

    for (var i = 0; i < headers.length; i++) {
      var skillName = headerSkillName(headers[i]);
      if (!skillName || seenSkills[skillName]) continue;
      seenSkills[skillName] = true;
      skillBlocks.push({ el: headers[i], skillName: skillName });
    }

    if (!skillBlocks.length) return normalizeFromVisibleText();

    var skills = [];

    for (var b = 0; b < skillBlocks.length; b++) {
      var block = skillBlocks[b];
      var nextEl = skillBlocks[b + 1] ? skillBlocks[b + 1].el : null;
      var members = [];
      var clickables = collectClickablesBetween(block.el, nextEl);

      for (var bi = 0; bi < clickables.length; bi++) {
        var parsed = parseMemberButton(clickables[bi].textContent || "");
        if (!parsed) continue;
        var schedule = resolveMemberSchedule(parsed);
        members.push({
          displayName: parsed.displayName,
          skillName: block.skillName,
          skillId: block.skillName,
          exp: parsed.exp,
          endDate: schedule.endDate,
          inferredStartAt: schedule.inferredStartAt,
          method: "dom",
        });
      }

      if (members.length) {
        skills.push({ skill: block.skillName, skillId: block.skillName, members: members });
      }
    }

    if (!skills.length) return normalizeFromVisibleText();

    skills = dedupeSkillsByMemberName(skills);

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

  function normalizeFromVisibleText() {
    var bodyText = document.body ? document.body.innerText || "" : "";
    if (!/\bTrial\b/i.test(bodyText)) return null;

    var skills = [];
    for (var s = 0; s < SKILL_ORDER.length; s++) {
      var skill = SKILL_ORDER[s];
      var escaped = skill.replace(/-/g, "\\-");
      var nextPattern = SKILL_ORDER.map(function (sk) {
        return sk.replace(/-/g, "\\-");
      }).join("|");
      var re = new RegExp(
        escaped + "\\s+Trial\\s*([\\s\\S]*?)(?=(?:" + nextPattern + ")\\s+Trial\\b|$)",
        "i",
      );
      var match = bodyText.match(re);
      if (!match) continue;

      var section = match[1] || "";
      var members = [];
      var lines = section.split("\n");
      for (var li = 0; li < lines.length; li++) {
        var parsed = parseMemberContextFromLines(lines, li);
        if (!parsed) continue;
        var schedule = resolveMemberSchedule(parsed);
        members.push({
          displayName: parsed.displayName,
          skillName: skill,
          skillId: skill,
          exp: parsed.exp,
          endDate: schedule.endDate,
          inferredStartAt: schedule.inferredStartAt,
          method: "dom-text",
        });
      }

      if (members.length) {
        skills.push({ skill: skill, skillId: skill, members: members });
      }
    }

    if (!skills.length) return null;

    skills = dedupeSkillsByMemberName(skills);
    if (!skills.length) return null;

    return {
      v: 1,
      importedAt: new Date().toISOString(),
      source: "dom-text",
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
      errors: ["Text DOM fallback — verify synced times in planner"],
    };
  }

  function readTrialPayloadFromPage() {
    var fromDomRows = normalizeFromDomRows();
    if (fromDomRows && countMembersInPayload(fromDomRows) > 0) {
      return finalizeTrialPayload(fromDomRows);
    }

    var fromDomText = normalizeFromVisibleText();
    if (fromDomText && countMembersInPayload(fromDomText) > 0) {
      return finalizeTrialPayload(fromDomText);
    }

    var candidates = [];
    var cmp = findGuildTrialsComponent();
    var skillData = findSkillDataMap();
    var guild = readGuildFromAnySource();
    if (!guild || !guild.trial) {
      var capturedGuild = guildFromCaptureRaw();
      if (capturedGuild) guild = capturedGuild;
    }

    if (cmp) {
      var fromTrialSkills = buildPayloadFromTrialSkillsOnly(cmp, skillData, "component");
      if (fromTrialSkills) candidates.push(fromTrialSkills);

      var fromComponent = normalizeFromComponent(cmp);
      if (fromComponent && !fromComponent.error) candidates.push(fromComponent);
    }

    if (guild && guild.trial) {
      candidates.push(buildSkillsPayload(guild, skillData, cmp, "api"));
    }

    var fromDomRowsFallback = normalizeFromDomRows();
    if (fromDomRowsFallback) candidates.push(fromDomRowsFallback);

    var fromDomTextFallback = normalizeFromVisibleText();
    if (fromDomTextFallback) candidates.push(fromDomTextFallback);

    var fromDom = normalizeFromDomScoped();
    if (fromDom) candidates.push(fromDom);

    var fromDomColumns = normalizeFromDomColumns();
    if (fromDomColumns) candidates.push(fromDomColumns);

    var best = null;
    var bestScore = -1;
    for (var ci = 0; ci < candidates.length; ci++) {
      var score = payloadScore(candidates[ci]);
      if (payloadHasDuplicateMembers(candidates[ci]) && candidates[ci].source !== "dom-columns") {
        score -= 50;
      }
      if (score > bestScore) {
        bestScore = score;
        best = candidates[ci];
      }
    }

    if (best) {
      for (var mergeIdx = 0; mergeIdx < candidates.length; mergeIdx++) {
        if (candidates[mergeIdx] !== best) {
          mergePayloadMembers(best, candidates[mergeIdx]);
        }
      }
      ensureTrialMembersOnPayload(best, guild, skillData);
      finalizeTrialPayload(best);
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
    await sleep(2500);

    for (var trialAttempt = 0; trialAttempt < 60; trialAttempt++) {
      host = findGuildTrialsComponent() || host;
      if (trialAttempt === 4 || trialAttempt === 12 || trialAttempt === 24) {
        await triggerTrialLoad(host);
        await sleep(800);
      }

      var payload = readTrialPayloadFromPage();
      if (!payload || countMembersInPayload(payload) === 0) {
        var domRowsPayload = normalizeFromDomRows();
        if (domRowsPayload && countMembersInPayload(domRowsPayload) > 0) {
          payload = domRowsPayload;
        } else {
          var domTextPayload = normalizeFromVisibleText();
          if (domTextPayload && countMembersInPayload(domTextPayload) > 0) {
            payload = domTextPayload;
          } else {
            var domColumnsPayload = normalizeFromDomColumns();
            if (domColumnsPayload && countMembersInPayload(domColumnsPayload) > 0) {
              payload = domColumnsPayload;
            }
          }
        }
      }
      if (payload && payloadHasUsableTrialData(payload)) {
        var memberCount = countMembersInPayload(payload);
        if (memberCount > 0) {
          setStatus(
            "Trial data ready",
            memberCount +
              " assignment(s) via " +
              (payload.source || "unknown") +
              ".",
          );
          return finalizeTrialPayload(payload);
        }
        if (trialAttempt >= 59) {
          setStatus(
            "Trial data ready",
            "Skill progress via " +
              (payload.source || "unknown") +
              " (no active assignments).",
          );
          return finalizeTrialPayload(payload);
        }
      }

      var cmp = findGuildTrialsComponent();
      var guild = readGuildFromAnySource();
      var domProbe = normalizeFromDomScoped();
      var detail =
        "component=" +
        (cmp ? "yes" : "no") +
        ", guild.trial=" +
        (guild && guild.trial ? "yes" : "no") +
        ", trial.members=" +
        (guild && guild.trial && guild.trial.members
          ? Object.keys(guild.trial.members).length
          : 0) +
        ", domMembers=" +
        (domProbe ? countMembersInPayload(domProbe) : 0) +
        ", capture=" +
        (captureState().raw ? captureState().raw.length : 0);

      setStatus(
        "Loading trial data…",
        trialAttempt === 0 ? detail : detail + " (" + (trialAttempt + 1) + "/60)",
      );
      await sleep(600);
    }

    var fallbackPayload = readTrialPayloadFromPage();
    if (fallbackPayload && payloadHasUsableTrialData(fallbackPayload)) {
      setStatus(
        "Trial data ready (partial)",
        "Using last readable trial snapshot.",
      );
      return attachDomAssignmentsToPayload(fallbackPayload);
    }

    setStatus(
      "Continuing without trial assignments",
      "Building deposits and skill completions will still sync if available.",
    );
    return attachDomAssignmentsToPayload(buildMinimalGameSyncPayload());
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

      payload = enrichPayloadSkillCompletions(payload);

      var host = findGuildHost();
      try {
        var buildingMaterials = await readBuildingMaterialsPayload(host);
        if (buildingMaterials) {
          payload.buildingMaterials = buildingMaterials;
        }
      } catch (buildingErr) {
        /* building materials are optional */
      }

      payload = await refreshTrialCompletionsAfterBuildings(payload, host);

      payload = attachDomAssignmentsToPayload(payload);

      var activeCount = countActiveAssignments(payload);

      setStatus(
        "Done! Returning to Guild Trials…",
        hasSyncableGameData(payload, activeCount)
          ? syncResultSummary(payload, activeCount) + " for week " + payload.trialWeekStart
          : "No changes to apply for week " + payload.trialWeekStart,
      );
      sessionStorage.removeItem(SYNC_RUN_KEY);
      await sleep(600);
      deliverGameSyncToPlanner(payload);
    } catch (err) {
      setStatus("Sync failed", err && err.message ? err.message : String(err));
    }
  }

  runSync();
})();
