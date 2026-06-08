/**
 * Page-context network hook for Ironwood guild API responses.
 * Inlined in Tampermonkey userscript at document-start; also loaded via script src.
 */
(function ironwoodGuildCapture() {
  if (window.__IGT_GUILD_CAPTURE_INSTALLED__) return;
  window.__IGT_GUILD_CAPTURE_INSTALLED__ = 1;

  var capture = { guild: null, raw: [], urls: [] };
  window.__IGT_GUILD_CAPTURE__ = capture;

  function absorb(data) {
    if (!data) return;
    var g = data;
    var trial = null;
    if (data.value && data.value.guild) {
      g = data.value.guild;
      trial = data.value.trial || null;
    } else if (data.guild) {
      g = data.guild;
      trial = data.trial || null;
    } else if (data.trial && !data.name && !data.id) {
      trial = data.trial;
      g = null;
    }
    if (!capture.guild) capture.guild = {};
    if (g && (g.name || g.id || g.members || g.trial)) {
      capture.guild = Object.assign({}, capture.guild, g);
    }
    if (trial) capture.guild.trial = trial;
    else if (g && g.trial) capture.guild.trial = g.trial;
  }

  function shouldCaptureUrl(url) {
    var u = String(url || "");
    if (/getGuild/i.test(u)) return true;
    if (/GuildTrial/i.test(u)) return true;
    if (/cloudfunctions\.net/i.test(u)) return true;
    if (/\/guild/i.test(u)) return true;
    return false;
  }

  function looksLikeTrialJson(text) {
    if (!text || text.length < 12) return false;
    return text.indexOf('"trial"') >= 0 && text.indexOf('"members"') >= 0;
  }

  function rememberUrl(url) {
    if (!url) return;
    capture.urls.push(String(url));
    if (capture.urls.length > 30) capture.urls.shift();
  }

  function inspect(text, url) {
    if (!text) return;
    if (!shouldCaptureUrl(url) && !looksLikeTrialJson(text)) return;
    try {
      var d = JSON.parse(text);
      capture.raw.push({ url: url || "", d: d });
      absorb(d);
    } catch (e) {
      /* ignore non-JSON */
    }
  }

  var oOpen = XMLHttpRequest.prototype.open;
  var oSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__igtUrl = String(u || "");
    return oOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var x = this;
    x.addEventListener("load", function () {
      rememberUrl(x.__igtUrl);
      inspect(x.responseText, x.__igtUrl);
    });
    x.addEventListener("readystatechange", function () {
      if (x.readyState === 4) {
        rememberUrl(x.__igtUrl);
        inspect(x.responseText, x.__igtUrl);
      }
    });
    return oSend.apply(this, arguments);
  };

  if (window.fetch) {
    var oFetch = window.fetch;
    window.fetch = function (input, init) {
      var u = typeof input === "string" ? input : (input && input.url) || "";
      rememberUrl(u);
      return oFetch.apply(this, arguments).then(function (res) {
        res
          .clone()
          .text()
          .then(function (t) {
            inspect(t, u);
          })
          .catch(function () {});
        return res;
      });
    };
  }
})();
