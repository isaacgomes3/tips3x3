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
  const home = runners[0];
  const draw = runners.find((r) => /draw|empate|x/i.test(r.name)) ?? runners[1];
  const away = runners[runners.length - 1];

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

export function splitTeams(eventName: string): { home: string; away: string } {
  const parts = eventName.split(/\s+vs\s+/i);
  if (parts.length >= 2) {
    return { home: parts[0].trim(), away: parts.slice(1).join(" vs ").trim() };
  }
  return { home: eventName, away: "" };
}
