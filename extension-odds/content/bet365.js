/* global Tips3x3Odds */
(function () {
  "use strict";
  const BOOK = "bet365";
  let lastSent = "";
  let timer = null;

  Tips3x3Odds.injectPageHook("bet365");

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const msg = ev.data;
    if (!msg || msg.source !== "tips3x3-odds-hook" || msg.hookId !== "bet365") {
      return;
    }
    const extracted = Tips3x3Odds.extractFromJson(msg.payload?.data);
    if (extracted.length) void flush(extracted, "network");
  });

  function text(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function looksLikeTeam(name) {
    const n = String(name || "").trim();
    if (n.length < 2 || n.length > 48) return false;
    if (/^\d+([.:]\d+)?$/.test(n)) return false;
    if (/^(1|2|x|empate|draw|ao vivo|live|hoje|amanhã)$/i.test(n)) return false;
    if (/brasileir|série|serie|copa |liga |premier|championship|sudamericana|libertadores/i.test(n)) {
      return false;
    }
    return true;
  }

  /**
   * Bet365 costuma listar times numa coluna e odds 1/X/2 em colunas irmãs
   * (não dentro da mesma linha). Ordem das odds: todos os "1", depois "X", depois "2".
   */
  function scrapeColumnLayout() {
    const teamNodes = [
      ...document.querySelectorAll(
        ".rcl-ParticipantFixtureDetailsTeam_TeamName, " +
          "[class*='ParticipantFixtureDetailsTeam_TeamName'], " +
          "[class*='FixtureDetailsTeam_TeamName']",
      ),
    ];
    const teamNames = teamNodes.map(text).filter(looksLikeTeam);
    if (teamNames.length < 2) return [];

    const homes = [];
    const aways = [];
    for (let i = 0; i + 1 < teamNames.length; i += 2) {
      homes.push(teamNames[i]);
      aways.push(teamNames[i + 1]);
    }
    const n = homes.length;
    if (!n) return [];

    const oddNodes = [
      ...document.querySelectorAll(
        ".sgl-ParticipantOddsOnly80_Odds, " +
          "[class*='ParticipantOddsOnly'] [class*='Odds'], " +
          "[class*='ParticipantOddsOnly80_Odds'], " +
          ".gl-ParticipantOddsOnly_Odds",
      ),
    ];
    let odds = oddNodes.map((el) => Tips3x3Odds.parseOdd(text(el))).filter(Boolean);

    // fallback: mercado Resultado Final com botões curtos
    if (odds.length < n * 3) {
      const market = [...document.querySelectorAll("[class*='MarketGroup'], [class*='gl-Market']")].find(
        (el) => /resultado final|full time result|1x2|match result/i.test(text(el).slice(0, 80)),
      );
      if (market) {
        odds = [...market.querySelectorAll("[class*='Odds'], [class*='Participant']")]
          .map((el) => {
            const t = text(el);
            return t.length <= 8 ? Tips3x3Odds.parseOdd(t) : null;
          })
          .filter(Boolean);
      }
    }

    if (odds.length < n * 3) return [];

    // Layout clássico: [homes...][draws...][aways...]
    const homeOdds = odds.slice(0, n);
    const drawOdds = odds.slice(n, n * 2);
    const awayOdds = odds.slice(n * 2, n * 3);

    const events = [];
    for (let i = 0; i < n; i++) {
      const h = homeOdds[i];
      const d = drawOdds[i];
      const a = awayOdds[i];
      if (!(h > 1.01 && d > 1.01 && a > 1.01)) continue;
      events.push({
        home: homes[i],
        away: aways[i],
        homeOdds: h,
        drawOdds: d,
        awayOdds: a,
        url: location.href,
      });
    }
    return events;
  }

  function scrapeRowLayout() {
    const events = [];
    const rows = document.querySelectorAll(
      ".rcl-ParticipantFixtureDetails, .src-FixtureDetails, [class*='ParticipantFixtureDetails'], [class*='FixtureDetails']",
    );

    for (const row of rows) {
      const teams = [
        ...row.querySelectorAll(
          ".rcl-ParticipantFixtureDetailsTeam_TeamName, [class*='TeamName'], [class*='Team_'], div",
        ),
      ]
        .map(text)
        .filter(looksLikeTeam);
      const uniqTeams = [...new Set(teams)];
      if (uniqTeams.length < 2) continue;

      // odds na linha OU no próximo irmão (coluna de mercado)
      let scope = row.parentElement || row;
      const odds = [
        ...scope.querySelectorAll(
          ".sgl-ParticipantOddsOnly80_Odds, [class*='Odds'], [class*='ParticipantOdds']",
        ),
      ]
        .map((el) => Tips3x3Odds.parseOdd(text(el)))
        .filter(Boolean)
        .slice(0, 3);

      if (odds.length < 3) continue;

      events.push({
        home: uniqTeams[0],
        away: uniqTeams[1],
        homeOdds: odds[0],
        drawOdds: odds[1],
        awayOdds: odds[2],
        url: location.href,
      });
      if (events.length >= 40) break;
    }
    return events;
  }

  function scrapeOpenEvent() {
    const header = text(
      document.querySelector(
        ".sph-EventHeader_Label, .ipn-FixtureDetail_TeamNames, [class*='EventHeader'], h1",
      ),
    );
    const parts = header.split(/\s+v(?:s|\.)\s+/i);
    if (parts.length < 2) return [];

    const market =
      [...document.querySelectorAll("[class*='Market'], [class*='market']")].find((el) =>
        /resultado|full time|1x2|match result/i.test(text(el).slice(0, 120)),
      ) || document.body;

    const odds = [...market.querySelectorAll("[class*='Odds'], button, [role='button']")]
      .map((el) => {
        const t = text(el);
        return t.length <= 8 ? Tips3x3Odds.parseOdd(t) : null;
      })
      .filter(Boolean);
    const three = [...new Set(odds)].slice(0, 3);
    if (three.length < 3) return [];

    return [
      {
        home: parts[0].trim(),
        away: parts[1].trim(),
        homeOdds: three[0],
        drawOdds: three[1],
        awayOdds: three[2],
        url: location.href,
      },
    ];
  }

  function scrapeDom() {
    let events = scrapeColumnLayout();
    if (!events.length) events = scrapeRowLayout();
    if (!events.length) events = scrapeOpenEvent();
    return events;
  }

  async function flush(rawEvents, source) {
    const targetsRes = await Tips3x3Odds.getTargets();
    const targets = targetsRes.targets || [];
    const now = Date.now();
    const events = [];
    let matched = 0;

    for (const e of rawEvents) {
      if (!looksLikeTeam(e.home) || !looksLikeTeam(e.away)) continue;
      const hit = Tips3x3Odds.matchTarget(e.home, e.away, targets);
      let home = e.home;
      let away = e.away;
      let homeOdds = e.homeOdds;
      let awayOdds = e.awayOdds;
      let eventIdBolsa;
      let start;
      if (hit && hit.score >= 0.55) {
        matched += 1;
        home = hit.target.home;
        away = hit.target.away;
        eventIdBolsa = hit.target.eventId;
        start = hit.target.start;
        if (hit.flipped) {
          homeOdds = e.awayOdds;
          awayOdds = e.homeOdds;
        }
      }
      // Envia mesmo sem match: o servidor ainda tenta casar por nome
      events.push({
        home,
        away,
        homeOdds,
        drawOdds: e.drawOdds,
        awayOdds,
        url: e.url || location.href,
        externalId: e.externalId || "",
        start,
        eventIdBolsa,
        capturedAt: now,
      });
    }

    if (!events.length) {
      return { pushed: 0, matched: 0, scraped: rawEvents.length };
    }

    const sig = JSON.stringify(
      events.map((e) => [e.home, e.away, e.homeOdds, e.drawOdds, e.awayOdds]),
    );
    if (sig === lastSent) {
      return { pushed: 0, matched, scraped: rawEvents.length, skipped: "dup" };
    }
    lastSent = sig;
    const res = await Tips3x3Odds.pushOdds(BOOK, events);
    console.info("[tips3x3-odds:bet365]", source, {
      scraped: rawEvents.length,
      matched,
      pushed: events.length,
      res,
    });
    return {
      pushed: events.length,
      matched,
      scraped: rawEvents.length,
      res,
    };
  }

  async function tick() {
    try {
      const dom = scrapeDom();
      if (!dom.length) {
        return { found: 0, pushed: 0, matched: 0, hint: "DOM sem jogos 1X2 — abra Futebol → Próximos jogos / liga" };
      }
      const r = await flush(dom, "dom");
      return { found: dom.length, ...r };
    } catch (e) {
      console.warn("[tips3x3-odds:bet365]", e);
      return { found: 0, error: String(e) };
    }
  }

  window.__tips3x3ForceScrape = async () => {
    const r = await tick();
    return { bookmaker: BOOK, ...r, url: location.href };
  };

  timer = setInterval(tick, 8000);
  setTimeout(tick, 2000);

  const obs = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(tick, 1800);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
