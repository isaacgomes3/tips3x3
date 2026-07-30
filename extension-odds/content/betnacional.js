/* global Tips3x3Odds */
(function () {
  "use strict";
  const BOOK = "betnacional";
  let lastSent = "";
  let timer = null;

  Tips3x3Odds.injectPageHook("betnacional");

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const msg = ev.data;
    if (!msg || msg.source !== "tips3x3-odds-hook" || msg.hookId !== "betnacional") {
      return;
    }
    const extracted = Tips3x3Odds.extractFromJson(msg.payload?.data);
    if (extracted.length) void flush(extracted, "network");
  });

  function scrapeDom() {
    const events = [];

    const cards = document.querySelectorAll(
      "[class*='event'], [class*='Event'], [data-event-id], [data-testid*='event'], article, li, tr",
    );
    for (const card of cards) {
      const text = (card.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length < 12 || text.length > 400) continue;
      if (!/\d+[.,]\d{2}/.test(text)) continue;

      const nameEls = card.querySelectorAll(
        "[class*='participant'], [class*='team'], [class*='competitor'], [class*='name'], span, a, p",
      );
      const names = [...nameEls]
        .map((el) => (el.textContent || "").trim())
        .filter(
          (n) =>
            n.length > 2 &&
            n.length < 48 &&
            !/^\d/.test(n) &&
            !/odd|aposta|mercado|hoje|live|ao vivo/i.test(n),
        );
      const uniq = [...new Set(names)];
      if (uniq.length < 2) continue;

      const oddEls = card.querySelectorAll(
        "[class*='odd'], [class*='Odd'], [data-odds], button, [role='button'], span",
      );
      const odds = [];
      for (const el of oddEls) {
        const raw = el.getAttribute("data-odds") || el.textContent;
        // só textos curtos (botão de odd)
        if (String(raw || "").trim().length > 8) continue;
        const o = Tips3x3Odds.parseOdd(raw);
        if (o) odds.push(o);
      }
      const uniqOdds = [...new Set(odds)].filter((o) => o > 1.01 && o < 101);
      if (uniqOdds.length < 3) continue;

      events.push({
        home: uniq[0],
        away: uniq[1],
        homeOdds: uniqOdds[0],
        drawOdds: uniqOdds[1],
        awayOdds: uniqOdds[2],
        url: location.href,
        externalId: card.getAttribute("data-event-id") || "",
      });
      if (events.length >= 40) break;
    }

    if (!events.length) {
      const title =
        document.querySelector("h1, h2, [class*='event-name'], [class*='EventName']")
          ?.textContent || "";
      const parts = title.split(/\s+v(?:s|\.)\s+|\s+[–—-]\s+/i);
      const oddNodes = [...document.querySelectorAll("button, [class*='odd'], span")]
        .map((el) => {
          const t = (el.textContent || "").trim();
          return t.length <= 8 ? Tips3x3Odds.parseOdd(t) : null;
        })
        .filter(Boolean);
      const three = [...new Set(oddNodes)].slice(0, 3);
      if (parts.length >= 2 && three.length >= 3) {
        events.push({
          home: parts[0].trim(),
          away: parts[1].trim(),
          homeOdds: three[0],
          drawOdds: three[1],
          awayOdds: three[2],
          url: location.href,
        });
      }
    }

    return events;
  }

  function looksLikeTeam(name) {
    const n = String(name || "").trim();
    if (n.length < 3 || n.length > 42) return false;
    if (/\d{2,}/.test(n)) return false;
    if (/brasileir|série|serie|copa |liga |championship|premier|sudamericana|libertadores|hoje|amanhã|ao vivo|live|odds|mercado/i.test(n)) {
      return false;
    }
    return true;
  }

  async function flush(rawEvents, source) {
    const targetsRes = await Tips3x3Odds.getTargets();
    const targets = targetsRes.targets || [];
    const now = Date.now();
    const events = [];

    for (const e of rawEvents) {
      if (!looksLikeTeam(e.home) || !looksLikeTeam(e.away)) continue;
      const hit = Tips3x3Odds.matchTarget(e.home, e.away, targets);
      // Só envia se casar com jogo da Bolsa — evita lixo do DOM
      if (!hit || hit.score < 0.62) continue;
      let home = hit.target.home;
      let away = hit.target.away;
      let homeOdds = e.homeOdds;
      let awayOdds = e.awayOdds;
      if (hit.flipped) {
        homeOdds = e.awayOdds;
        awayOdds = e.homeOdds;
      }
      events.push({
        home,
        away,
        homeOdds,
        drawOdds: e.drawOdds,
        awayOdds,
        url: e.url || location.href,
        externalId: e.externalId || "",
        start: hit.target.start,
        eventIdBolsa: hit.target.eventId,
        capturedAt: now,
      });
    }

    if (!events.length) return;
    const sig = JSON.stringify(
      events.map((e) => [e.home, e.away, e.homeOdds, e.drawOdds, e.awayOdds]),
    );
    if (sig === lastSent) return;
    lastSent = sig;
    const res = await Tips3x3Odds.pushOdds(BOOK, events);
    console.debug("[tips3x3-odds:betnacional]", source, res);
  }

  async function tick() {
    try {
      const dom = scrapeDom();
      if (dom.length) {
        await flush(dom, "dom");
        return { found: dom.length };
      }
      return { found: 0 };
    } catch (e) {
      console.warn("[tips3x3-odds:betnacional]", e);
      return { found: 0, error: String(e) };
    }
  }

  window.__tips3x3ForceScrape = async () => {
    const r = await tick();
    return { bookmaker: BOOK, ...r, url: location.href };
  };

  timer = setInterval(tick, 8000);
  setTimeout(tick, 1500);

  const obs = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(tick, 1500);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
