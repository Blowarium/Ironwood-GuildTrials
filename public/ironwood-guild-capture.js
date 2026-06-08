/**
 * Page-context network hook for Ironwood guild API responses.
 * Loaded via script src (avoids inline-script CSP issues).
 */
(function ironwoodGuildCapture() {
  if (window.__IGT_GUILD_CAPTURE_INSTALLED__) return;
  window.__IGT_GUILD_CAPTURE_INSTALLED__ = 1;

  var capture = { guild: null, raw: [] };
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

  function inspect(text, url) {
    try {
      var d = JSON.parse(text);
      capture.raw.push({ url: url || "", d: d });
      absorb(d);
    } catch (e) {
      /* ignore non-JSON */
    }
  }

  function shouldCapture(url) {
    return /(getGuild|GuildTrial|guildTrial|\/guild)/i.test(url || "");
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
      if (shouldCapture(x.__igtUrl)) inspect(x.responseText, x.__igtUrl);
    });
    return oSend.apply(this, arguments);
  };

  if (window.fetch) {
    var oFetch = window.fetch;
    window.fetch = function (input, init) {
      var u = typeof input === "string" ? input : (input && input.url) || "";
      return oFetch.apply(this, arguments).then(function (res) {
        if (shouldCapture(u)) {
          res
            .clone()
            .text()
            .then(function (t) {
              inspect(t, u);
            })
            .catch(function () {});
        }
        return res;
      });
    };
  }
})();
