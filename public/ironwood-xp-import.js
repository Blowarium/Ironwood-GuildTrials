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

  function readRouterLink(el) {
    var href = el.getAttribute("href");
    if (href && /\/action\/\d+/i.test(href)) return href;

    var reflect = el.getAttribute("ng-reflect-router-link");
    if (reflect) {
      if (reflect.charAt(0) === "/") return reflect;
      if (reflect.charAt(0) === "[") {
        try {
          var parts = JSON.parse(reflect);
          if (Array.isArray(parts)) {
            var idx = parts.indexOf("action");
            if (idx > 0 && parts[idx + 1] != null) {
              var skillPart = parts[idx - 1];
              return "/skill/" + skillPart + "/action/" + parts[idx + 1];
            }
            return parts.join("/").replace(/\/{2,}/g, "/");
          }
        } catch (e) {
          /* fall through */
        }
      }
      var parts = reflect.split(",");
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] === "action" && parts[i + 1]) {
          return "/skill/" + parts[i - 1] + "/action/" + parts[i + 1];
        }
      }
    }

    for (var a = 0; a < el.attributes.length; a++) {
      var val = el.attributes[a].value || "";
      if (/\/action\/\d+/i.test(val)) return val;
    }
    return null;
  }

  function parseActionId(el) {
    var link = readRouterLink(el);
    if (!link) return 0;
    var match = link.match(/\/action\/(\d+)/i);
    return match ? Number(match[1]) : 0;
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

  function readEffectiveSkillLevel() {
    var scopes = document.querySelectorAll(
      "skill-page, actions-component, .page-title, [class*='skill']",
    );
    for (var i = 0; i < scopes.length; i++) {
      var text = scopes[i].textContent || "";
      var match = text.match(/Lv\.\s*(\d+)(?:\s*\+\s*(\d+))?/);
      if (match) return Number(match[1]) + (match[2] ? Number(match[2]) : 0);
    }
    return null;
  }

  function findActionsComponentInstance(rootEl) {
    var el = rootEl || document.querySelector("actions-component");
    if (!el) return null;

    if (typeof window.ng !== "undefined" && typeof window.ng.getComponent === "function") {
      try {
        return window.ng.getComponent(el);
      } catch (e) {
        /* fall through */
      }
    }

    var context = el.__ngContext__;
    if (!context) return null;

    var items = Array.isArray(context) ? context : [context];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || typeof item !== "object") continue;
      if (item.ACTION_DATA && item.skillData !== undefined) return item;
      if (item.ACTION_DATA && item.SKILL_DATA) return item;
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

  function readComponentEffectiveLevel(cmp) {
    if (!cmp) return readEffectiveSkillLevel();
    var level = cmp.skillLevel;
    var bonus = cmp.levelBonus || 0;
    if (typeof level === "number") return level + bonus;
    return readEffectiveSkillLevel();
  }

  function resolveBestActionPathFromComponent(root, displayName) {
    var cmp = findActionsComponentInstance(root);
    if (!cmp || !cmp.ACTION_DATA || !cmp.skillData) return null;

    if (displayName && cmp.skillData.name && !skillNamesMatch(displayName, cmp.skillData.name)) {
      return null;
    }

    var skillId = cmp.skillId || cmp.skillData.id;
    if (!skillId) return null;

    var effectiveLevel = readComponentEffectiveLevel(cmp);
    if (effectiveLevel == null) effectiveLevel = 9999;

    var bestId = null;
    var bestLevel = -1;

    function considerAction(ref) {
      if (!ref || ref.id == null) return;
      var data = cmp.ACTION_DATA[ref.id];
      if (!data) return;
      var level = data.level || 0;
      if (level > effectiveLevel) return;
      if (level > bestLevel || (level === bestLevel && ref.id > bestId)) {
        bestLevel = level;
        bestId = ref.id;
      }
    }

    function walkGroups(groups) {
      if (!groups) return;
      for (var i = 0; i < groups.length; i++) {
        var group = groups[i];
        if (group.actions) {
          for (var j = 0; j < group.actions.length; j++) {
            considerAction(group.actions[j]);
          }
        }
        if (group.actionGroups) walkGroups(group.actionGroups);
      }
    }

    var skillData = cmp.skillData;
    if (skillData.actions) {
      for (var k = 0; k < skillData.actions.length; k++) {
        considerAction(skillData.actions[k]);
      }
    }
    walkGroups(skillData.actionGroups);

    if (bestId == null) return null;
    var data = cmp.ACTION_DATA[bestId];
    return {
      path: "/skill/" + skillId + "/action/" + bestId,
      actionId: bestId,
      name: (data && data.name) || "Action " + bestId,
      level: (data && data.level) || null,
      method: "component",
    };
  }

  function readActionNameFromRow(row) {
    if (!row) return "";
    var nameEl = row.querySelector(".text, .name");
    return nameEl ? nameEl.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function actionInfoFromPath(path, row, method) {
    var match = path.match(/\/action\/(\d+)/i);
    var actionId = match ? Number(match[1]) : 0;
    var cmp = findActionsComponentInstance();
    var data = cmp && cmp.ACTION_DATA && actionId ? cmp.ACTION_DATA[actionId] : null;
    return {
      path: path,
      actionId: actionId,
      name: (data && data.name) || readActionNameFromRow(row) || "Action " + actionId,
      level: (data && data.level) || (row ? parseActionLevel(row) : null),
      method: method,
      row: row || null,
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

  function actionReady(resolved, previousRoute) {
    if (!resolved) return false;
    var route = currentRoutePath();
    if (previousRoute && route !== previousRoute && routeIncludesAction(resolved.actionId, parseSkillIdFromPath(resolved.path))) {
      return true;
    }
    if (isActiveActionRow(resolved.actionId)) return true;
    if (parseXpPerHour() != null) return true;
    return routeIncludesAction(resolved.actionId, parseSkillIdFromPath(resolved.path));
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
    var actionId = match ? Number(match[1]) : fallback && fallback.actionId;
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

  async function waitForActionReady(resolved, previousRoute) {
    await waitFor(function () {
      return actionReady(resolved, previousRoute);
    }, 12000);
    await sleep(700);
  }

  function findActionRowById(root, actionId) {
    if (!root || !actionId) return null;
    var rows = actionRowCandidates(root);
    for (var i = 0; i < rows.length; i++) {
      if (parseActionId(rows[i]) === actionId) return rows[i];
    }
    return null;
  }

  async function revealActionRow(root, actionId) {
    if (!root || !actionId) return null;

    var direct = findActionRowById(root, actionId);
    if (direct) return direct;

    await ensureActionsExpanded(root);

    var tierFilters = root.querySelector(".filters")
      ? Array.prototype.slice.call(root.querySelectorAll(".filters button.filter"))
      : [];

    async function searchSubFilters(consider) {
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

        var buttons = Array.prototype.slice.call(
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

    var found = null;

    function consider() {
      if (found) return;
      var row = findActionRowById(root, actionId);
      if (row) found = row;
    }

    if (!tierFilters.length) {
      await searchSubFilters(consider);
      consider();
      return found;
    }

    for (var t = 0; t < tierFilters.length; t++) {
      await clickFilterButton(tierFilters[t]);
      await searchSubFilters(consider);
      consider();
      if (found) return found;
    }

    return found;
  }

  async function navigateToResolvedAction(root, resolved) {
    if (!resolved || !resolved.path) return null;

    var previousRoute = currentRoutePath();
    var actionId = resolved.actionId;
    var row = resolved.row || (await revealActionRow(root, actionId));

    if (row && !isDisabled(row)) {
      row.click();
      try {
        await waitForActionReady(resolved, previousRoute);
        return readCurrentActionInfo(resolved);
      } catch (e) {
        /* fall through to direct navigation */
      }
    }

    var bestPath = resolved.path;
    if (bestPath.charAt(0) !== "/") bestPath = "/" + bestPath;
    if (currentRoutePath() !== bestPath) {
      location.assign(bestPath);
    }

    try {
      await waitForActionReady(resolved, previousRoute);
      return readCurrentActionInfo(resolved);
    } catch (e) {
      if (actionReady(resolved, previousRoute)) return readCurrentActionInfo(resolved);
      return buildActionInfo(resolved);
    }
  }

  function isActionRow(el) {
    if (!el || el.tagName !== "BUTTON" && el.tagName !== "A") return false;
    if (el.classList.contains("filter") || el.classList.contains("header")) return false;
    if (el.closest(".filters")) return false;
    if (el.closest(".sort .container") && !parseActionId(el)) return false;
    return parseActionId(el) > 0;
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
      if (isDisabled(row) && maxLevel == null) continue;
      var level = parseActionLevel(row);
      if (maxLevel != null && level > maxLevel) continue;
      if (maxLevel == null && isDisabled(row)) continue;
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

  async function exploreSubFilterContainers(root, consider) {
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

      var buttons = Array.prototype.slice.call(
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

  async function findBestUnlockedActionPathFromDom(root) {
    await ensureActionsExpanded(root);

    var bestPath = null;
    var bestRow = null;
    var bestScoreVal = -1;
    var maxLevel = readEffectiveSkillLevel();

    function consider() {
      var rows = actionRowCandidates(root);
      var row = pickBestRow(rows, maxLevel);
      if (!row) row = pickBestRow(unlockedActionRows(root), maxLevel);
      if (!row) return;
      var score = actionScore(parseActionLevel(row), parseActionId(row));
      var path = readRouterLink(row);
      if (path && score > bestScoreVal) {
        bestScoreVal = score;
        bestPath = path;
        bestRow = row;
      }
    }

    var tierFilters = root.querySelector(".filters")
      ? Array.prototype.slice.call(root.querySelectorAll(".filters button.filter"))
      : [];

    if (!tierFilters.length) {
      await exploreSubFilterContainers(root, consider);
      consider();
      if (!bestPath) return null;
      return actionInfoFromPath(bestPath, bestRow, "dom");
    }

    for (var t = 0; t < tierFilters.length; t++) {
      await clickFilterButton(tierFilters[t]);
      await exploreSubFilterContainers(root, consider);
      consider();
    }

    if (!bestPath) return null;
    return actionInfoFromPath(bestPath, bestRow, "dom");
  }

  async function resolveBestAction(root, displayName) {
    var fromComponent = resolveBestActionPathFromComponent(root, displayName);
    if (fromComponent) return fromComponent;
    return findBestUnlockedActionPathFromDom(root);
  }

  async function openBestUnlockedAction(displayName) {
    var root = await waitForSkillPage(displayName);

    var resolved = await resolveBestAction(root, displayName);
    if (!resolved || !resolved.path) return null;

    return navigateToResolvedAction(root, resolved);
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
      await sleep(300);

      var actionInfo = null;
      try {
        actionInfo = await openBestUnlockedAction(target.displayName);
      } catch (e) {
        errors[target.skill] = "Could not open the highest unlocked action for this skill.";
        continue;
      }

      if (!actionInfo) {
        errors[target.skill] = "Could not determine the highest unlocked action for this skill.";
        continue;
      }

      await sleep(500);

      var xp = null;
      try {
        xp = await waitFor(function () {
          return parseXpPerHour();
        }, 12000);
      } catch (e) {
        errors[target.skill] = "Could not read XP/h on this skill page.";
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
