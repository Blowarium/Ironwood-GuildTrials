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

  function resolveBestActionPathFromComponent(root) {
    var cmp = findActionsComponentInstance(root);
    if (!cmp || !cmp.ACTION_DATA || !cmp.skillData) return null;

    var skillId = cmp.skillId || cmp.skillData.id;
    if (!skillId) return null;

    var effectiveLevel = readEffectiveSkillLevel();
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
    return "/skill/" + skillId + "/action/" + bestId;
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
    var bestScoreVal = -1;
    var maxLevel = readEffectiveSkillLevel();

    function consider() {
      var rows = actionRowCandidates(root);
      var bestRow = pickBestRow(rows, maxLevel);
      if (!bestRow) bestRow = pickBestRow(unlockedActionRows(root), maxLevel);
      if (!bestRow) return;
      var score = actionScore(parseActionLevel(bestRow), parseActionId(bestRow));
      var path = readRouterLink(bestRow);
      if (path && score > bestScoreVal) {
        bestScoreVal = score;
        bestPath = path;
      }
    }

    var tierFilters = root.querySelector(".filters")
      ? Array.prototype.slice.call(root.querySelectorAll(".filters button.filter"))
      : [];

    if (!tierFilters.length) {
      await exploreSubFilterContainers(root, consider);
      consider();
      return bestPath;
    }

    for (var t = 0; t < tierFilters.length; t++) {
      await clickFilterButton(tierFilters[t]);
      await exploreSubFilterContainers(root, consider);
      consider();
    }

    return bestPath;
  }

  async function resolveBestActionPath(root) {
    var fromComponent = resolveBestActionPathFromComponent(root);
    if (fromComponent) return fromComponent;
    return findBestUnlockedActionPathFromDom(root);
  }

  async function openBestUnlockedAction() {
    var root = await waitFor(function () {
      return actionsComponentRoot();
    }, 12000);

    var bestPath = await resolveBestActionPath(root);
    if (!bestPath) return false;

    if (bestPath.charAt(0) !== "/") bestPath = "/" + bestPath;
    location.assign(bestPath);

    await waitFor(function () {
      return location.pathname.indexOf("/action/") >= 0;
    }, 12000);
    await sleep(700);
    return true;
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

    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      setStatus(
        "Importing " + (i + 1) + " / " + targets.length + ": " + target.displayName,
        "Opening your best unlocked action and reading Estimates XP/h…",
      );

      target.btn.click();
      await sleep(1000);

      try {
        await openBestUnlockedAction();
      } catch (e) {
        errors[target.skill] = "Could not open the highest unlocked action for this skill.";
        continue;
      }

      if (!location.pathname.includes("/action/")) {
        errors[target.skill] = "Could not navigate to an action page for this skill.";
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
      } else if (!errors[target.skill]) {
        errors[target.skill] = "No XP/h estimate found (check Stats → Estimates).";
      }
    }

    var payload = {
      v: 1,
      importedAt: new Date().toISOString(),
      skills: results,
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
