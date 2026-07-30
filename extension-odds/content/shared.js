/* global chrome */
(function () {
  "use strict";

  function parseOdd(text) {
    if (text == null) return null;
    const s = String(text)
      .replace(",", ".")
      .replace(/[^\d.]/g, "");
    const n = Number(s);
    return Number.isFinite(n) && n > 1.01 && n < 1001 ? n : null;
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function teamScore(a, b) {
    const na = norm(a);
    const nb = norm(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.92;
    const ta = na.split(" ").filter((t) => t.length >= 3);
    const tb = nb.split(" ").filter((t) => t.length >= 3);
    if (!ta.length || !tb.length) return 0;
    let hit = 0;
    for (const t of ta) {
      if (tb.some((u) => u === t || u.includes(t) || t.includes(u))) hit += 1;
    }
    return hit / Math.max(ta.length, tb.length);
  }

  function matchTarget(home, away, targets) {
    let best = null;
    for (const t of targets || []) {
      const direct = (teamScore(home, t.home) + teamScore(away, t.away)) / 2;
      const flip = (teamScore(home, t.away) + teamScore(away, t.home)) / 2;
      const score = Math.max(direct, flip);
      const flipped = flip > direct;
      if (score >= 0.62 && (!best || score > best.score)) {
        best = { target: t, score, flipped };
      }
    }
    return best;
  }

  function pushOdds(bookmaker, events) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "TIPS3X3_PUSH_ODDS", bookmaker, events },
        (res) => resolve(res || { ok: false, error: "sem resposta" }),
      );
    });
  }

  function getTargets() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "TIPS3X3_GET_TARGETS" }, (res) => {
        resolve(res || { ok: false, targets: [] });
      });
    });
  }

  function injectPageHook(hookId) {
    if (document.documentElement.dataset[hookId]) return;
    document.documentElement.dataset[hookId] = "1";
    const script = document.createElement("script");
    script.textContent = `
      (function(){
        const HOOK_ID = ${JSON.stringify(hookId)};
        function emit(payload){
          window.postMessage({ source: 'tips3x3-odds-hook', hookId: HOOK_ID, payload }, '*');
        }
        function tryParse(url, text){
          if (!text || text.length < 20 || text.length > 2500000) return;
          if (!/[\\[{]/.test(text[0] || '')) return;
          try {
            const data = JSON.parse(text);
            emit({ url: String(url||''), data });
          } catch (_) {}
        }
        const ofetch = window.fetch;
        if (ofetch) {
          window.fetch = async function(){
            const res = await ofetch.apply(this, arguments);
            try {
              const clone = res.clone();
              const url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url);
              clone.text().then((t) => tryParse(url, t)).catch(()=>{});
            } catch (_) {}
            return res;
          };
        }
        const open = XMLHttpRequest.prototype.open;
        const send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url){
          this.__tips3x3Url = url;
          return open.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function(){
          this.addEventListener('load', function(){
            tryParse(this.__tips3x3Url, this.responseText);
          });
          return send.apply(this, arguments);
        };
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  function walkOddsObjects(node, out, depth = 0) {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walkOddsObjects(item, out, depth + 1);
      return;
    }
    if (typeof node !== "object") return;

    const homeName =
      node.home ||
      node.homeName ||
      node.home_team ||
      node.participant1 ||
      node.team1 ||
      node.Home ||
      "";
    const awayName =
      node.away ||
      node.awayName ||
      node.away_team ||
      node.participant2 ||
      node.team2 ||
      node.Away ||
      "";

    const o1 =
      parseOdd(node.homeOdds ?? node.oddsHome ?? node.o1 ?? node["1"] ?? node.HomeOdds) ??
      parseOdd(node?.markets?.ml?.home) ??
      parseOdd(node?.odds?.home);
    const ox =
      parseOdd(node.drawOdds ?? node.oddsDraw ?? node.ox ?? node.X ?? node.DrawOdds) ??
      parseOdd(node?.markets?.ml?.draw) ??
      parseOdd(node?.odds?.draw);
    const o2 =
      parseOdd(node.awayOdds ?? node.oddsAway ?? node.o2 ?? node["2"] ?? node.AwayOdds) ??
      parseOdd(node?.markets?.ml?.away) ??
      parseOdd(node?.odds?.away);

    // Estrutura tipo outcomes: [{name,price},...]
    let fromOutcomes = null;
    const outcomes = node.outcomes || node.runners || node.selections;
    if (Array.isArray(outcomes) && outcomes.length >= 3) {
      const prices = outcomes
        .map((x) => ({
          name: String(x.name || x.label || x.selectionName || ""),
          price: parseOdd(x.price ?? x.odds ?? x.decimalOdds ?? x.value),
        }))
        .filter((x) => x.price);
      const draw = prices.find((p) => /draw|empate|^x$/i.test(p.name));
      const rest = prices.filter((p) => p !== draw);
      if (draw && rest.length >= 2) {
        fromOutcomes = {
          home: rest[0].name,
          away: rest[1].name,
          homeOdds: rest[0].price,
          drawOdds: draw.price,
          awayOdds: rest[1].price,
        };
      }
    }

    if (
      homeName &&
      awayName &&
      o1 &&
      ox &&
      o2 &&
      String(homeName).length > 1 &&
      String(awayName).length > 1
    ) {
      out.push({
        home: String(homeName),
        away: String(awayName),
        homeOdds: o1,
        drawOdds: ox,
        awayOdds: o2,
        externalId: String(node.id || node.eventId || node.fixtureId || ""),
      });
    } else if (fromOutcomes) {
      out.push({
        ...fromOutcomes,
        externalId: String(node.id || node.eventId || ""),
      });
    }

    for (const v of Object.values(node)) {
      if (v && typeof v === "object") walkOddsObjects(v, out, depth + 1);
    }
  }

  function extractFromJson(data) {
    const out = [];
    walkOddsObjects(data, out);
    // dedupe
    const map = new Map();
    for (const e of out) {
      const k = `${norm(e.home)}|${norm(e.away)}|${e.homeOdds}|${e.drawOdds}|${e.awayOdds}`;
      map.set(k, e);
    }
    return [...map.values()];
  }

  window.Tips3x3Odds = {
    parseOdd,
    norm,
    matchTarget,
    pushOdds,
    getTargets,
    injectPageHook,
    extractFromJson,
  };

  // Permite o popup/background pedir captura imediata
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "TIPS3X3_FORCE_SCRAPE") return false;
    void (async () => {
      try {
        if (typeof window.__tips3x3ForceScrape === "function") {
          const result = await window.__tips3x3ForceScrape();
          sendResponse({ ok: true, ...result });
        } else {
          sendResponse({ ok: false, error: "scraper não pronto nesta página" });
        }
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return true;
  });
})();
