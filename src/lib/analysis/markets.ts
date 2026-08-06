import type { BetBraEvent, BetBraMarket, BetBraPrice, BetBraRunner } from "../betbra/types";

export function findMarket(
  event: BetBraEvent,
  nameOriginal: string,
): BetBraMarket | undefined {
  return event.markets?.find(
    (m) =>
      (m["name-original"] ?? m.name)?.toLowerCase() === nameOriginal.toLowerCase(),
  );
}

export function findRunner(
  market: BetBraMarket | undefined,
  runnerName: string,
): BetBraRunner | undefined {
  return market?.runners?.find(
    (r) => r.name.trim().toLowerCase() === runnerName.toLowerCase(),
  );
}

export function bestPrice(
  prices: BetBraPrice[] | undefined,
  side: "back" | "lay",
): BetBraPrice | undefined {
  const sidePrices = (prices ?? []).filter((p) => p.side === side);
  if (!sidePrices.length) return undefined;

  if (side === "lay") {
    return sidePrices.reduce((best, p) =>
      (p.odds ?? Infinity) < (best.odds ?? Infinity) ? p : best,
    );
  }

  return sidePrices.reduce((best, p) =>
    (p.odds ?? 0) > (best.odds ?? 0) ? p : best,
  );
}

/** Runner QOV no Correct Score (ANY OTHER HOME/AWAY WIN). */
export function extractQovMarket(
  event: BetBraEvent,
  side: "home" | "away",
) {
  const market = findMarket(event, "Correct Score");
  const patterns =
    side === "home"
      ? [/any\s*other\s*home/i, /qov\s*casa/i, /outra.*casa/i]
      : [/any\s*other\s*away/i, /qov\s*fora/i, /outra.*fora/i];
  const runner = market?.runners?.find((r) =>
    patterns.some((re) => re.test(r.name)),
  );
  const lay = bestPrice(runner?.prices, "lay");
  const back = bestPrice(runner?.prices, "back");

  return {
    market,
    runner,
    side,
    selection:
      side === "home"
        ? ("any-other-home" as const)
        : ("any-other-away" as const),
    lay,
    back,
    layOdds: lay?.odds ?? null,
    backOdds:
      back?.odds ?? runner?.["last-matched-odds"] ?? null,
    quotes: {
      back: {
        odds: back?.odds ?? runner?.["last-matched-odds"] ?? null,
        amount: back?.["available-amount"] ?? 0,
      },
      lay: {
        odds: lay?.odds ?? null,
        amount: lay?.["available-amount"] ?? 0,
      },
      lastMatched: runner?.["last-matched-odds"] ?? null,
    },
    layLiquidity: lay?.["available-amount"] ?? 0,
    backLiquidity: back?.["available-amount"] ?? 0,
    volume: runner?.volume ?? 0,
    marketId: market?.id,
    runnerId: runner?.id,
  };
}

export function extractLay3x3(event: BetBraEvent) {
  const market = findMarket(event, "Correct Score");
  const runner = findRunner(market, "3-3");
  const lay = bestPrice(runner?.prices, "lay");
  const back = bestPrice(runner?.prices, "back");

  // Referência de trade: book lay real; sem book, last-matched (não misturar no UI de cotações)
  const referenceOdds = lay?.odds ?? runner?.["last-matched-odds"] ?? null;

  return {
    market,
    runner,
    lay,
    back,
    referenceOdds,
    quotes: {
      back: {
        odds: back?.odds ?? null,
        amount: back?.["available-amount"] ?? 0,
      },
      lay: {
        odds: lay?.odds ?? null,
        amount: lay?.["available-amount"] ?? 0,
      },
      lastMatched: runner?.["last-matched-odds"] ?? null,
    },
    source: lay
      ? ("lay" as const)
      : runner?.["last-matched-odds"]
        ? ("last-matched" as const)
        : back
          ? ("back" as const)
          : ("none" as const),
    liquidity: lay?.["available-amount"] ?? 0,
    volume: runner?.volume ?? 0,
  };
}

export function extractMatchOdds(event: BetBraEvent) {
  const market = findMarket(event, "Match Odds");
  const runners = market?.runners ?? [];
  const draw =
    runners.find((r) => /^(draw|empate|the draw)$/i.test(r.name.trim())) ??
    runners.find((r) => /draw|empate/i.test(r.name));

  // Não usar runners[last]: em vários books o Empate vem por último e
  // "away" acabava igual ao draw (edges/surebets falsos na comparação).
  const nonDraw = runners.filter((r) => r !== draw);
  const home = nonDraw[0] ?? runners[0];
  const away =
    nonDraw.find((r) => r !== home) ??
    runners.find((r) => r !== home && r !== draw) ??
    nonDraw[1];

  return {
    market,
    home: {
      name: home?.name,
      back: bestPrice(home?.prices, "back")?.odds ?? home?.["last-matched-odds"],
      lay: bestPrice(home?.prices, "lay")?.odds,
    },
    draw: {
      name: draw?.name,
      back: bestPrice(draw?.prices, "back")?.odds ?? draw?.["last-matched-odds"],
      lay: bestPrice(draw?.prices, "lay")?.odds,
    },
    away: {
      name: away?.name,
      back: bestPrice(away?.prices, "back")?.odds ?? away?.["last-matched-odds"],
      lay: bestPrice(away?.prices, "lay")?.odds,
    },
  };
}

export function extractBttsYes(event: BetBraEvent) {
  const market = findMarket(event, "Both Teams To Score");
  const yes = findRunner(market, "Yes") ?? findRunner(market, "Sim");
  return bestPrice(yes?.prices, "back")?.odds ?? yes?.["last-matched-odds"] ?? null;
}

export function extractOver25(event: BetBraEvent) {
  return extractOverMarket(event, 2.5).backOdds;
}

/** Mercado Total Over {line} com book back/lay (base Lay over limite). */
export function extractOverMarket(event: BetBraEvent, line = 2.5) {
  const lineRe = String(line).replace(".", "\\.");
  const nameRe = new RegExp(`over\\s*${lineRe}|mais\\s*de\\s*${lineRe}`, "i");
  const totals = (event.markets ?? []).filter(
    (m) => (m["name-original"] ?? m.name) === "Total",
  );

  for (const market of totals) {
    const runner = market.runners?.find((r) => nameRe.test(r.name));
    if (!runner) continue;
    const lay = bestPrice(runner.prices, "lay");
    const back = bestPrice(runner.prices, "back");
    return {
      line,
      market,
      runner,
      lay,
      back,
      layOdds: lay?.odds ?? null,
      backOdds:
        back?.odds ??
        runner["last-matched-odds"] ??
        null,
      quotes: {
        back: {
          odds: back?.odds ?? runner["last-matched-odds"] ?? null,
          amount: back?.["available-amount"] ?? 0,
        },
        lay: {
          odds: lay?.odds ?? null,
          amount: lay?.["available-amount"] ?? 0,
        },
        lastMatched: runner["last-matched-odds"] ?? null,
      },
      liquidity: lay?.["available-amount"] ?? 0,
      volume: runner.volume ?? 0,
      marketId: market.id,
      runnerId: runner.id,
    };
  }

  return {
    line,
    market: undefined,
    runner: undefined,
    lay: undefined,
    back: undefined,
    layOdds: null as number | null,
    backOdds: null as number | null,
    quotes: {
      back: { odds: null as number | null, amount: 0 },
      lay: { odds: null as number | null, amount: 0 },
      lastMatched: null as number | null,
    },
    liquidity: 0,
    volume: 0,
    marketId: undefined as string | undefined,
    runnerId: undefined as string | undefined,
  };
}

/**
 * Extrai o runner 1-1 do mercado Correct Score para a estratégia Lay 1x1.
 */
export function extractLay1x1Market(event: BetBraEvent) {
  const market = findMarket(event, "Correct Score");
  // Aceita "1-1", "1 - 1", "1–1"
  const runner = market?.runners?.find((r) =>
    /^1\s*[-–—]\s*1$/.test(r.name.trim()),
  );
  const lay = bestPrice(runner?.prices, "lay");
  const back = bestPrice(runner?.prices, "back");

  return {
    market,
    runner,
    lay,
    back,
    layOdds: lay?.odds ?? null,
    backOdds: back?.odds ?? runner?.["last-matched-odds"] ?? null,
    layLiquidity: lay?.["available-amount"] ?? 0,
    backLiquidity: back?.["available-amount"] ?? 0,
    volume: runner?.volume ?? 0,
    marketId: market?.id,
    runnerId: runner?.id,
  };
}

export function splitTeams(eventName: string): { home: string; away: string } {
  const parts = eventName.split(/\s+vs\s+/i);
  if (parts.length >= 2) {
    return { home: parts[0].trim(), away: parts.slice(1).join(" vs ").trim() };
  }
  return { home: eventName, away: "" };
}

/** Placar exato "H-A" / "H–A" — ignora ANY OTHER / QOV / texto. */
export function parseCorrectScoreLabel(
  name: string,
): { home: number; away: number; label: string } | null {
  const m = name.trim().match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (!m) return null;
  const home = Number(m[1]);
  const away = Number(m[2]);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away, label: `${home}-${away}` };
}

/**
 * Varre Correct Score por runners com melhor lay ≥ minLay.
 * Ordena lay desc (mais raro primeiro).
 */
export function listHighLayCorrectScores(event: BetBraEvent, minLay = 100) {
  const market = findMarket(event, "Correct Score");
  const out: Array<{
    label: string;
    home: number;
    away: number;
    marketId?: string;
    runnerId?: string;
    layOdds: number;
    backOdds: number | null;
    layLiquidity: number;
    backLiquidity: number;
    volume: number;
  }> = [];

  for (const runner of market?.runners ?? []) {
    const parsed = parseCorrectScoreLabel(runner.name);
    if (!parsed) continue;
    const lay = bestPrice(runner.prices, "lay");
    const back = bestPrice(runner.prices, "back");
    const layOdds = lay?.odds;
    if (layOdds == null || !(layOdds >= minLay)) continue;

    out.push({
      label: parsed.label,
      home: parsed.home,
      away: parsed.away,
      marketId: market?.id,
      runnerId: runner.id,
      layOdds,
      backOdds: back?.odds ?? runner["last-matched-odds"] ?? null,
      layLiquidity: lay?.["available-amount"] ?? 0,
      backLiquidity: back?.["available-amount"] ?? 0,
      volume: runner.volume ?? 0,
    });
  }

  out.sort((a, b) => b.layOdds - a.layOdds);
  return { market, candidates: out };
}
