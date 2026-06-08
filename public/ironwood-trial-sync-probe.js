/**
 * Phase 1 probe — run on https://ironwoodrpg.com while logged in on Guild → Trials.
 * Logs normalized trial state to the console and copies JSON to clipboard when possible.
 *
 * Load from planner: paste buildIronwoodTrialSyncConsoleSnippet(appOrigin) in DevTools,
 * or add ?igtTrialProbe=1 to a bookmark that injects this script.
 */
(function ironwoodTrialSyncProbe() {
  if (!/ironwoodrpg\.com$/i.test(location.hostname)) {
    console.warn("[igt-trial-probe] Run on ironwoodrpg.com (Guild → Trials tab).");
    return;
  }

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

  var TRIAL_MS = 24 * 60 * 60 * 1000;

  function readObservableValue(subject) {
    if (!subject) return null;
    if (typeof subject.getValue === "function") return subject.getValue();
    if (typeof subject.value !== "undefined") return subject.value;
    return null;
  }

  function findInNgContext(obj, seen, depth) {
    if (!obj || depth > 12) return null;
    if (typeof obj !== "object") return null;
    if (seen.has(obj)) return null;
    seen.add(obj);
    if (obj.trialSkills$ && obj.guild$ && obj.SKILL_DATA) return obj;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        var fromArray = findInNgContext(obj[i], seen, depth + 1);
        if (fromArray) return fromArray;
      }
      return null;
    }
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) {
      try {
        var fromKey = findInNgContext(obj[keys[k]], seen, depth + 1);
        if (fromKey) return fromKey;
      } catch (e) {
        /* skip */
      }
    }
    return null;
  }

  function findGuildTrialsComponent() {
    var selectors = ["guild-page", "app-guild", "[class*='guild']"];
    for (var s = 0; s < selectors.length; s++) {
      var nodes = document.querySelectorAll(selectors[s]);
      for (var n = 0; n < nodes.length; n++) {
        var el = nodes[n];
        if (typeof window.ng !== "undefined" && typeof window.ng.getComponent === "function") {
          try {
            var cmp = window.ng.getComponent(el);
            if (cmp && cmp.trialSkills$ && cmp.guild$) return cmp;
          } catch (e) {
            /* continue */
          }
        }
        if (el.__ngContext__) {
          var fromCtx = findInNgContext(el.__ngContext__, new WeakSet(), 0);
          if (fromCtx) return fromCtx;
        }
      }
    }

    var all = document.querySelectorAll("*");
    for (var i = 0; i < Math.min(all.length, 500); i++) {
      var node = all[i];
      if (typeof window.ng !== "undefined" && typeof window.ng.getComponent === "function") {
        try {
          var c = window.ng.getComponent(node);
          if (c && c.trialSkills$ && c.guild$) return c;
        } catch (e2) {
          /* continue */
        }
      }
    }
    return null;
  }

  function skillNameFromId(cmp, skillId) {
    if (!cmp || !cmp.SKILL_DATA) return null;
    var data = cmp.SKILL_DATA[skillId];
    return data && data.name ? data.name : null;
  }

  function inferStart(endDate) {
    var end = new Date(endDate).getTime();
    if (Number.isNaN(end)) return null;
    return new Date(end - TRIAL_MS).toISOString();
  }

  function normalizeFromComponent(cmp) {
    var guild = readObservableValue(cmp.guild$);
    if (!guild || !guild.trial) {
      return { error: "No active guild trial on guild$.trial", guild: guild || null };
    }

    var trial = guild.trial;
    var trialSkills = readObservableValue(cmp.trialSkills$);
    if (!trialSkills && typeof cmp.trialSkills$ === "object") {
      trialSkills = trialSkills;
    }

    var skills = [];
    var skillRows = trialSkills || Object.values(trial.skills || {});

    for (var si = 0; si < skillRows.length; si++) {
      var row = skillRows[si];
      var skillId = row.id;
      var name = skillNameFromId(cmp, skillId);
      var members = (row.members || []).map(function (m) {
        return {
          displayName: m.displayName,
          skillId: m.skillId,
          exp: m.exp,
          endDate: m.endDate,
          inferredStartAt: inferStart(m.endDate),
          actionId: m.actionId != null ? m.actionId : null,
        };
      });

      skills.push({
        skillId: skillId,
        skillName: name,
        currentExp: row.currentExp,
        requiredExp: trial.requiredExp,
        complete: row.currentExp >= trial.requiredExp,
        members: members,
      });
    }

    return {
      v: 1,
      importedAt: new Date().toISOString(),
      source: "component",
      guild: {
        id: guild.id,
        name: guild.name,
        trial: {
          startDate: trial.startDate,
          endDate: trial.endDate,
          requiredExp: trial.requiredExp,
          creditReward: trial.creditReward,
          expBonus: trial.expBonus,
        },
      },
      skills: skills,
      raw: {
        trialMembers: trial.members,
        trialSkills: trial.skills,
      },
    };
  }

  function normalizeFromDom() {
    var out = { v: 1, importedAt: new Date().toISOString(), source: "dom", skills: [], warnings: [] };
    var headers = document.querySelectorAll("div, span, button");
    var skillBlocks = [];

    for (var i = 0; i < headers.length; i++) {
      var text = (headers[i].textContent || "").trim();
      var trialMatch = text.match(/^(.+) Trial$/);
      if (trialMatch && SKILL_ORDER.indexOf(trialMatch[1]) >= 0) {
        skillBlocks.push({ el: headers[i], skillName: trialMatch[1] });
      }
    }

    if (!skillBlocks.length) {
      out.warnings.push("Could not find skill trial headers in DOM.");
      return out;
    }

    for (var b = 0; b < skillBlocks.length; b++) {
      var block = skillBlocks[b];
      var container = block.el.closest("div");
      for (var up = 0; up < 4 && container; up++) {
        if (container.querySelector && container.textContent.indexOf("XP") >= 0) break;
        container = container.parentElement;
      }
      var members = [];
      if (container) {
        var buttons = container.querySelectorAll("button");
        for (var bi = 0; bi < buttons.length; bi++) {
          var btnText = buttons[bi].textContent || "";
          var xpMatch = btnText.match(/([\d,]+)\s*XP/);
          var nameMatch = btnText.replace(/[\d,\sXP]+/g, " ").trim();
          if (xpMatch && nameMatch && nameMatch.length > 1) {
            members.push({
              displayName: nameMatch.split(/\s+/)[0],
              exp: Number(xpMatch[1].replace(/,/g, "")),
              domNote: "name parsing approximate",
            });
          }
        }
      }
      out.skills.push({ skillName: block.skillName, members: members });
    }

    return out;
  }

  var cmp = findGuildTrialsComponent();
  var payload = cmp ? normalizeFromComponent(cmp) : normalizeFromDom();

  console.log("[igt-trial-probe] Guild trial snapshot:", payload);

  if (typeof copy === "function") {
    try {
      copy(JSON.stringify(payload, null, 2));
      console.log("[igt-trial-probe] JSON copied to clipboard.");
    } catch (e) {
      /* ignore */
    }
  }

  window.__IGT_TRIAL_PROBE_LAST__ = payload;
  return payload;
})();
