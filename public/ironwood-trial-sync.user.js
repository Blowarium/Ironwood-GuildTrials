// ==UserScript==
// @name         Ironwood Guild Trials — Trial Sync
// @namespace    ironwood-guild-trials
// @version      1.3.0
// @description  Auto-runs guild trial sync when opened from the trials planner (one-time install).
// @match        https://ironwoodrpg.com/*
// @match        https://www.ironwoodrpg.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function ironwoodGuildTrialsSyncHelper() {
  "use strict";

  var SYNC_RUN_KEY = "igt-trial-sync-run";
  var SYNC_RETURN_KEY = "igt-trial-sync-return";
  var SCRIPT_VERSION = "1.3.0";

  function installCaptureInline() {
    var code =
      "(function(){if(window.__IGT_GUILD_CAPTURE_INSTALLED__)return;" +
      "window.__IGT_GUILD_CAPTURE_INSTALLED__=1;" +
      "var capture={guild:null,raw:[]};" +
      "window.__IGT_GUILD_CAPTURE__=capture;" +
      "function absorb(data){if(!data)return;" +
      "var g=data,trial=null;" +
      "if(data.value&&data.value.guild){g=data.value.guild;trial=data.value.trial||null;}" +
      "else if(data.guild){g=data.guild;trial=data.trial||null;}" +
      "else if(data.trial&&!data.name&&!data.id){trial=data.trial;g=null;}" +
      "if(!capture.guild)capture.guild={};" +
      "if(g&&(g.name||g.id||g.members||g.trial)){capture.guild=Object.assign({},capture.guild,g);}" +
      "if(trial){capture.guild.trial=trial;}" +
      "else if(g&&g.trial){capture.guild.trial=g.trial;}" +
      "}" +
      "function inspect(text,url){try{var d=JSON.parse(text);capture.raw.push({url:url||'',d:d});absorb(d);}catch(e){}}" +
      "var oOpen=XMLHttpRequest.prototype.open;var oSend=XMLHttpRequest.prototype.send;" +
      "XMLHttpRequest.prototype.open=function(m,u){this.__igtUrl=String(u||'');return oOpen.apply(this,arguments);};" +
      "XMLHttpRequest.prototype.send=function(){var x=this;" +
      "x.addEventListener('load',function(){var u=x.__igtUrl||'';if(/getGuild/i.test(u))inspect(x.responseText,u);});" +
      "return oSend.apply(this,arguments);};" +
      "if(window.fetch){var oFetch=window.fetch;" +
      "window.fetch=function(input,init){var u=typeof input==='string'?input:(input&&input.url)||'';" +
      "return oFetch.apply(this,arguments).then(function(res){if(/getGuild/i.test(u)){res.clone().text().then(function(t){inspect(t,u);}).catch(function(){});}return res;});};}" +
      "})();";
    var el = document.createElement("script");
    el.textContent = code;
    (document.head || document.documentElement).appendChild(el);
    el.remove();
  }

  installCaptureInline();

  var params = new URLSearchParams(location.search);
  var resuming = sessionStorage.getItem(SYNC_RUN_KEY) === "1";
  if (params.get("igtTrialSync") !== "1" && !resuming) return;

  var returnUrl = params.get("igtReturn");
  if (!returnUrl && resuming) {
    returnUrl = sessionStorage.getItem(SYNC_RETURN_KEY);
  }
  if (!returnUrl) return;

  var appOrigin;
  try {
    appOrigin = new URL(returnUrl).origin;
  } catch (e) {
    return;
  }

  function notifyPlannerHelperActive() {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: "igt-trial-sync-helper-active", v: 1 }, appOrigin);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function startSync() {
    if (document.getElementById("igt-trial-sync-overlay")) return;
    notifyPlannerHelperActive();
    if (!document.body) {
      setTimeout(startSync, 100);
      return;
    }
    var script = document.createElement("script");
    script.src =
      appOrigin +
      "/ironwood-trial-sync.js?v=" +
      SCRIPT_VERSION +
      "&return=" +
      encodeURIComponent(returnUrl);
    document.body.appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startSync);
  } else {
    startSync();
  }
})();
