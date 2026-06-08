/**
 * Runs on https://ironwoodrpg.com (Guild → Trials) via userscript or bookmarklet.
 * Reads active guild trial assignments and returns to the planner with a sync payload.
 */
(function ironwoodGuildTrialsSync() {
  if (!/ironwoodrpg\.com$/i.test(location.hostname)) {
    alert("Guild Trials sync must be run on ironwoodrpg.com while logged in.");
    return;
  }

  var TRIAL_MS = 24 * 60 * 60 * 1000;
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
  var returnUrl =
    (scriptUrl && scriptUrl.searchParams.get("return")) ||
    new URLSearchParams(location.search).get("igtReturn") ||
    "";

  if (!returnUrl) {
    alert(
      "Missing return URL. Start sync from the Guild Trials planner so the link includes where to send trial data.",
    );
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
    if (typeof window.ng !== "undefined" && typeof window.ng.getComponent === "function") {
      var all = document.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        try {
          var cmp = window.ng.getComponent(all[i]);
          if (cmp && cmp.trialSkills$ && cmp.guild$) return cmp;
        } catch (e2) {
          /* continue */
        }
      }
    }

    var roots = document.querySelectorAll("guild-page, app-guild, app-root");
    for (var r = 0; r < roots.length; r++) {
      var el = roots[r];
      if (el.__ngContext__) {
        var fromCtx = findInNgContext(el.__ngContext__, new WeakSet(), 0);
        if (fromCtx) return fromCtx;
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
    var gt = mondayUtc;
    var gd = new Date(gt);
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
      throw new Error("No active guild trial. Open Guild → Trials in Ironwood first.");
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

    var unmatchedNames = [];
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

    for (var mi = 0; mi < Object.values(trial.members || {}).length; mi++) {
      var mem = Object.values(trial.members)[mi];
      if (mem && mem.displayName && SKILL_ORDER.indexOf(mem.displayName) < 0) {
        /* roster check happens server-side */
      }
    }

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
      unmatchedNames: unmatchedNames.length ? unmatchedNames : undefined,
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
    '<p id="igt-trial-sync-status" style="margin:0;color:#94a3b8">Open Guild → Trials if you are not there yet…</p>' +
    '<p id="igt-trial-sync-detail" style="margin:12px 0 0;font-size:12px;color:#64748b"></p>' +
    "</div>";
  document.body.appendChild(overlay);

  function setStatus(main, detail) {
    var s = document.getElementById("igt-trial-sync-status");
    var d = document.getElementById("igt-trial-sync-detail");
    if (s) s.textContent = main;
    if (d) d.textContent = detail || "";
  }

  async function runSync() {
    var cmp = null;
    for (var attempt = 0; attempt < 40; attempt++) {
      cmp = findGuildTrialsComponent();
      var guild = cmp ? readObservableValue(cmp.guild$) : null;
      if (cmp && guild && guild.trial) break;
      setStatus(
        "Waiting for Guild → Trials…",
        attempt === 0
          ? "Navigate to your guild and open the Trials tab."
          : "Still waiting (" + (attempt + 1) + "/40)…",
      );
      await sleep(750);
    }

    if (!cmp) {
      setStatus("Could not read trial data.", "Stay on Guild → Trials and try again.");
      return;
    }

    var payload;
    try {
      payload = buildPayload(cmp);
    } catch (err) {
      setStatus("Sync failed", err && err.message ? err.message : String(err));
      return;
    }

    var activeCount = 0;
    for (var i = 0; i < payload.skills.length; i++) {
      activeCount += payload.skills[i].members.length;
    }

    if (activeCount === 0) {
      setStatus("No active trial assignments found.", "Join or wait for members on trial slots first.");
      await sleep(4000);
      overlay.remove();
      return;
    }

    var sep = returnUrl.indexOf("?") >= 0 ? "&" : "?";
    var destination = returnUrl + sep + "trialSync=" + encodeURIComponent(toBase64Url(payload));

    setStatus(
      "Done! Returning to Guild Trials…",
      activeCount + " active assignment(s) for week " + payload.trialWeekStart,
    );
    await sleep(600);
    location.href = destination;
  }

  runSync().catch(function (err) {
    setStatus("Sync failed", err && err.message ? err.message : String(err));
  });
})();
