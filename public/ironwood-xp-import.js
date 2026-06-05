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
      var actionIdx = -1;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] === "action" && parts[i + 1]) {
          actionIdx = i;
          break;
        }
      }
      if (actionIdx > 0) {
        return (
          "/skill/" +
          parts[actionIdx - 1] +
          "/action/" +
          parts[actionIdx + 1]
        );
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

  function actionScore(el) {
    var level = parseActionLevel(el);
    var id = parseActionId(el);
    return level * 100000 + id;
  }

  function unlockedActionRows(root) {
    return Array.prototype.slice.call(
      root.querySelectorAll("button.row, a.row"),
    ).filter(function (el) {
      if (isDisabled(el)) return false;
      if (el.offsetParent === null) return false;
      return parseActionId(el) > 0;
    });
  }

  function pickBestRow(rows) {
    if (!rows.length) return null;
    rows.sort(function (a, b) {
      return actionScore(b) - actionScore(a);
    });
    return rows[0];
  }

  async function findBestUnlockedAction(root) {
    var bestRow = null;
    var bestScore = -1;

    function considerRows() {
      var row = pickBestRow(unlockedActionRows(root));
      if (row && actionScore(row) > bestScore) {
        bestScore = actionScore(row);
        bestRow = row;
      }
    }

    var filterRows = Array.prototype.slice.call(root.querySelectorAll(".filters"));
    if (!filterRows.length) {
      considerRows();
      return bestRow;
    }

    async function exploreFilterRow(rowIndex) {
      var filters = Array.prototype.slice.call(
        filterRows[rowIndex].querySelectorAll("button.filter"),
      );

      if (!filters.length) {
        if (rowIndex === filterRows.length - 1) considerRows();
        return;
      }

      for (var i = 0; i < filters.length; i++) {
        if (!filters[i].disabled) {
          filters[i].click();
          await sleep(rowIndex === 0 ? 500 : 350);
        }

        if (rowIndex < filterRows.length - 1) {
          await exploreFilterRow(rowIndex + 1);
        } else {
          considerRows();
        }
      }
    }

    await exploreFilterRow(0);
    return bestRow;
  }

  async function openBestUnlockedAction() {
    var root = await waitFor(function () {
      return actionsComponentRoot();
    }, 12000);

    var bestRow = await findBestUnlockedAction(root);
    if (!bestRow) return false;

    var targetPath = readRouterLink(bestRow);
    bestRow.click();
    await sleep(700);

    if (targetPath && location.pathname.indexOf("/action/") < 0) {
      location.assign(targetPath);
      await sleep(900);
    }

    return location.pathname.includes("/action/");
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
      await sleep(900);

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

      await sleep(400);
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
