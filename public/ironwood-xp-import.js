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
    var data = lookupActionData(cmp, actionId);
    if (data && data.name) return data.name;
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
          var part = parts[i].replace(/"/g, "").trim();
          var next = parts[i + 1].replace(/"/g, "").trim();
          if (part.indexOf("action") >= 0 && /^\d+$/.test(next)) {
            return Number(next);
          }
        }
        var fromAttr = pathFromRouterSegments(parts);
        if (fromAttr) {
          var routeMatch = fromAttr.match(/\/action\/(\d+)/i);
          if (routeMatch) return Number(routeMatch[1]);
        }
      }
    }
    var cmp = findActionsComponentInstance();
    var rowName = readActionNameFromRow(el);
    if (rowName && cmp) {
      var byName = lookupActionDataByName(cmp, rowName);
      if (byName) return actionIdFromData(cmp, byName, 0);
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

  function normalizeActionId(id) {
    if (id == null) return 0;
    var n = Number(id);
    return n > 0 ? n : 0;
  }

  function lookupActionData(cmp, actionId) {
    if (!cmp || !cmp.ACTION_DATA || actionId == null) return null;
    var id = normalizeActionId(actionId);
    if (!id) return null;
    var direct = cmp.ACTION_DATA[id] || cmp.ACTION_DATA[String(id)];
    if (direct) return direct;
    var keys = Object.keys(cmp.ACTION_DATA);
    for (var i = 0; i < keys.length; i++) {
      var entry = cmp.ACTION_DATA[keys[i]];
      if (entry && normalizeActionId(entry.id) === id) return entry;
    }
    return null;
  }

  function lookupActionDataByName(cmp, name) {
    if (!cmp || !cmp.ACTION_DATA || !name) return null;
    var target = String(name).replace(/\s+/g, " ").trim().toLowerCase();
    if (!target) return null;
    var keys = Object.keys(cmp.ACTION_DATA);
    for (var i = 0; i < keys.length; i++) {
      var entry = cmp.ACTION_DATA[keys[i]];
      if (!entry || !entry.name) continue;
      if (entry.name.replace(/\s+/g, " ").trim().toLowerCase() === target) return entry;
    }
    return null;
  }

  function actionIdFromData(cmp, data, fallbackId) {
    if (!data) return normalizeActionId(fallbackId);
    var fromData = normalizeActionId(data.id);
    if (fromData) return fromData;
    if (!cmp || !cmp.ACTION_DATA) return normalizeActionId(fallbackId);
    var keys = Object.keys(cmp.ACTION_DATA);
    for (var i = 0; i < keys.length; i++) {
      if (cmp.ACTION_DATA[keys[i]] === data) {
        return normalizeActionId(keys[i]);
      }
    }
    return normalizeActionId(fallbackId);
  }

  function resolveActionRecord(ref, cmp) {
    var refId = actionRefId(ref);
    var data = refId ? lookupActionData(cmp, refId) : null;
    if (!data && ref && typeof ref === "object" && ref.name) {
      data = lookupActionDataByName(cmp, ref.name) || ref;
    }
    if (!data && typeof ref === "number") {
      data = lookupActionData(cmp, ref);
    }
    if (!data) return null;
    var id = actionIdFromData(cmp, data, refId);
    if (!id) return null;
    return {
      id: id,
      name: data.name || "",
      level: data.level || 0,
      data: data,
    };
  }

  function readComponentSkillData(cmp) {
    if (!cmp) return null;
    var data = cmp.skillData;
    if (!data) data = readObservableValue(cmp.skillData$);
    if (!data && cmp.skillId != null && cmp.SKILL_DATA) {
      data = cmp.SKILL_DATA[cmp.skillId] || cmp.SKILL_DATA[String(cmp.skillId)];
    }
    return data || null;
  }

  function readComponentActionId(cmp) {
    if (!cmp) return 0;
    var id =
      typeof cmp.actionId === "number" ? cmp.actionId : readObservableValue(cmp.actionId$);
    return normalizeActionId(id);
  }

  function actionRefId(ref) {
    if (ref == null) return 0;
    if (typeof ref === "object") {
      return normalizeActionId(ref.id != null ? ref.id : ref.actionId);
    }
    return normalizeActionId(ref);
  }

  function findGroupsForAction(skillData, actionId) {
    var result = { actionGroup: null, subActionGroup: null };
    if (!skillData || !actionId) return result;
    var aid = normalizeActionId(actionId);

    function scanActions(actions, ag, sag) {
      if (!actions) return;
      for (var i = 0; i < actions.length; i++) {
        if (actionRefId(actions[i]) === aid) {
          result.actionGroup = ag;
          result.subActionGroup = sag;
        }
      }
    }

    scanActions(skillData.actions, null, null);

    if (skillData.actionGroups) {
      for (var g = 0; g < skillData.actionGroups.length; g++) {
        var ag = skillData.actionGroups[g];
        scanActions(ag.actions, ag, null);
        if (ag.actionGroups) {
          for (var s = 0; s < ag.actionGroups.length; s++) {
            var sag = ag.actionGroups[s];
            scanActions(sag.actions, ag, sag);
          }
        }
      }
    }

    return result;
  }

  async function applyComponentFilterState(cmp, resolved) {
    if (!cmp || !resolved) return;
    var skillData = readComponentSkillData(cmp);
    if (!skillData) return;
    var groups = findGroupsForAction(skillData, resolved.actionId);
    if (groups.actionGroup) cmp.actionGroup = groups.actionGroup;
    if (groups.subActionGroup) cmp.subActionGroup = groups.subActionGroup;
    await sleep(500);
  }

  function isTargetActionSelected(actionId, cmp) {
    var target = normalizeActionId(actionId);
    if (!target) return false;
    var route = currentRoutePath();
    if (route.indexOf("/action/" + target) >= 0) return true;
    if (readComponentActionId(cmp) === target) return true;
    if (getActiveActionRowId() === target) return true;
    return false;
  }

  function getActiveActionRowId() {
    var rows = document.querySelectorAll(
      "actions-component button.row.active-link, actions-component a.row.active-link",
    );
    for (var i = 0; i < rows.length; i++) {
      var id = parseActionId(rows[i]);
      if (id > 0) return id;
    }
    return 0;
  }

  function actionInfoFromResolved(resolved, navigated) {
    var path = resolved.path;
    if (path && path.charAt(0) !== "/") path = "/" + path;
    return {
      actionId: resolved.actionId,
      name: resolved.name,
      level: resolved.level,
      url: location.origin + path,
      method: resolved.method || "component",
      targetActionId: resolved.actionId,
      navigated: !!navigated,
    };
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

    var skillData = readComponentSkillData(cmp);
    if (!skillData) return null;

    var skillId = cmp.skillId || skillData.id;
    if (!skillId) return null;

    var effectiveLevel = readComponentEffectiveLevel(cmp);
    if (effectiveLevel == null) effectiveLevel = 9999;

    var candidates = [];

    function considerAction(ref) {
      var record = resolveActionRecord(ref, cmp);
      if (!record) return;
      if (record.level > effectiveLevel) return;
      candidates.push({
        id: record.id,
        level: record.level,
        name: record.name,
        score: scoreActionCandidate(record.level, record.id, record.name, prefs),
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
    var data = lookupActionData(cmp, bestId);
    var actionId = actionIdFromData(cmp, data, bestId);
    if (!actionId) return null;
    return {
      path: "/skill/" + skillId + "/action/" + actionId,
      actionId: actionId,
      name: (data && data.name) || "Action " + actionId,
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
    var cmp = findActionsComponentInstance();
    var actionId = parseActionId(row);
    var data = lookupActionData(cmp, actionId);
    if (!data) {
      var rowName = readActionNameFromRow(row);
      data = rowName ? lookupActionDataByName(cmp, rowName) : null;
      if (data) actionId = actionIdFromData(cmp, data, actionId);
    }
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

    var cmp = findActionsComponentInstance();
    var fromCmp = readComponentActionId(cmp);
    if (fromCmp) return fromCmp;

    return getActiveActionRowId();
  }

  async function clickActionRow(row) {
    if (!row || isDisabled(row)) return;
    try {
      row.scrollIntoView({ block: "nearest" });
    } catch (e) {
      /* ignore */
    }
    row.click();
    await sleep(300);
    var link = row.querySelector("a[href], [ng-reflect-router-link]");
    if (link && link !== row && !isDisabled(link)) {
      link.click();
      await sleep(300);
    }
  }

  async function waitUntilActionActive(actionId, timeoutMs) {
    await waitFor(function () {
      return isTargetActionSelected(actionId, findActionsComponentInstance());
    }, timeoutMs || 12000);
    await sleep(700);
  }

  async function navigateToResolvedAction(root, resolved) {
    if (!resolved || !resolved.actionId) return false;

    var targetId = normalizeActionId(resolved.actionId);
    var cmp = findActionsComponentInstance(root);

    if (isTargetActionSelected(targetId, cmp)) {
      await sleep(400);
      return true;
    }

    await applyComponentFilterState(cmp, resolved);

    if (resolved.path) {
      var path = resolved.path.charAt(0) === "/" ? resolved.path : "/" + resolved.path;
      location.assign(path);
      try {
        await waitFor(function () {
          return (
            routeIncludesAction(targetId, parseSkillIdFromPath(path)) &&
            isTargetActionSelected(targetId, findActionsComponentInstance(root))
          );
        }, 12000);
      } catch (e) {
        /* fall through to row click */
      }
    }

    cmp = findActionsComponentInstance(root);
    if (isTargetActionSelected(targetId, cmp)) {
      await sleep(800);
      return true;
    }

    await applyComponentFilterState(cmp, resolved);

    var row = await revealActionRow(root, targetId, resolved.prefs);
    if (row) {
      await clickActionRow(row);
      try {
        await waitUntilActionActive(targetId, 10000);
      } catch (e) {
        /* give up */
      }
    }

    if (isTargetActionSelected(targetId, findActionsComponentInstance(root))) {
      await sleep(800);
      return true;
    }

    return false;
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

  function actionReady(resolved) {
    if (!resolved || !resolved.actionId) return false;
    return isTargetActionSelected(resolved.actionId, findActionsComponentInstance());
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
    var routeActionId = match ? Number(match[1]) : 0;
    var actionId = activeId || routeActionId || 0;
    var cmp = findActionsComponentInstance();
    var data = cmp && cmp.ACTION_DATA && actionId ? cmp.ACTION_DATA[actionId] : null;

    var active = document.querySelector(
      "actions-component button.row.active-link, actions-component a.row.active-link",
    );
    var name =
      (data && data.name) ||
      readActionNameFromRow(active) ||
      (actionId ? "Action " + actionId : "Unknown action");

    if (!actionId && fallback) {
      actionId = fallback.actionId;
      name = fallback.name || name;
    }

    var reportPath = path;
    if (actionId && path.indexOf("/action/" + actionId) < 0 && fallback && fallback.path) {
      reportPath = fallback.path;
    }

    return {
      actionId: actionId || 0,
      name: name,
      level:
        (data && data.level) ||
        (active ? parseActionLevel(active) : null) ||
        (fallback && fallback.level),
      url: location.origin + reportPath,
      method: (fallback && fallback.method) || "dom",
      targetActionId: fallback && fallback.actionId ? fallback.actionId : null,
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

  async function waitForActionReady(resolved) {
    await waitFor(function () {
      return actionReady(resolved);
    }, 12000);
    await sleep(700);
  }

  async function readXpForResolvedAction(resolved) {
    var targetId = normalizeActionId(resolved.actionId);
    await waitFor(function () {
      return isTargetActionSelected(targetId, findActionsComponentInstance());
    }, 15000);
    await sleep(1000);
    return await waitFor(function () {
      if (!isTargetActionSelected(targetId, findActionsComponentInstance())) return false;
      var xp = parseXpPerHour();
      return xp != null ? xp : false;
    }, 10000);
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
    var buttons = root.querySelectorAll(".sort .container button");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var text = (btn.textContent || "").replace(/\s+/g, " ").trim();
      if (text.toLowerCase() === subGroupName.toLowerCase()) {
        await clickFilterButton(btn);
        return true;
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

  async function waitForComponentForSkill(skillBtn) {
    var expectedSkillId = parseSkillIdFromElement(skillBtn);
    await waitFor(function () {
      var root = actionsComponentRoot();
      if (!root) return false;
      if (!expectedSkillId) return root;
      var cmp = findActionsComponentInstance(root);
      var skillData = readComponentSkillData(cmp);
      if (!cmp || !skillData) return false;
      var sid = cmp.skillId || skillData.id;
      return String(sid) === String(expectedSkillId) ? root : false;
    }, 12000);
    await sleep(500);
    return actionsComponentRoot();
  }

  function enrichResolvedFromComponent(root, resolved) {
    if (!resolved) return resolved;
    var cmp = findActionsComponentInstance(root);
    var data = lookupActionData(cmp, resolved.actionId);
    if (!data && resolved.name) {
      data = lookupActionDataByName(cmp, resolved.name);
    }
    if (data) {
      resolved.actionId = actionIdFromData(cmp, data, resolved.actionId);
      resolved.name = data.name || resolved.name;
      resolved.level = data.level != null ? data.level : resolved.level;
    }
    if (resolved.actionId && cmp) {
      var skillId = cmp.skillId || (readComponentSkillData(cmp) && readComponentSkillData(cmp).id);
      if (skillId) {
        resolved.path = "/skill/" + skillId + "/action/" + resolved.actionId;
      }
    }
    return resolved;
  }

  async function resolveBestAction(root, displayName) {
    var prefs = actionPreferences(displayName);
    var fromComponent = resolveBestActionPathFromComponent(root, prefs);
    if (fromComponent) {
      fromComponent.prefs = prefs;
      return fromComponent;
    }
    await sleep(300);
    fromComponent = resolveBestActionPathFromComponent(root, prefs);
    if (fromComponent) {
      fromComponent.prefs = prefs;
      return fromComponent;
    }
    var fromDom = await findBestUnlockedActionPathFromDom(root, prefs);
    if (fromDom) {
      fromDom.prefs = prefs;
      return enrichResolvedFromComponent(root, fromDom);
    }
    return null;
  }

  async function openBestUnlockedAction(skillBtn, displayName) {
    var root = await waitForComponentForSkill(skillBtn);
    if (!root) return null;

    var resolved = await resolveBestAction(root, displayName);
    if (!resolved) return null;

    if (!resolved.prefs) resolved.prefs = actionPreferences(displayName);

    var navigated = await navigateToResolvedAction(root, resolved);
    if (!navigated) {
      await sleep(500);
      navigated = await navigateToResolvedAction(root, resolved);
    }

    return actionInfoFromResolved(resolved, navigated);
  }

  function toBase64Url(obj) {
    var json = JSON.stringify(obj);
    return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function importAll() {
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

      if (!actionInfo) {
        errors[target.skill] = "Could not determine the best unlocked action.";
        continue;
      }

      if (!actionInfo.navigated) {
        errors[target.skill] =
          "Could not open " + actionInfo.name + " (action #" + actionInfo.actionId + ").";
        continue;
      }

      await sleep(400);

      var xp = null;
      try {
        xp = await readXpForResolvedAction({
          actionId: actionInfo.actionId,
          path: actionInfo.url.replace(location.origin, ""),
        });
      } catch (e) {
        errors[target.skill] = "Could not read XP/h on this skill page.";
      }

      if (
        xp != null &&
        !isTargetActionSelected(actionInfo.actionId, findActionsComponentInstance())
      ) {
        errors[target.skill] =
          "Selected action may not have updated (wanted #" + actionInfo.actionId +
          ", active #" + getActiveActionId() + ").";
        xp = null;
      }

      if (xp != null) {
        results[target.skill] = xp;
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
