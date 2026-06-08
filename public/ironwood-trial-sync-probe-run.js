/**
 * Automated trial data probe — runs on ironwoodrpg.com/guild via Tampermonkey helper.
 * Uses the same Trials-tab navigation as ironwood-trial-sync.js.
 */
(function ironwoodTrialProbeRun() {
  if (!/(^|\.)ironwoodrpg\.com$/i.test(location.hostname)) return;

  var TRIAL_MS = 24 * 60 * 60 * 1000;
  var GUILD_PATH = "/guild";
  var SCRIPT_VERSION = "1.9.6";

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
    "";

  if (!returnUrl) {
    alert("Missing return URL. Start the probe from Guild Trials planner.");
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

  function installCaptureHook() {
    if (window.__IGT_GUILD_CAPTURE_INSTALLED__) return;
    var origin;
    try {
      origin = new URL(returnUrl).origin;
    } catch (e) {
      origin = "https://ironwood-guild-trials.vercel.app";
    }
    var script = document.createElement("script");
    script.src = origin + "/ironwood-guild-capture.js?v=" + SCRIPT_VERSION;
    (document.head || document.documentElement).appendChild(script);
  }

  if (!window.__IGT_GUILD_CAPTURE_INSTALLED__) installCaptureHook();

  function readObservableValue(subject) {
    if (!subject) return null;
    if (typeof subject === "object" && !subject.getValue && Array.isArray(subject)) return subject;
    if (typeof subject.getValue === "function") return subject.getValue();
    if (typeof subject.value !== "undefined") return subject.value;
    if (typeof subject._value !== "undefined") return subject._value;
    return null;
  }

  function findInNgContext(obj, seen, depth, matcher) {
    if (!obj || depth > 22) return null;
    if (typeof obj !== "object") return null;
    if (seen.has(obj)) return null;
    seen.add(obj);
    if (matcher(obj)) return obj;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        var hit = findInNgContext(obj[i], seen, depth + 1, matcher);
        if (hit) return hit;
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

  function scanAllNgContexts(matcher, limit) {
    var all = document.querySelectorAll("*");
    var max = Math.min(all.length, limit || 8000);
    var ngContextCount = 0;
    for (var i = 0; i < max; i++) {
      var node = all[i];
      if (!node.__ngContext__) continue;
      ngContextCount++;
      var hit = findInNgContext(node.__ngContext__, new WeakSet(), 0, matcher);
      if (hit) return { hit: hit, ngContextCount: ngContextCount };
    }
    return { hit: null, ngContextCount: ngContextCount };
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

    var full = scanAllNgContexts(isHost, 8000);
    if (full.hit) return full.hit;
    return scanAllNgContexts(isTrialSkillsHost, 8000).hit;
  }

  function countNgContextNodes(limit) {
    var all = document.querySelectorAll("*");
    var max = Math.min(all.length, limit || 8000);
    var count = 0;
    for (var i = 0; i < max; i++) {
      if (all[i].__ngContext__) count++;
    }
    return count;
  }

  function captureState() {
    return window.__IGT_GUILD_CAPTURE__ || { guild: null, raw: [] };
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

  function inferStart(endDate) {
    var end = new Date(endDate).getTime();
    if (Number.isNaN(end)) return null;
    return new Date(end - TRIAL_MS).toISOString();
  }

  function resolveMemberSchedule(parsed) {
    if (!parsed || !parsed.endDate) {
      return { endDate: null, inferredStartAt: null };
    }
    var endDate = parsed.endDate;
    return {
      endDate: endDate,
      inferredStartAt: parsed.inferredStartAt || inferStart(endDate),
    };
  }

  function guildUiVisible() {
    var text = document.body ? document.body.innerText || "" : "";
    return /Members/i.test(text) && (/Trials/i.test(text) || /Quests/i.test(text));
  }

  function trialsTabActive() {
    var text = document.body ? document.body.innerText || "" : "";
    if (/Required\s+(Exp|XP)/i.test(text)) return true;
    if (/Trial\s+Hall/i.test(text)) return true;
    if (/Guild\s+Credits/i.test(text) && /Woodcutting|Mining|Exploring/i.test(text)) return true;
    var activeBtn = document.querySelector("button.active, button[aria-selected='true']");
    if (activeBtn && /Trials/i.test(activeBtn.textContent || "")) return true;
    return false;
  }

  function headerSkillName(el) {
    var text = (el.textContent || "").trim();
    if (text.length > 80) return null;
    var firstLine = text.split("\n")[0].trim();
    for (var si = 0; si < SKILL_ORDER.length; si++) {
      var skill = SKILL_ORDER[si];
      if (new RegExp("^" + skill.replace(/-/g, "\\-") + "\\s+Trial\\b", "i").test(firstLine)) {
        return skill;
      }
    }
    return null;
  }

  function elementHasClass(el, className) {
    if (!el || !el.className) return false;
    if (typeof el.className !== "string") return false;
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
    return {
      endDate: new Date(endMs).toISOString(),
      inferredStartAt: new Date(endMs - TRIAL_MS).toISOString(),
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
          sib = sib.previousElementSibling;
          continue;
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

  function collectAssignmentsFromDomRows() {
    var buttons = findTrialAssignmentButtons();
    var out = [];
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
      out.push({
        displayName: parsed.displayName,
        skillId: skillName,
        exp: parsed.exp,
        endDate: schedule.endDate,
        inferredStartAt: schedule.inferredStartAt,
        source: "dom.rows",
      });
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

  function dedupeAssignmentsByMember(list) {
    var byName = {};
    var sourceRank = {
      "trialSkills$": 5,
      "guild.trial.members": 5,
      "capture.guild.trial.members": 4,
      "dom.rows": 5,
      "dom.text": 3,
      "dom.scoped": 2,
      "dom.columns": 1,
    };
    function shouldReplaceAssignment(existing, next) {
      if (!existing) return true;
      var rankExisting = sourceRank[existing.source] || 0;
      var rankNext = sourceRank[next.source] || 0;
      if (rankNext > rankExisting) {
        if (next.endDate || !existing.endDate) return true;
        return false;
      }
      if (rankNext < rankExisting) {
        if (!existing.endDate && next.endDate) return true;
        return false;
      }
      if (next.endDate && !existing.endDate) return true;
      return false;
    }
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!isLikelyMemberName(a.displayName)) continue;
      var key = normalizeMemberKey(a.displayName);
      var existing = byName[key];
      if (shouldReplaceAssignment(existing, a)) {
        byName[key] = a;
      }
    }
    return Object.keys(byName).map(function (k) {
      return byName[k];
    });
  }

  function findSkillBlocksSorted() {
    var headers = document.querySelectorAll("div, span, button, h1, h2, h3, h4, p");
    var skillBlocks = [];
    var seenSkills = {};

    for (var i = 0; i < headers.length; i++) {
      var skillName = headerSkillName(headers[i]);
      if (!skillName || seenSkills[skillName]) continue;
      seenSkills[skillName] = true;
      skillBlocks.push({ el: headers[i], skillName: skillName });
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

  function probeDomVisible() {
    var rowButtons = findTrialAssignmentButtons();
    var skillHeaders = 0;
    var seenHeaders = {};
    for (var hi = 0; hi < rowButtons.length; hi++) {
      var skill = skillForTrialAssignmentButton(rowButtons[hi]);
      if (skill && !seenHeaders[skill]) {
        seenHeaders[skill] = true;
        skillHeaders++;
      }
    }

    var memberNames = {};
    for (var bi = 0; bi < rowButtons.length; bi++) {
      var parsed = parseTrialAssignmentButton(rowButtons[bi]);
      if (parsed) memberNames[normalizeMemberKey(parsed.displayName)] = true;
    }

    var bodyText = document.body ? document.body.innerText || "" : "";
    return {
      skillHeaders: skillHeaders,
      memberXpLines: Object.keys(memberNames).length,
      hasRequiredExp: /Required\s+(Exp|XP)/i.test(bodyText),
    };
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
        return "changeTab";
      } catch (e) {
        /* fall through */
      }
    }
    return clickTrialsTabDom() ? "domClick" : "none";
  }

  async function triggerTrialLoad(host) {
    if (host && typeof host.getTrial === "function") {
      try {
        var result = host.getTrial();
        if (result && typeof result.then === "function") {
          await result;
          return "getTrial";
        }
      } catch (e) {
        /* fall through */
      }
    }
    return navigateToTrialsTab(host);
  }

  function collectAssignments(cmp, guild, capture) {
    var out = [];
    var trial = (guild && guild.trial) || null;

    if (cmp && cmp.trialSkills$) {
      var rows = readObservableValue(cmp.trialSkills$) || [];
      for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        var members = row.members || [];
        if (!Array.isArray(members) && members && typeof members === "object") {
          members = Object.values(members);
        }
        for (var mi = 0; mi < members.length; mi++) {
          var m = members[mi];
          out.push({
            displayName: m.displayName,
            skillId: m.skillId != null ? m.skillId : row.id,
            exp: m.exp,
            endDate: m.endDate || null,
            inferredStartAt: m.endDate ? inferStart(m.endDate) : null,
            source: "trialSkills$",
          });
        }
      }
    }

    if (trial && trial.members) {
      Object.values(trial.members).forEach(function (m) {
        out.push({
          displayName: m.displayName,
          skillId: m.skillId,
          exp: m.exp,
          endDate: m.endDate || null,
          inferredStartAt: m.endDate ? inferStart(m.endDate) : null,
          source: "guild.trial.members",
        });
      });
    }

    if (capture && capture.guild && capture.guild.trial && capture.guild.trial.members) {
      Object.values(capture.guild.trial.members).forEach(function (m) {
        out.push({
          displayName: m.displayName,
          skillId: m.skillId,
          exp: m.exp,
          endDate: m.endDate || null,
          inferredStartAt: m.endDate ? inferStart(m.endDate) : null,
          source: "capture.guild.trial.members",
        });
      });
    }

    return out;
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

  function collectAssignmentsFromDomScoped() {
    var headers = document.querySelectorAll("div, span, button, h1, h2, h3, h4, p");
    var skillBlocks = [];
    var seenSkills = {};
    var out = [];

    for (var i = 0; i < headers.length; i++) {
      var skillName = headerSkillName(headers[i]);
      if (!skillName || seenSkills[skillName]) continue;
      seenSkills[skillName] = true;
      skillBlocks.push({ el: headers[i], skillName: skillName });
    }

    for (var b = 0; b < skillBlocks.length; b++) {
      var block = skillBlocks[b];
      var nextEl = skillBlocks[b + 1] ? skillBlocks[b + 1].el : null;
      var clickables = collectClickablesBetween(block.el, nextEl);
      for (var bi = 0; bi < clickables.length; bi++) {
        var parsed = parseMemberButton(clickables[bi].textContent || "");
        if (!parsed) continue;
        var schedule = resolveMemberSchedule(parsed);
        out.push({
          displayName: parsed.displayName,
          skillId: block.skillName,
          exp: parsed.exp,
          endDate: schedule.endDate,
          inferredStartAt: schedule.inferredStartAt,
          source: "dom.scoped",
        });
      }
    }

    return out;
  }

  function collectAssignmentsFromVisibleText() {
    var bodyText = document.body ? document.body.innerText || "" : "";
    if (!/\bTrial\b/i.test(bodyText)) return [];

    var out = [];
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
      var lines = section.split("\n");
      for (var li = 0; li < lines.length; li++) {
        var parsed = parseMemberContextFromLines(lines, li);
        if (!parsed) continue;
        var schedule = resolveMemberSchedule(parsed);
        out.push({
          displayName: parsed.displayName,
          skillId: skill,
          exp: parsed.exp,
          endDate: schedule.endDate,
          inferredStartAt: schedule.inferredStartAt,
          source: "dom.text",
        });
      }
    }

    return out;
  }

  function collectAssignmentsFromDomColumns() {
    var skillBlocks = findSkillBlocksSorted();
    if (!skillBlocks.length) return [];

    var out = [];
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
      seenMemberKeys[memberKey] = true;
      var schedule = resolveMemberSchedule(parsed);
      out.push({
        displayName: parsed.displayName,
        skillId: skillName,
        exp: parsed.exp,
        endDate: schedule.endDate,
        inferredStartAt: schedule.inferredStartAt,
        source: "dom.columns",
      });
    }
    return out;
  }

  function collectAllAssignments(cmp, guild, capture) {
    var rows = collectAssignmentsFromDomRows();
    var text = collectAssignmentsFromVisibleText();
    var scoped = collectAssignmentsFromDomScoped();
    var columns = collectAssignmentsFromDomColumns();
    var domSource = rows.length
      ? rows
      : text.length
        ? text
        : scoped.length
          ? scoped
          : columns;
    var dom = dedupeAssignmentsByMember(domSource.concat(text));
    return dedupeAssignmentsByMember(collectAssignments(cmp, guild, capture).concat(dom));
  }

  function dedupeAssignments(list) {
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var key = a.displayName + "|" + String(a.skillId) + "|" + String(a.source);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(a);
    }
    return out;
  }

  var overlay = document.getElementById("igt-trial-probe-overlay");
  if (!overlay) {
    overlay = document.getElementById("igt-trial-helper-bootstrap");
  }
  if (!overlay) {
    overlay = document.createElement("div");
  }
  overlay.id = "igt-trial-probe-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:999999;background:rgba(8,12,22,0.92);color:#e2e8f0;font:14px/1.5 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:none;";
  if (!overlay.querySelector("#igt-trial-probe-status")) {
    overlay.innerHTML =
      '<div style="max-width:440px;text-align:center;pointer-events:auto;background:rgba(15,23,42,0.95);border:1px solid rgba(148,163,184,0.25);border-radius:12px;padding:20px 24px;box-shadow:0 8px 32px rgba(0,0,0,0.4)">' +
      '<p style="font-size:18px;font-weight:600;margin:0 0 8px">Probing trial data</p>' +
      '<p id="igt-trial-probe-status" style="margin:0;color:#94a3b8">Starting…</p>' +
      '<p id="igt-trial-probe-detail" style="margin:12px 0 0;font-size:12px;color:#64748b"></p>' +
      "</div>";
  }
  if (!overlay.parentNode) {
    (document.body || document.documentElement).appendChild(overlay);
  }
  var bootstrap = document.getElementById("igt-trial-helper-bootstrap");
  if (bootstrap && bootstrap !== overlay) bootstrap.remove();

  function setOverlayWatchMode(watch) {
    overlay.style.background = watch ? "rgba(8,12,22,0.15)" : "rgba(8,12,22,0.92)";
    overlay.style.pointerEvents = "none";
  }

  function setStatus(main, detail) {
    var s = document.getElementById("igt-trial-probe-status");
    var d = document.getElementById("igt-trial-probe-detail");
    if (s) s.textContent = main;
    if (d) d.textContent = detail || "";
  }

  async function ensureTrialsOpen() {
    var host = findGuildTrialsComponent();
    var navigationMethod = "none";
    var trialsTabClickAttempted = false;

    setOverlayWatchMode(true);
    setStatus("Opening Trials tab…", "You should see the guild page switch tabs.");

    navigationMethod = await triggerTrialLoad(host);
    trialsTabClickAttempted = navigationMethod !== "none";
    await sleep(1200);

    for (var attempt = 0; attempt < 45; attempt++) {
      host = findGuildTrialsComponent() || host;

      if (trialsTabActive()) {
        setStatus("Trials tab open", "Reading trial data…");
        break;
      }

      if (attempt === 3 || attempt === 8 || attempt === 15 || attempt === 25) {
        navigationMethod = await triggerTrialLoad(host);
        if (navigationMethod !== "none") trialsTabClickAttempted = true;
        await sleep(900);
      }

      var capture = captureState();
      var guild =
        (host && host.guild$ ? readObservableValue(host.guild$) : null) ||
        capture.guild ||
        guildFromCaptureRaw();
      var cmp = host || findGuildTrialsComponent();
      var assignments = collectAllAssignments(cmp, guild, capture);

      if (assignments.length > 0) {
        setStatus("Trial data detected", assignments.length + " assignment row(s) found.");
        break;
      }

      setStatus(
        "Opening Trials tab…",
        "attempt " +
          (attempt + 1) +
          "/45 · tabActive=" +
          (trialsTabActive() ? "yes" : "no") +
          " · capture=" +
          (capture.raw || []).length,
      );
      await sleep(600);
    }

    setOverlayWatchMode(false);
    return {
      navigationMethod: navigationMethod,
      trialsTabClickAttempted: trialsTabClickAttempted,
      trialsTabActive: trialsTabActive(),
    };
  }

  async function run() {
    try {
      if (location.pathname.replace(/\/$/, "") !== GUILD_PATH) {
        setStatus("Opening guild page…", GUILD_PATH);
        var next = new URL(location.origin + GUILD_PATH);
        next.searchParams.set("igtTrialProbe", "1");
        next.searchParams.set("igtReturn", returnUrl);
        location.assign(next.toString());
        return;
      }

      for (var wait = 0; wait < 60; wait++) {
        if (guildUiVisible()) break;
        setStatus("Waiting for guild UI…", String(wait + 1) + "/60");
        await sleep(500);
      }

      if (!guildUiVisible()) {
        setStatus("Guild UI not visible", "Log in and open your guild, then try again.");
        await sleep(5000);
        return;
      }

      var nav = await ensureTrialsOpen();
      await sleep(1500);

      var cmp = findGuildTrialsComponent();
      var capture = captureState();
      var guildFromCmp = cmp && cmp.guild$ ? readObservableValue(cmp.guild$) : null;
      var guild = guildFromCmp || capture.guild || guildFromCaptureRaw() || null;
      var trial = guild && guild.trial ? guild.trial : null;
      var trialSkills = cmp && cmp.trialSkills$ ? readObservableValue(cmp.trialSkills$) : null;
      var trialSkillsRows = Array.isArray(trialSkills) ? trialSkills.length : 0;
      var trialSkillsMembers = 0;
      if (Array.isArray(trialSkills)) {
        for (var ts = 0; ts < trialSkills.length; ts++) {
          var mem = trialSkills[ts].members || [];
          if (Array.isArray(mem)) trialSkillsMembers += mem.length;
          else if (mem && typeof mem === "object") trialSkillsMembers += Object.keys(mem).length;
        }
      }

      var assignments = collectAllAssignments(cmp, guild, capture);
      var domAssignments = assignments.filter(function (a) {
        return (
          a.source === "dom.scoped" ||
          a.source === "dom.text" ||
          a.source === "dom.columns"
        );
      });
      var withEndDate = assignments.filter(function (a) {
        return a.endDate;
      });

      var captureUrls = (capture.raw || []).slice(-5).map(function (r) {
        return r.url;
      });
      var recentNetworkUrls = (capture.urls || []).slice(-8);
      var domProbe = probeDomVisible();

      var report = {
        v: 1,
        importedAt: new Date().toISOString(),
        pageUrl: location.href,
        diagnostics: {
          componentFound: Boolean(cmp),
          hasGuildObservable: Boolean(cmp && cmp.guild$),
          hasTrialSkillsObservable: Boolean(cmp && cmp.trialSkills$),
          hasGetTrial: Boolean(cmp && typeof cmp.getTrial === "function"),
          ngGetComponentAvailable: Boolean(
            typeof window.ng !== "undefined" && typeof window.ng.getComponent === "function",
          ),
          ngContextNodesWithContext: countNgContextNodes(8000),
          guildTrialOnGuildObject: Boolean(trial),
          trialMembersOnGuildTrial: trial && trial.members ? Object.keys(trial.members).length : 0,
          trialSkillsRowCount: trialSkillsRows,
          trialSkillsMemberCount: trialSkillsMembers,
          captureHookInstalled: Boolean(window.__IGT_GUILD_CAPTURE_INSTALLED__),
          captureRawResponses: (capture.raw || []).length,
          captureHasGuildTrial: Boolean(capture.guild && capture.guild.trial),
          assignmentRowsCollected: assignments.length,
          assignmentsWithEndDate: withEndDate.length,
          guildUiVisible: guildUiVisible(),
          trialsTabActive: nav.trialsTabActive,
          trialsTabClickAttempted: nav.trialsTabClickAttempted,
          navigationMethod: nav.navigationMethod,
          domSkillHeadersFound: domProbe.skillHeaders,
          domMemberXpLinesFound: domProbe.memberXpLines,
          domHasRequiredExp: domProbe.hasRequiredExp,
          domAssignmentsCollected: domAssignments.length,
          captureNetworkUrlsSeen: (capture.urls || []).length,
        },
        trialMeta: trial
          ? {
              startDate: trial.startDate || null,
              endDate: trial.endDate || null,
              requiredExp: trial.requiredExp != null ? trial.requiredExp : null,
            }
          : null,
        assignments: assignments.slice(0, 40),
        samples: {
          captureUrls: captureUrls,
          recentNetworkUrls: recentNetworkUrls,
          trialMemberKeys:
            trial && trial.members ? Object.keys(trial.members).slice(0, 12) : [],
        },
      };

      setStatus(
        "Done! Returning to Guild Trials…",
        report.diagnostics.assignmentRowsCollected +
          " assignment row(s), " +
          report.diagnostics.assignmentsWithEndDate +
          " with endDate",
      );

      var sep = returnUrl.indexOf("?") >= 0 ? "&" : "?";
      var destination = returnUrl + sep + "trialProbe=" + encodeURIComponent(toBase64Url(report));
      await sleep(700);
      sessionStorage.removeItem("igt-trial-probe-run");
      returnToPlanner(destination);
    } catch (err) {
      setStatus("Probe failed", err && err.message ? err.message : String(err));
    }
  }

  run();
})();
