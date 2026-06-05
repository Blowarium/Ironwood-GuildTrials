/**
 * Runs on https://ironwoodrpg.com (via bookmarklet or pasted console snippet).
 * Walks each guild-trial skill in the sidebar, opens the best unlocked action,
 * and reads the Estimates XP/h value from `.value` … `/ hour`.
 */
(function ironwoodGuildTrialsXpImport() {
  if (!/ironwoodrpg\.com$/i.test(location.hostname)) {
    alert("Ironwood Guild Trials XP import must be run on ironwoodrpg.com while logged in.");
    return;
  }

  const SKILL_MAP = {
    Woodcutting: "Woodcutting",
    Mining: "Mining",
    Smelting: "Smelting",
    Smithing: "Smithing",
    Enchanting: "Enchanting",
    Farming: "Farming",
    Alchemy: "Alchemy",
    Fishing: "Fishing",
    Cooking: "Cooking",
    Delving: "Delving",
    Imbuing: "Imbuing",
    Exploring: "Exploring",
    "One-handed": "One-handed",
    "Two-handed": "Two-handed",
    Ranged: "Ranged",
    Defense: "Defense",
  };

  const GATHERING_SKILLS = {
    Woodcutting: true,
    Mining: true,
    Farming: true,
    Fishing: true,
    Delving: true,
  };

  const GUILD_SKILL_ORDER = [
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

  const IMPORT_RUN_KEY = "igt-xp-import-run";
  const IMPORT_STATE_KEY = "igt-xp-import-state";

  const COMBAT_SKILLS = {
    "One-handed": true,
    "Two-handed": true,
    Ranged: true,
    Defense: true,
  };

  function actionPreferences(displayName) {
    if (GATHERING_SKILLS[displayName]) return { subGroup: "Outskirts" };
    if (COMBAT_SKILLS[displayName]) return { subGroup: "Elite" };
    if (displayName === "Cooking") return { preferPie: true };
    if (displayName === "Enchanting") return { subGroup: "Keys" };
    return {};
  }

  function readActionName(actionId, row, cmp) {
    if (cmp && cmp.ACTION_DATA && actionId && cmp.ACTION_DATA[actionId]) {
      return cmp.ACTION_DATA[actionId].name || "";
    }
    return row ? readActionNameFromRow(row) : "";
  }

  function scoreActionCandidate(level, actionId, name, prefs) {
    var score = actionScore(level, actionId);
    if (prefs && prefs.preferPie && /pie/i.test(name || "")) score += 1e12;
    return score;
  }

  function filterRowsForPreferences(rows, cmp, prefs) {
    if (!prefs || !prefs.preferPie || !rows.length) return rows;
    var pieRows = rows.filter(function (row) {
      return /pie/i.test(readActionName(parseActionId(row), row, cmp));
    });
    return pieRows.length ? pieRows : rows;
  }

  function buttonsTopDown(nodeList) {
    return Array.prototype.slice.call(nodeList || []).reverse();
  }

  const scriptEl = document.currentScript;
  const scriptUrl = scriptEl && scriptEl.src ? new URL(scriptEl.src) : null;
  const returnUrl =
    (scriptUrl && scriptUrl.searchParams.get("return")) ||
    window.__IGT_XP_RETURN__ ||
    "";
  const actionPlanEncoded =
    (scriptUrl && scriptUrl.searchParams.get("actions")) ||
    "";
  const importResume =
    (scriptUrl && scriptUrl.searchParams.get("resume") === "1") ||
    sessionStorage.getItem(IMPORT_RUN_KEY) === "1";

  if (!returnUrl) {
    alert(
      "Missing return URL. Start the import from the Guild Trials profile button so the link includes where to send your XP/h data.",
    );
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "igt-xp-import-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:999999;background:rgba(8,12,22,.88);color:#e2e8f0;font:14px/1.4 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:16px;";
  overlay.innerHTML =
    '<div style="max-width:420px;width:100%;border:1px solid #334155;border-radius:12px;background:#0f172a;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.45)">' +
    '<p style="margin:0 0 8px;font-weight:700;font-size:16px;color:#fff">Guild Trials — XP/h import</p>' +
    '<p id="igt-xp-import-status" style="margin:0;color:#94a3b8">Starting…</p>' +
    '<p id="igt-xp-import-detail" style="margin:10px 0 0;font-size:12px;color:#64748b"></p>' +
    "</div>";
  document.body.appendChild(overlay);
  const statusEl = overlay.querySelector("#igt-xp-import-status");
  const detailEl = overlay.querySelector("#igt-xp-import-detail");

  function setStatus(main, detail) {
    if (statusEl) statusEl.textContent = main;
    if (detailEl) detailEl.textContent = detail || "";
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function waitFor(testFn, timeoutMs) {
    var timeout = timeoutMs || 20000;
    var start = Date.now();
    return new Promise(function (resolve, reject) {
      (function tick() {
        try {
          var value = testFn();
          if (value) {
            resolve(value);
            return;
          }
        } catch (e) {
          /* keep polling */
        }
        if (Date.now() - start > timeout) {
          reject(new Error("Timed out waiting for the game page to update."));
          return;
        }
        setTimeout(tick, 300);
      })();
    });
  }

  function parseXpPerHour() {
    var nodes = document.querySelectorAll(".value");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!/\/\s*hour/i.test(text)) continue;
      var num = Number(text.replace(/[^\d]/g, ""));
      if (num > 0) return num;
    }
    return null;
  }

  function actionsComponentRoot() {
    return document.querySelector("actions-component");
  }

  function skillNavButtons() {
    return Array.prototype.slice.call(
      document.querySelectorAll("nav-component button.skill, nav button.skill"),
    );
  }

  function readSkillName(btn) {
    var nameEl = btn.querySelector(".name");
    return nameEl ? nameEl.textContent.trim() : "";
  }

  function isDisabled(el) {
    return (
      el.disabled ||
      el.getAttribute("disabled") != null ||
      el.classList.contains("disabled") ||
      el.getAttribute("aria-disabled") === "true"
    );
  }

  function pathFromRouterSegments(parts) {
    var cleaned = parts.map(function (p) {
      return String(p).trim();
    });
    var skillId = null;
    var actionId = null;
    for (var i = 0; i < cleaned.length; i++) {
      if (/^\d+$/.test(cleaned[i]) && skillId == null) {
        if (i > 0 && cleaned[i - 1].indexOf("skill") >= 0) skillId = cleaned[i];
      }
      if (cleaned[i].indexOf("action") >= 0 && /^\d+$/.test(cleaned[i + 1] || "")) {
        actionId = cleaned[i + 1];
      }
    }
    if (skillId && actionId) return "/skill/" + skillId + "/action/" + actionId;
    return null;
  }

  function readRouterLink(el) {
    var href = el.getAttribute("href");
    if (href && /\/action\/\d+/i.test(href)) return href;

    var reflect = el.getAttribute("ng-reflect-router-link");
    if (reflect) {
      if (reflect.charAt(0) === "/" && /\/action\/\d+/i.test(reflect)) {
        return reflect.split(",")[0];
      }
      if (reflect.charAt(0) === "[") {
        try {
          var parsed = JSON.parse(reflect);
          if (Array.isArray(parsed)) {
            var joined = parsed.join("").replace(/\/{2,}/g, "/");
            if (/\/action\/\d+/i.test(joined)) {
              return joined.charAt(0) === "/" ? joined : "/" + joined;
            }
            return pathFromRouterSegments(parsed);
          }
        } catch (e) {
          /* fall through */
        }
      }
      if (reflect.indexOf(",") >= 0) {
        var fromSegments = pathFromRouterSegments(reflect.split(","));
        if (fromSegments) return fromSegments;
      }
      if (/\/action\/\d+/i.test(reflect)) return reflect;
    }

    for (var a = 0; a < el.attributes.length; a++) {
      var val = el.attributes[a].value || "";
      if (/\/action\/\d+/i.test(val)) return val;
      if (val.indexOf(",") >= 0 && val.indexOf("action") >= 0) {
        var fromAttr = pathFromRouterSegments(val.split(","));
        if (fromAttr) return fromAttr;
      }
    }
    return null;
  }

  function parseActionId(el) {
    var link = readRouterLink(el);
    if (link) {
      var match = link.match(/\/action\/(\d+)/i);
      if (match) return Number(match[1]);
    }
    for (var a = 0; a < el.attributes.length; a++) {
      var val = el.attributes[a].value || "";
      var direct = val.match(/\/action\/(\d+)/i);
      if (direct) return Number(direct[1]);
      if (val.indexOf("action") >= 0 && val.indexOf(",") >= 0) {
        var parts = val.split(",");
        for (var i = 0; i < parts.length - 1; i++) {
          if (parts[i].indexOf("action") >= 0 && /^\d+$/.test(parts[i + 1].trim())) {
            return Number(parts[i + 1].trim());
          }
        }
      }
    }
    return 0;
  }

  function parseActionLevel(el) {
    var levelEl = el.querySelector(".level");
    if (!levelEl) return 0;
    var num = Number((levelEl.textContent || "").replace(/[^\d]/g, ""));
    return num > 0 ? num : 0;
  }

  function actionScore(level, id) {
    return level * 100000 + id;
  }

  function readEffectiveSkillLevel(root) {
    var cmp = findActionsComponentInstance(root);
    var fromComponent = readComponentEffectiveLevel(cmp);
    if (fromComponent != null) return fromComponent;

    var scopes = document.querySelectorAll(
      "skill-page .page-title, skill-page h1, skill-page header, .page-title",
    );
    for (var i = 0; i < scopes.length; i++) {
      var text = scopes[i].textContent || "";
      var match = text.match(/Lv\.\s*(\d+)(?:\s*\+\s*(\d+))?/);
      if (match) return Number(match[1]) + (match[2] ? Number(match[2]) : 0);
    }
    return null;
  }

  function findInNgContext(obj, seen, depth) {
    if (!obj || depth > 10) return null;
    if (typeof obj !== "object") return null;
    if (seen.has(obj)) return null;
    seen.add(obj);
    if (obj.ACTION_DATA && (obj.skillData$ || obj.skillData !== undefined)) return obj;
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
        /* skip inaccessible properties */
      }
    }
    return null;
  }

  function findActionsComponentInstance(rootEl) {
    var el = rootEl || document.querySelector("actions-component");
    if (!el) return null;

    if (typeof window.ng !== "undefined" && typeof window.ng.getComponent === "function") {
      try {
        var fromNg = window.ng.getComponent(el);
        if (fromNg && fromNg.ACTION_DATA) return fromNg;
      } catch (e) {
        /* fall through */
      }
    }

    if (el.__ngContext__) {
      var lView = el.__ngContext__;
      if (Array.isArray(lView)) {
        for (var i = 0; i < lView.length; i++) {
          var item = lView[i];
          if (item && item.ACTION_DATA && item.skillData$) return item;
        }
      }
      var fromContext = findInNgContext(el.__ngContext__, new WeakSet(), 0);
      if (fromContext) return fromContext;
    }
    return null;
  }

  function parseSkillIdFromElement(el) {
    var link = readRouterLink(el);
    var id = parseSkillIdFromPath(link);
    if (id) return id;
    for (var a = 0; a < el.attributes.length; a++) {
      var val = el.attributes[a].value || "";
      var match = val.match(/\/skill\/(\d+)/i);
      if (match) return match[1];
    }
    return null;
  }

  function skillNamesMatch(expected, actual) {
    if (!expected || !actual) return false;
    if (expected === actual) return true;
    return expected.replace(/[\s-]/g, "").toLowerCase() === actual.replace(/[\s-]/g, "").toLowerCase();
  }

  function readObservableValue(subject) {
    if (!subject) return null;
    if (typeof subject.getValue === "function") return subject.getValue();
    return null;
  }

  function readComponentEffectiveLevel(cmp) {
    if (!cmp) return null;
    var level =
      typeof cmp.skillLevel === "number" ? cmp.skillLevel : readObservableValue(cmp.skillLevel$);
    var bonus =
      typeof cmp.levelBonus === "number" ? cmp.levelBonus : readObservableValue(cmp.levelBonus$);
    if (typeof level === "number") return level + (bonus || 0);
    return null;
  }

  function resolveBestActionPathFromComponent(root, prefs) {
    var cmp = findActionsComponentInstance(root);
    if (!cmp || !cmp.ACTION_DATA) return null;

    var skillData = cmp.skillData;
    if (!skillData) return null;

    var skillId = cmp.skillId || skillData.id;
    if (!skillId) return null;

    var effectiveLevel = readComponentEffectiveLevel(cmp);
    if (effectiveLevel == null) effectiveLevel = 9999;

    var candidates = [];

    function considerAction(ref) {
      if (!ref || ref.id == null) return;
      var data = cmp.ACTION_DATA[ref.id];
      if (!data) return;
      var level = data.level || 0;
      if (level > effectiveLevel) return;
      candidates.push({
        id: ref.id,
        level: level,
        name: data.name || "",
        score: scoreActionCandidate(level, ref.id, data.name, prefs),
      });
    }

    function walkGroup(group, withinSubGroup) {
      if (!group) return;
      var groupMatchesSubgroup =
        prefs && prefs.subGroup && group.name === prefs.subGroup;
      var canConsiderDirectActions =
        !prefs || !prefs.subGroup || withinSubGroup || groupMatchesSubgroup;

      if (group.actionGroups) {
        for (var s = 0; s < group.actionGroups.length; s++) {
          var sub = group.actionGroups[s];
          var childWithin = withinSubGroup || groupMatchesSubgroup;
          if (prefs && prefs.subGroup) {
            childWithin = sub.name === prefs.subGroup || groupMatchesSubgroup;
          } else {
            childWithin = true;
          }
          if (sub.actions && childWithin) {
            for (var j = 0; j < sub.actions.length; j++) considerAction(sub.actions[j]);
          }
          if (sub.actionGroups) walkGroups(sub.actionGroups, childWithin);
        }
        return;
      }
      if (group.actions && canConsiderDirectActions) {
        for (var k = 0; k < group.actions.length; k++) considerAction(group.actions[k]);
      }
    }

    function walkGroups(groups, withinSubGroup) {
      if (!groups) return;
      for (var i = 0; i < groups.length; i++) walkGroup(groups[i], withinSubGroup);
    }

    if (skillData.actions && !(prefs && prefs.subGroup)) {
      for (var k = 0; k < skillData.actions.length; k++) {
        considerAction(skillData.actions[k]);
      }
    }
    walkGroups(skillData.actionGroups, false);

    if (!candidates.length) return null;

    if (prefs && prefs.preferPie) {
      var pieCandidates = candidates.filter(function (c) {
        return /pie/i.test(c.name || "");
      });
      if (pieCandidates.length) candidates = pieCandidates;
    }

    var bestId = null;
    var bestScoreVal = -1;
    for (var c = 0; c < candidates.length; c++) {
      if (candidates[c].score > bestScoreVal) {
        bestScoreVal = candidates[c].score;
        bestId = candidates[c].id;
      }
    }

    if (bestId == null) return null;
    var data = cmp.ACTION_DATA[bestId];
    return {
      path: "/skill/" + skillId + "/action/" + bestId,
      actionId: bestId,
      name: (data && data.name) || "Action " + bestId,
      level: (data && data.level) || null,
      method: "component",
      prefs: prefs || null,
    };
  }

  function readActionNameFromRow(row) {
    if (!row) return "";
    var nameEl = row.querySelector(".text, .name");
    return nameEl ? nameEl.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function actionInfoFromRow(row, method) {
    var actionId = parseActionId(row);
    var cmp = findActionsComponentInstance();
    var data = cmp && cmp.ACTION_DATA && actionId ? cmp.ACTION_DATA[actionId] : null;
    var skillId = cmp && (cmp.skillId || (cmp.skillData && cmp.skillData.id));
    var path =
      actionId && skillId
        ? "/skill/" + skillId + "/action/" + actionId
        : readRouterLink(row) || location.pathname;
    return {
      path: path,
      actionId: actionId,
      name: (data && data.name) || readActionNameFromRow(row) || (actionId ? "Action " + actionId : "Unknown"),
      level: (data && data.level) || parseActionLevel(row) || null,
      method: method || "dom",
      row: row,
    };
  }

  function actionInfoFromPath(path, row, method) {
    if (row) {
      var info = actionInfoFromRow(row, method);
      if (path) info.path = path;
      return info;
    }
    var match = path && path.match(/\/action\/(\d+)/i);
    var actionId = match ? Number(match[1]) : 0;
    return {
      path: path,
      actionId: actionId,
      name: actionId ? "Action " + actionId : "Unknown",
      level: null,
      method: method,
      row: null,
    };
  }

  function readSkillNavLink(btn) {
    return readRouterLink(btn);
  }

  function skillIdForDisplayName(displayName) {
    var buttons = skillNavButtons();
    for (var i = 0; i < buttons.length; i++) {
      if (readSkillName(buttons[i]) !== displayName) continue;
      return parseSkillIdFromElement(buttons[i]);
    }
    return null;
  }

  function getActiveActionId() {
    var route = currentRoutePath();
    var match = route.match(/\/action\/(\d+)/i);
    if (match) return Number(match[1]);

    var rows = document.querySelectorAll(
      "actions-component button.row.active-link, actions-component a.row.active-link",
    );
    for (var i = 0; i < rows.length; i++) {
      var id = parseActionId(rows[i]);
      if (id > 0) return id;
    }
    return 0;
  }

  function actionSelectionMatches(resolved) {
    if (!resolved || !resolved.actionId) return false;
    if (isActiveActionRow(resolved.actionId)) return true;
    if (getActiveActionId() === resolved.actionId) return true;
    var path = resolved.path || resolved.url || "";
    if (path.indexOf("http") === 0) {
      try {
        path = new URL(path).pathname;
      } catch (e) {
        path = "";
      }
    }
    return routeIncludesAction(resolved.actionId, parseSkillIdFromPath(path));
  }

  async function navigateToResolvedAction(root, resolved) {
    if (!resolved || !resolved.actionId || !resolved.path) return false;

    if (actionSelectionMatches(resolved)) return true;

    async function clickResolvedRow() {
      if (resolved.prefs && resolved.prefs.subGroup) {
        await clickSubGroupFilter(root, resolved.prefs.subGroup);
        await sleep(300);
      }
      var row = resolved.row || findActionRowById(root, resolved.actionId);
      if (!row) row = await revealActionRow(root, resolved.actionId, resolved.prefs);
      if (!row || isDisabled(row)) return false;
      row.scrollIntoView({ block: "nearest" });
      row.click();
      await sleep(500);
      return actionSelectionMatches(resolved);
    }

    if (await clickResolvedRow()) return true;

    var path = resolved.path;
    if (path.charAt(0) !== "/") path = "/" + path;
    if (!routeIncludesAction(resolved.actionId, parseSkillIdFromPath(path))) {
      location.assign(path);
      try {
        await waitFor(function () {
          return actionSelectionMatches(resolved);
        }, 5000);
      } catch (e) {
        /* fall through to row click */
      }
    }

    if (!actionSelectionMatches(resolved)) {
      await clickResolvedRow();
    }

    await sleep(300);
    return actionSelectionMatches(resolved);
  }

  function isActiveActionRow(actionId) {
    if (!actionId) return false;
    var rows = document.querySelectorAll(
      "actions-component button.row.active-link, actions-component a.row.active-link",
    );
    for (var i = 0; i < rows.length; i++) {
      if (parseActionId(rows[i]) === actionId) return true;
    }
    return false;
  }

  function buildActionInfo(resolved) {
    var path = resolved.path;
    if (path && path.charAt(0) !== "/") path = "/" + path;
    return {
      actionId: resolved.actionId,
      name: resolved.name,
      level: resolved.level,
      url: location.origin + path,
      method: resolved.method,
    };
  }

  function readCurrentActionInfo(fallback) {
    var route = currentRoutePath();
    var path = route;
    if (path.indexOf("#") >= 0) {
      path = path.slice(path.indexOf("#") + 1);
    }
    if (path && path.charAt(0) !== "/") path = "/" + path;
    if (!path || path.indexOf("/skill/") < 0) path = location.pathname;
    var match = path.match(/\/action\/(\d+)/i);
    var activeId = getActiveActionId();
    var actionId = activeId || (match ? Number(match[1]) : 0) || (fallback && fallback.actionId);
    var cmp = findActionsComponentInstance();
    var data = cmp && cmp.ACTION_DATA && actionId ? cmp.ACTION_DATA[actionId] : null;

    var active = document.querySelector(
      "actions-component button.row.active-link, actions-component a.row.active-link",
    );
    var name =
      (data && data.name) ||
      readActionNameFromRow(active) ||
      (fallback && fallback.name) ||
      (actionId ? "Action " + actionId : "Unknown action");

    var reportPath =
      fallback && fallback.path && (!match || Number(match[1]) !== fallback.actionId)
        ? fallback.path
        : path;

    return {
      actionId: (fallback && fallback.actionId) || actionId || 0,
      name: name,
      level: (data && data.level) || (active ? parseActionLevel(active) : null) || (fallback && fallback.level),
      url: location.origin + reportPath,
      method: (fallback && fallback.method) || "dom",
    };
  }

  function currentRoutePath() {
    return location.pathname + (location.hash || "");
  }

  function routeIncludesAction(actionId, skillId) {
    var route = currentRoutePath();
    if (actionId && route.indexOf("/action/" + actionId) < 0) return false;
    if (skillId && route.indexOf("/skill/" + skillId) < 0) return false;
    return route.indexOf("/action/") >= 0;
  }

  function parseSkillIdFromPath(path) {
    if (!path) return null;
    var match = path.match(/\/skill\/(\d+)/i);
    return match ? match[1] : null;
  }

  async function waitForSkillPage(displayName) {
    var expectedSkillId = skillIdForDisplayName(displayName);
    await waitFor(function () {
      var root = actionsComponentRoot();
      if (!root) return false;

      var active = document.querySelector("nav-component button.skill.active-link");
      if (active && readSkillName(active) === displayName) return root;

      if (expectedSkillId) {
        var route = currentRoutePath();
        if (route.indexOf("/skill/" + expectedSkillId) >= 0) return root;
      }

      return false;
    }, 12000);
    await sleep(400);
    return actionsComponentRoot();
  }

  async function waitForComponentForSkill(skillBtn) {
    var expectedSkillId = parseSkillIdFromElement(skillBtn);
    await waitFor(function () {
      var root = actionsComponentRoot();
      if (!root) return false;
      if (!expectedSkillId) return root;
      var cmp = findActionsComponentInstance(root);
      if (!cmp || !cmp.skillData) return false;
      var sid = cmp.skillId || cmp.skillData.id;
      return String(sid) === String(expectedSkillId) ? root : false;
    }, 12000);
    await sleep(500);
    return actionsComponentRoot();
  }

  function findActionRowById(root, actionId) {
    if (!root || !actionId) return null;
    var rows = actionRowCandidates(root);
    for (var i = 0; i < rows.length; i++) {
      if (parseActionId(rows[i]) === actionId) return rows[i];
    }
    return null;
  }

  async function revealActionRow(root, actionId, prefs) {
    if (!root || !actionId) return null;

    var direct = findActionRowById(root, actionId);
    if (direct) return direct;

    await ensureActionsExpanded(root);

    var found = null;

    function consider() {
      if (found) return;
      var row = findActionRowById(root, actionId);
      if (row) found = row;
    }

    async function searchSubFilters() {
      if (prefs && prefs.subGroup) {
        await clickSubGroupFilter(root, prefs.subGroup);
        consider();
        return;
      }

      var containers = root.querySelectorAll(".sort .container");
      if (!containers.length) {
        consider();
        return;
      }

      async function walkContainer(index) {
        var liveContainers = root.querySelectorAll(".sort .container");
        if (index >= liveContainers.length) {
          consider();
          return;
        }

        var buttons = buttonsTopDown(
          liveContainers[index].querySelectorAll("button"),
        );
        if (!buttons.length) {
          await walkContainer(index + 1);
          return;
        }

        for (var i = 0; i < buttons.length; i++) {
          await clickFilterButton(buttons[i]);
          await walkContainer(index + 1);
          if (found) return;
        }
      }

      await walkContainer(0);
    }

    var filterRows = Array.prototype.slice.call(root.querySelectorAll(".filters"));

    async function exploreFilterRow(rowIndex) {
      if (found) return;
      if (rowIndex >= filterRows.length) {
        await searchSubFilters();
        consider();
        return;
      }

      var filters = buttonsTopDown(
        filterRows[rowIndex].querySelectorAll("button.filter"),
      );
      if (!filters.length) {
        await exploreFilterRow(rowIndex + 1);
        return;
      }

      for (var f = 0; f < filters.length; f++) {
        await clickFilterButton(filters[f]);
        await exploreFilterRow(rowIndex + 1);
        if (found) return;
      }
    }

    if (!filterRows.length) {
      await searchSubFilters();
      consider();
    } else {
      await exploreFilterRow(0);
    }

    return found;
  }

  function isActionRow(el) {
    if (!el || el.tagName !== "BUTTON" && el.tagName !== "A") return false;
    if (el.classList.contains("filter") || el.classList.contains("header")) return false;
    if (el.closest(".filters")) return false;
    if (!el.classList.contains("row")) return false;
    if (!el.querySelector(".level")) return false;
    return true;
  }

  function actionRowCandidates(root) {
    return Array.prototype.slice.call(
      root.querySelectorAll(
        "button.row, a.row, button.active-link, .items button, .card button.row",
      ),
    ).filter(isActionRow);
  }

  function unlockedActionRows(root) {
    return actionRowCandidates(root).filter(function (el) {
      if (isDisabled(el)) return false;
      if (el.offsetParent === null) return false;
      return true;
    });
  }

  function pickBestRow(rows, maxLevel) {
    var best = null;
    var bestScoreVal = -1;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (isDisabled(row)) continue;
      var level = parseActionLevel(row);
      if (maxLevel != null && level > maxLevel) continue;
      var id = parseActionId(row);
      var score = actionScore(level, id);
      if (score > bestScoreVal) {
        bestScoreVal = score;
        best = row;
      }
    }
    return best;
  }

  async function ensureActionsExpanded(root) {
    var header = root.querySelector("button.header");
    if (!header) return;
    if (actionRowCandidates(root).length > 0) return;
    header.click();
    await sleep(500);
  }

  async function clickFilterButton(btn) {
    if (!btn || btn.disabled) return;
    btn.click();
    await sleep(450);
  }

  async function clickSubGroupFilter(root, subGroupName) {
    if (!subGroupName) return false;
    var selectors = [".filters button.filter", ".sort .container button"];
    for (var s = 0; s < selectors.length; s++) {
      var buttons = root.querySelectorAll(selectors[s]);
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        var text = (btn.textContent || "").replace(/\s+/g, " ").trim();
        if (text.toLowerCase() === subGroupName.toLowerCase()) {
          await clickFilterButton(btn);
          return true;
        }
      }
    }
    return false;
  }

  async function exploreSubFilterContainers(root, consider, prefs) {
    var containers = root.querySelectorAll(".sort .container");
    if (!containers.length) {
      consider();
      return;
    }

    if (prefs && prefs.subGroup) {
      var clicked = await clickSubGroupFilter(root, prefs.subGroup);
      if (clicked) {
        consider();
        return;
      }
    }

    async function walkContainer(index) {
      var liveContainers = root.querySelectorAll(".sort .container");
      if (index >= liveContainers.length) {
        consider();
        return;
      }

      var buttons = buttonsTopDown(
        liveContainers[index].querySelectorAll("button"),
      );
      if (!buttons.length) {
        await walkContainer(index + 1);
        return;
      }

      for (var i = 0; i < buttons.length; i++) {
        await clickFilterButton(buttons[i]);
        await walkContainer(index + 1);
      }
    }

    await walkContainer(0);
  }

  async function findBestUnlockedActionPathFromDom(root, prefs) {
    await ensureActionsExpanded(root);

    var bestRow = null;
    var bestScoreVal = -1;
    var cmp = findActionsComponentInstance(root);
    var maxLevel = readComponentEffectiveLevel(cmp);
    if (maxLevel == null) maxLevel = 9999;

    function consider() {
      var rows = unlockedActionRows(root);
      if (!rows.length) rows = actionRowCandidates(root);
      rows = filterRowsForPreferences(rows, cmp, prefs);
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (isDisabled(row)) continue;
        var level = parseActionLevel(row);
        if (level > maxLevel) continue;
        var actionId = parseActionId(row);
        var name = readActionName(actionId, row, cmp);
        var score = scoreActionCandidate(level, actionId, name, prefs);
        if (score > bestScoreVal) {
          bestScoreVal = score;
          bestRow = row;
        }
      }
    }

    function canStopDomScan() {
      if (!bestRow) return false;
      return parseActionLevel(bestRow) >= maxLevel;
    }

    var filterRows = Array.prototype.slice.call(root.querySelectorAll(".filters"));

    if (prefs && prefs.subGroup) {
      await clickSubGroupFilter(root, prefs.subGroup);
      consider();
      if (bestRow) {
        var preferredId = parseActionId(bestRow);
        if (preferredId) {
          var preferredRow = await revealActionRow(root, preferredId, prefs);
          if (preferredRow) bestRow = preferredRow;
        }
        return actionInfoFromRow(bestRow, "dom");
      }
    }

    async function exploreFilterRow(rowIndex) {
      if (rowIndex >= filterRows.length) {
        await exploreSubFilterContainers(root, consider, prefs);
        consider();
        return;
      }

      var filters = buttonsTopDown(
        filterRows[rowIndex].querySelectorAll("button.filter"),
      );
      if (!filters.length) {
        await exploreFilterRow(rowIndex + 1);
        return;
      }

      for (var f = 0; f < filters.length; f++) {
        await clickFilterButton(filters[f]);
        await exploreFilterRow(rowIndex + 1);
        if (canStopDomScan()) return;
        if (bestRow && f === 0) return;
      }
    }

    if (!filterRows.length) {
      await exploreSubFilterContainers(root, consider, prefs);
      consider();
    } else {
      await exploreFilterRow(0);
    }

    if (!bestRow) return null;

    var actionId = parseActionId(bestRow);
    if (actionId) {
      var revealed = await revealActionRow(root, actionId, prefs);
      if (revealed) bestRow = revealed;
    }

    return actionInfoFromRow(bestRow, "dom");
  }

  async function resolveBestAction(root, displayName) {
    var prefs = actionPreferences(displayName);
    var fromComponent = resolveBestActionPathFromComponent(root, prefs);
    if (fromComponent) return fromComponent;
    var fromDom = await findBestUnlockedActionPathFromDom(root, prefs);
    if (fromDom) fromDom.prefs = prefs;
    return fromDom;
  }

  async function openBestUnlockedAction(skillBtn, displayName) {
    var root = await waitForComponentForSkill(skillBtn);
    if (!root) return null;

    var resolved = await resolveBestAction(root, displayName);
    if (!resolved) return null;

    if (!resolved.prefs) resolved.prefs = actionPreferences(displayName);

    await navigateToResolvedAction(root, resolved);
    await sleep(400);
    return readCurrentActionInfo(resolved);
  }

  function toBase64Url(obj) {
    var json = JSON.stringify(obj);
    return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeUserActionPlan(encoded) {
    if (!encoded) return null;
    try {
      var b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var parsed = JSON.parse(atob(b64));
      if (!parsed || parsed.v !== 1 || !parsed.plan) return null;
      return parsed.plan;
    } catch (e) {
      return null;
    }
  }

  function readUserActionPlan() {
    return decodeUserActionPlan(actionPlanEncoded);
  }

  function routeHasAction(actionId) {
    return location.pathname.indexOf("/action/" + actionId) >= 0;
  }

  function waitForXpOnAction(entry, timeoutMs, previousXp) {
    var timeout = timeoutMs || 20000;
    var start = Date.now();
    var routeOkSince = null;
    return new Promise(function (resolve, reject) {
      (function tick() {
        try {
          if (routeHasAction(entry.actionId)) {
            if (!routeOkSince) routeOkSince = Date.now();
            if (Date.now() - routeOkSince >= 600) {
              var xp = parseXpPerHour();
              if (xp) {
                if (
                  previousXp != null &&
                  xp === previousXp &&
                  Date.now() - routeOkSince < 2500
                ) {
                  /* estimates panel may still reflect the previous action */
                } else {
                  resolve(xp);
                  return;
                }
              }
            }
          } else {
            routeOkSince = null;
          }
        } catch (e) {
          /* keep polling */
        }
        if (Date.now() - start > timeout) {
          reject(new Error("Timed out waiting for XP/h on the selected action."));
          return;
        }
        setTimeout(tick, 350);
      })();
    });
  }

  function loadImportState() {
    try {
      var raw = sessionStorage.getItem(IMPORT_STATE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.v === 1 && parsed.plan && parsed.skillKeys) return parsed;
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function saveImportState(state) {
    sessionStorage.setItem(IMPORT_RUN_KEY, "1");
    sessionStorage.setItem(IMPORT_STATE_KEY, JSON.stringify(state));
  }

  function clearImportState() {
    sessionStorage.removeItem(IMPORT_RUN_KEY);
    sessionStorage.removeItem(IMPORT_STATE_KEY);
  }

  function orderedSkillKeys(plan) {
    return GUILD_SKILL_ORDER.filter(function (skill) {
      return plan[skill] && plan[skill].path && plan[skill].actionId;
    });
  }

  function normalizeActionPath(path) {
    if (!path) return path;
    return path.charAt(0) === "/" ? path : "/" + path;
  }

  function initImportState(plan) {
    return {
      v: 1,
      returnUrl: returnUrl,
      plan: plan,
      skillKeys: orderedSkillKeys(plan),
      index: 0,
      results: {},
      errors: {},
      actionSources: {},
      lastXp: null,
    };
  }

  function finishImport(state) {
    clearImportState();
    var payload = {
      v: 1,
      importedAt: new Date().toISOString(),
      skills: state.results,
      actionSources: state.actionSources,
    };
    if (Object.keys(state.errors).length) payload.errors = state.errors;

    var sep = state.returnUrl.indexOf("?") >= 0 ? "&" : "?";
    var destination =
      state.returnUrl + sep + "xpImport=" + encodeURIComponent(toBase64Url(payload));

    setStatus(
      "Done! Returning to Guild Trials…",
      Object.keys(state.results).length + " skills imported.",
    );
    window.setTimeout(function () {
      location.href = destination;
    }, 600);
  }

  async function importAllDirect(plan) {
    var state = loadImportState();
    if (!state) {
      state = initImportState(plan);
      if (!state.skillKeys.length) {
        throw new Error("No Ironwood actions were provided for import.");
      }
      saveImportState(state);
    }

    var total = state.skillKeys.length;
    if (state.index >= total) {
      finishImport(state);
      return;
    }

    var skill = state.skillKeys[state.index];
    var entry = state.plan[skill];
    if (!entry || !entry.path || !entry.actionId) {
      state.errors[skill] = "Missing action configuration.";
      state.index++;
      saveImportState(state);
      if (state.index >= total) {
        finishImport(state);
        return;
      }
      location.assign(normalizeActionPath(state.plan[state.skillKeys[state.index]].path));
      return;
    }

    if (routeHasAction(entry.actionId)) {
      setStatus(
        "Importing " + (state.index + 1) + " / " + total + ": " + skill,
        "Reading Estimates XP/h for " + entry.name + "…",
      );

      await sleep(400);

      var xp = null;
      try {
        xp = await waitForXpOnAction(entry, 20000, state.lastXp);
      } catch (e) {
        state.errors[skill] = "Could not read XP/h on this action page.";
      }

      if (xp != null) {
        state.lastXp = xp;
        state.results[skill] = xp;
        state.actionSources[skill] = {
          actionId: entry.actionId,
          name: entry.name,
          level: null,
          url: location.origin + normalizeActionPath(entry.path),
          method: "profile",
          xpPerHour: xp,
        };
        setStatus(
          "Importing " + (state.index + 1) + " / " + total + ": " + skill,
          entry.name + " → " + xp.toLocaleString() + " XP/h",
        );
      } else if (!state.errors[skill]) {
        state.errors[skill] = "No XP/h estimate found (check Stats → Estimates).";
      }

      state.index++;
      saveImportState(state);

      if (state.index >= total) {
        await sleep(400);
        finishImport(state);
        return;
      }

      var nextEntry = state.plan[state.skillKeys[state.index]];
      setStatus(
        "Importing " + (state.index + 1) + " / " + total + ": " + state.skillKeys[state.index],
        "Opening " + nextEntry.name + "…",
      );
      await sleep(300);
      location.assign(normalizeActionPath(nextEntry.path));
      return;
    }

    setStatus(
      "Importing " + (state.index + 1) + " / " + total + ": " + skill,
      "Opening " + entry.name + "…",
    );
    await sleep(200);
    location.assign(normalizeActionPath(entry.path));
  }

  async function importAll() {
    var planFromUrl = readUserActionPlan();
    if (planFromUrl && Object.keys(planFromUrl).length) {
      clearImportState();
    }
    var state = loadImportState();
    var plan = state ? state.plan : planFromUrl;
    if (!plan || !Object.keys(plan).length) {
      throw new Error(
        "No Ironwood actions configured. Open your Guild Trials profile, pick an action for each skill, save, then run import again.",
      );
    }
    return importAllDirect(plan);
  }

  /* Legacy auto-detect helpers remain below for reference but are no longer used. */
  async function importAllLegacy_UNUSED() {
    await waitFor(function () {
      return skillNavButtons().length > 0;
    });

    var targets = [];
    skillNavButtons().forEach(function (btn) {
      var displayName = readSkillName(btn);
      var skill = SKILL_MAP[displayName];
      if (!skill) return;
      targets.push({ btn: btn, skill: skill, displayName: displayName });
    });

    if (!targets.length) {
      throw new Error("Could not find guild skill buttons in the Ironwood sidebar. Are you logged in?");
    }

    var results = {};
    var errors = {};
    var actionSources = {};

    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      setStatus(
        "Importing " + (i + 1) + " / " + targets.length + ": " + target.displayName,
        "Opening your best unlocked action and reading Estimates XP/h…",
      );

      target.btn.click();
      await sleep(400);

      var actionInfo = null;
      try {
        actionInfo = await openBestUnlockedAction(target.btn, target.displayName);
      } catch (e) {
        /* still try reading XP/h — page may already be on an action */
      }

      await sleep(300);

      var xp = null;
      try {
        xp = await waitFor(function () {
          return parseXpPerHour();
        }, 6000);
      } catch (e) {
        errors[target.skill] = "Could not read XP/h on this skill page.";
      }

      if (
        xp != null &&
        actionInfo &&
        actionInfo.actionId &&
        !actionSelectionMatches(actionInfo)
      ) {
        errors[target.skill] =
          "Selected action may not have updated (wanted #" + actionInfo.actionId +
          ", active #" + getActiveActionId() + ").";
      }

      if (xp != null) {
        results[target.skill] = xp;
        if (!actionInfo) {
          var active = document.querySelector(
            "actions-component button.row.active-link, actions-component a.row.active-link",
          );
          actionInfo = active ? actionInfoFromRow(active, "dom") : null;
        }
        if (actionInfo) {
          actionSources[target.skill] = {
            actionId: actionInfo.actionId,
            name: actionInfo.name,
            level: actionInfo.level,
            url: actionInfo.url,
            method: actionInfo.method,
            xpPerHour: xp,
          };
          setStatus(
            "Importing " + (i + 1) + " / " + targets.length + ": " + target.displayName,
            actionInfo.name + (actionInfo.level ? " (Lv. " + actionInfo.level + ")" : "") +
              " → " + xp.toLocaleString() + " XP/h",
          );
        }
      } else if (!errors[target.skill]) {
        errors[target.skill] = "No XP/h estimate found (check Stats → Estimates).";
      }
    }

    var payload = {
      v: 1,
      importedAt: new Date().toISOString(),
      skills: results,
      actionSources: actionSources,
    };
    if (Object.keys(errors).length) payload.errors = errors;

    var sep = returnUrl.indexOf("?") >= 0 ? "&" : "?";
    var destination = returnUrl + sep + "xpImport=" + encodeURIComponent(toBase64Url(payload));

    setStatus("Done! Returning to Guild Trials…", Object.keys(results).length + " skills imported.");
    await sleep(600);
    location.href = destination;
  }

  importAll().catch(function (err) {
    setStatus("Import failed", err && err.message ? err.message : String(err));
  });
})();
