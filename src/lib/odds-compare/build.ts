import { listSoccerEvents, mexchangeEventUrl } from "@/lib/betbra/client";
import type { BetBraEvent } from "@/lib/betbra/types";
import { extractMatchOdds, splitTeams } from "@/lib/analysis/markets";
import {
  fetchSportH2hOdds,
  getOddsApiKey,
  listSportEvents,
  resolveSoccerKeysToScan,
} from "@/lib/odds-api/client";
import type { OddsApiEventOdds } from "@/lib/odds-api/types";
import {
  fetchMultiOdds,
  getOddsApiIoKey,
  listFootballEvents,
  resolveBookmakers,
} from "@/lib/odds-api-io/client";
import type { OddsIoEventOdds } from "@/lib/odds-api-io/types";
import {
  hasFreshExtOdds,
  listAllExtOdds,
  type ExtOddsEvent,
} from "@/lib/ext-odds-store";
import { kickoffClose, pairSimilarity } from "./match-teams";

export type SideQuotes = {
  back: number | null;
  lay: number | null;
};

export type BookSide = {
  bookmaker: string;
  bookmakerKey: string;
  odds: number;
};

export type BestBooks = {
  home: BookSide | null;
  draw: BookSide | null;
  away: BookSide | null;
  bookCount: number;
};

export type SelectionCompare = {
  selection: "home" | "draw" | "away";
  label: string;
  bolsa: SideQuotes;
  bestBook: BookSide | null;
  /** bestBook.odds - bolsa.back (positivo = casa paga mais que o back da Bolsa) */
  edgeVsBack: number | null;
  /** bestBook.odds - bolsa.lay (positivo = possível hedge lay bolsa) */
  edgeVsLay: number | null;
};

export type OddsCompareRow = {
  eventId: string;
  home: string;
  away: string;
  start: string;
  competition?: string;
  mexchangeUrl: string;
  matched: boolean;
  matchScore: number;
  oddsApiEventId?: string;
  sportKey?: string;
  sportTitle?: string;
  bookCount: number;
  selections: SelectionCompare[];
  bestEdgeVsBack: number | null;
};

export type OddsCompareProvider =
  | "extension"
  | "odds-api.io"
  | "the-odds-api"
  | "mixed";

export type OddsComparePayload = {
  generatedAt: string;
  configured: boolean;
  provider: OddsCompareProvider | null;
  message?: string;
  creditsRemaining: number | null;
  creditsUsed: number | null;
  sportsScanned: string[];
  bookmakers: string[];
  bolsaEvents: number;
  matchedCount: number;
  rows: OddsCompareRow[];
  extOddsCount?: number;
};

function competitionName(event: BetBraEvent): string | undefined {
  const tags = event["meta-tags"] ?? [];
  const comp =
    tags.find((t) => /competition|tournament|league|liga/i.test(t.type ?? "")) ??
    tags.find((t) => t.type === "Competition") ??
    tags[0];
  return comp?.name;
}

function teamNames(event: BetBraEvent): { home: string; away: string } {
  const participants = event["event-participants"] ?? [];
  const homeP =
    participants.find((p) => Number(p.number) === 1) ?? participants[0];
  const awayP =
    participants.find((p) => Number(p.number) === 2) ?? participants[1];
  const split = splitTeams(event.name);
  return {
    home:
      homeP?.["participant-name"] ?? homeP?.name ?? split.home ?? event.name,
    away: awayP?.["participant-name"] ?? awayP?.name ?? split.away ?? "",
  };
}

function parsePrice(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 1 ? n : null;
}

function considerBook(
  price: number | null,
  bookmaker: string,
  current: BookSide | null,
): BookSide | null {
  if (price == null) return current;
  if (!current || price > current.odds) {
    return { bookmaker, bookmakerKey: bookmaker, odds: price };
  }
  return current;
}

function edge(a: number | null, b: number | null): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }
  return Math.round((a - b) * 1000) / 1000;
}

function buildSelections(
  homeLabel: string,
  awayLabel: string,
  bolsa: ReturnType<typeof extractMatchOdds>,
  books: BestBooks,
): SelectionCompare[] {
  const mk = (
    selection: "home" | "draw" | "away",
    label: string,
    side: SideQuotes,
    best: BookSide | null,
  ): SelectionCompare => ({
    selection,
    label,
    bolsa: side,
    bestBook: best,
    edgeVsBack: edge(best?.odds ?? null, side.back),
    edgeVsLay: edge(best?.odds ?? null, side.lay),
  });

  return [
    mk(
      "home",
      homeLabel,
      { back: bolsa.home.back ?? null, lay: bolsa.home.lay ?? null },
      books.home,
    ),
    mk(
      "draw",
      "Empate",
      { back: bolsa.draw.back ?? null, lay: bolsa.draw.lay ?? null },
      books.draw,
    ),
    mk(
      "away",
      awayLabel,
      { back: bolsa.away.back ?? null, lay: bolsa.away.lay ?? null },
      books.away,
    ),
  ];
}

function emptyBooks(): BestBooks {
  return { home: null, draw: null, away: null, bookCount: 0 };
}

/** Odd da casa absurda vs Bolsa (ex.: 81 vs back 1.01) → descarta. */
function oddsPlausibleVsBolsa(
  bookOdds: number | null | undefined,
  bolsaBack: number | null | undefined,
): boolean {
  if (bookOdds == null || !(bookOdds > 1.01)) return false;
  if (bolsaBack == null || !(bolsaBack > 1.01)) return true;
  const ratio = bookOdds / bolsaBack;
  // permite edge realista; corta scrape/API cruzada
  return ratio >= 0.35 && ratio <= 2.8;
}

function sanitizeRow(row: OddsCompareRow): OddsCompareRow {
  const selections = row.selections.map((sel) => {
    const ok = oddsPlausibleVsBolsa(sel.bestBook?.odds, sel.bolsa.back);
    if (ok) return sel;
    return {
      ...sel,
      bestBook: null,
      edgeVsBack: null,
      edgeVsLay: null,
    };
  });
  const bookCount = new Set(
    selections
      .map((s) => s.bestBook?.bookmaker)
      .filter((n): n is string => Boolean(n)),
  ).size;
  const edges = selections
    .map((s) => s.edgeVsBack)
    .filter((n): n is number => n != null);
  return {
    ...row,
    selections,
    bookCount,
    matched: bookCount > 0,
    bestEdgeVsBack: edges.length ? Math.max(...edges) : null,
  };
}

function sanitizeRows(rows: OddsCompareRow[]): OddsCompareRow[] {
  return rows.map(sanitizeRow);
}

function dedupeRows(rows: OddsCompareRow[]): OddsCompareRow[] {
  const map = new Map<string, OddsCompareRow>();
  for (const r of rows) {
    const prev = map.get(r.eventId);
    if (!prev || (r.matched && !prev.matched) || r.bookCount > prev.bookCount) {
      map.set(r.eventId, r);
    }
  }
  const out = [...map.values()];
  sortRows(out);
  return out;
}

function bookLabel(bm: ExtOddsEvent["bookmaker"]) {
  return bm === "bet365" ? "Bet365" : "Betnacional";
}

function betterSide(a: BookSide | null, b: BookSide | null): BookSide | null {
  if (!a) return b;
  if (!b) return a;
  return b.odds > a.odds ? b : a;
}

function mergeBestBooks(a: BestBooks, b: BestBooks): BestBooks {
  const home = betterSide(a.home, b.home);
  const draw = betterSide(a.draw, b.draw);
  const away = betterSide(a.away, b.away);
  const names = new Set(
    [home, draw, away]
      .map((s) => s?.bookmaker)
      .filter((n): n is string => Boolean(n)),
  );
  return {
    home,
    draw,
    away,
    bookCount: Math.max(a.bookCount, b.bookCount, names.size),
  };
}

function booksFromExtEvents(
  matched: Array<{ ev: ExtOddsEvent; flipped: boolean }>,
): BestBooks {
  let books = emptyBooks();
  const seen = new Set<string>();
  for (const { ev, flipped } of matched) {
    seen.add(ev.bookmaker);
    const homeOdds = flipped ? ev.awayOdds : ev.homeOdds;
    const awayOdds = flipped ? ev.homeOdds : ev.awayOdds;
    const label = bookLabel(ev.bookmaker);
    books = mergeBestBooks(books, {
      home: { bookmaker: label, bookmakerKey: ev.bookmaker, odds: homeOdds },
      draw: {
        bookmaker: label,
        bookmakerKey: ev.bookmaker,
        odds: ev.drawOdds,
      },
      away: { bookmaker: label, bookmakerKey: ev.bookmaker, odds: awayOdds },
      bookCount: 1,
    });
  }
  books.bookCount = seen.size;
  return books;
}

function findExtMatches(
  home: string,
  away: string,
  start: string,
  eventId: string,
  pool: ExtOddsEvent[],
): Array<{ ev: ExtOddsEvent; flipped: boolean; score: number }> {
  const hits: Array<{ ev: ExtOddsEvent; flipped: boolean; score: number }> = [];
  for (const ev of pool) {
    if (ev.eventIdBolsa && ev.eventIdBolsa === eventId) {
      hits.push({ ev, flipped: false, score: 1 });
      continue;
    }
    if (ev.start && !kickoffClose(start, ev.start)) continue;
    const { score, flipped } = pairSimilarity(home, away, ev.home, ev.away);
    if (score >= 0.62) hits.push({ ev, flipped, score });
  }
  // melhor match por bookmaker
  const bestByBm = new Map<string, (typeof hits)[number]>();
  for (const h of hits) {
    const cur = bestByBm.get(h.ev.bookmaker);
    if (!cur || h.score > cur.score) bestByBm.set(h.ev.bookmaker, h);
  }
  return [...bestByBm.values()];
}

async function buildWithExtensionOdds(
  bolsaEvents: BetBraEvent[],
): Promise<OddsComparePayload> {
  const pool = listAllExtOdds();
  const rows: OddsCompareRow[] = [];
  const matchedIds = new Set<string>();
  const usedBooks = new Set<string>();

  for (const ev of bolsaEvents) {
    const { home, away } = teamNames(ev);
    const matchOdds = extractMatchOdds(ev);
    const extHits = findExtMatches(home, away, ev.start, ev.id, pool);
    const books = booksFromExtEvents(extHits);
    for (const h of extHits) usedBooks.add(bookLabel(h.ev.bookmaker));

    const selections = buildSelections(home, away, matchOdds, books);
    const edges = selections
      .map((s) => s.edgeVsBack)
      .filter((n): n is number => n != null);
    const matched = books.bookCount > 0;
    if (matched) matchedIds.add(ev.id);

    rows.push({
      eventId: ev.id,
      home,
      away,
      start: ev.start,
      competition: competitionName(ev),
      mexchangeUrl: mexchangeEventUrl(ev.id, matchOdds.market?.id),
      matched,
      matchScore: extHits.length
        ? Math.round(Math.max(...extHits.map((h) => h.score)) * 100) / 100
        : 0,
      bookCount: books.bookCount,
      selections,
      bestEdgeVsBack: edges.length ? Math.max(...edges) : null,
    });
  }

  sortRows(rows);

  return {
    generatedAt: new Date().toISOString(),
    configured: true,
    provider: "extension",
    creditsRemaining: null,
    creditsUsed: null,
    sportsScanned: ["extension:bet365", "extension:betnacional"],
    bookmakers: [...usedBooks],
    bolsaEvents: bolsaEvents.length,
    matchedCount: matchedIds.size,
    rows,
    extOddsCount: pool.length,
  };
}

function bestBooksFromOddsIo(
  event: OddsIoEventOdds,
  flipped: boolean,
): BestBooks {
  let home: BookSide | null = null;
  let draw: BookSide | null = null;
  let away: BookSide | null = null;
  let bookCount = 0;

  for (const [bmName, markets] of Object.entries(event.bookmakers ?? {})) {
    if (/no latency/i.test(bmName)) continue;
    const ml = markets.find((m) =>
      /^ml$|match result|1x2|moneyline|resultado/i.test(m.name),
    );
    const line = ml?.odds?.[0];
    if (!line) continue;
    bookCount += 1;

    let h = parsePrice(line.home);
    let d = parsePrice(line.draw);
    let a = parsePrice(line.away);
    if (flipped) {
      const tmp = h;
      h = a;
      a = tmp;
    }

    home = considerBook(h, bmName, home);
    draw = considerBook(d, bmName, draw);
    away = considerBook(a, bmName, away);
  }

  return { home, draw, away, bookCount };
}

async function buildWithOddsApiIo(
  bolsaEvents: BetBraEvent[],
): Promise<OddsComparePayload> {
  const ioEvents = await listFootballEvents({ limit: 400 });
  const bookmakers = resolveBookmakers();

  // Bolsa às vezes devolve o mesmo eventId mais de uma vez
  const uniqueBolsa = [...new Map(bolsaEvents.map((e) => [e.id, e])).values()];

  type Hit = {
    bolsa: BetBraEvent;
    home: string;
    away: string;
    oddsId: number;
    score: number;
    flipped: boolean;
    sportTitle?: string;
    league?: string;
  };

  const hits: Hit[] = [];
  const usedOdds = new Set<number>();
  const usedBolsa = new Set<string>();

  for (const ev of uniqueBolsa) {
    if (usedBolsa.has(ev.id)) continue;
    const { home, away } = teamNames(ev);
    let best: Hit | null = null;

    for (const meta of ioEvents) {
      if (usedOdds.has(meta.id)) continue;
      if (!kickoffClose(ev.start, meta.date)) continue;
      const { score, flipped } = pairSimilarity(
        home,
        away,
        meta.home,
        meta.away,
      );
      if (score < 0.55) continue;
      if (!best || score > best.score) {
        best = {
          bolsa: ev,
          home,
          away,
          oddsId: meta.id,
          score,
          flipped,
          sportTitle: meta.league?.name ?? meta.sport?.name,
          league: meta.league?.slug,
        };
      }
    }

    if (best && best.score >= 0.62) {
      usedOdds.add(best.oddsId);
      usedBolsa.add(ev.id);
      hits.push(best);
    }
  }

  const oddsList = await fetchMultiOdds(
    hits.map((h) => h.oddsId),
    bookmakers,
  );
  const oddsById = new Map(oddsList.map((e) => [e.id, e]));

  const matchedIds = new Set<string>();
  const rows: OddsCompareRow[] = [];
  const usedBooks = new Set<string>();

  for (const hit of hits) {
    const matchOdds = extractMatchOdds(hit.bolsa);
    const oddsEvent = oddsById.get(hit.oddsId) ?? null;
    const books = oddsEvent
      ? bestBooksFromOddsIo(oddsEvent, hit.flipped)
      : emptyBooks();
    for (const side of [books.home, books.draw, books.away]) {
      if (side?.bookmaker) usedBooks.add(side.bookmaker);
    }
    const selections = buildSelections(hit.home, hit.away, matchOdds, books);
    const edges = selections
      .map((s) => s.edgeVsBack)
      .filter((n): n is number => n != null);
    const matched = Boolean(oddsEvent && books.bookCount > 0);
    if (matched) matchedIds.add(hit.bolsa.id);

    rows.push({
      eventId: hit.bolsa.id,
      home: hit.home,
      away: hit.away,
      start: hit.bolsa.start,
      competition: competitionName(hit.bolsa) ?? hit.sportTitle,
      mexchangeUrl: mexchangeEventUrl(hit.bolsa.id, matchOdds.market?.id),
      matched,
      matchScore: Math.round(hit.score * 100) / 100,
      oddsApiEventId: String(hit.oddsId),
      sportKey: hit.league,
      sportTitle: hit.sportTitle,
      bookCount: books.bookCount,
      selections,
      bestEdgeVsBack: edges.length ? Math.max(...edges) : null,
    });
  }

  appendUnmatched(rows, uniqueBolsa, matchedIds);
  sortRows(rows);

  return {
    generatedAt: new Date().toISOString(),
    configured: true,
    provider: "odds-api.io",
    creditsRemaining: null,
    creditsUsed: null,
    sportsScanned: ["football"],
    bookmakers: [...usedBooks].length ? [...usedBooks] : [...bookmakers],
    bolsaEvents: uniqueBolsa.length,
    matchedCount: matchedIds.size,
    rows,
    extOddsCount: 0,
  };
}

function bestBooksFromTheOddsApi(
  event: OddsApiEventOdds,
  flipped: boolean,
): BestBooks {
  let home: BookSide | null = null;
  let draw: BookSide | null = null;
  let away: BookSide | null = null;
  let bookCount = 0;

  for (const bm of event.bookmakers ?? []) {
    const market = bm.markets?.find((m) => m.key === "h2h");
    if (!market?.outcomes?.length) continue;
    bookCount += 1;

    let homeOdds: number | null = null;
    let awayOdds: number | null = null;
    let drawOdds: number | null = null;

    for (const o of market.outcomes) {
      if (/draw|empate|tie|^x$/i.test(o.name)) {
        drawOdds = o.price;
        continue;
      }
      if (o.name === event.home_team) homeOdds = o.price;
      else if (o.name === event.away_team) awayOdds = o.price;
    }

    if (homeOdds == null || awayOdds == null) {
      const nonDraw = market.outcomes.filter(
        (o) => !/draw|empate|tie|^x$/i.test(o.name),
      );
      if (nonDraw.length >= 2) {
        homeOdds ??= nonDraw[0]?.price ?? null;
        awayOdds ??= nonDraw[1]?.price ?? null;
      }
    }

    if (flipped) {
      const tmp = homeOdds;
      homeOdds = awayOdds;
      awayOdds = tmp;
    }

    home = considerBook(homeOdds, bm.title, home);
    draw = considerBook(drawOdds, bm.title, draw);
    away = considerBook(awayOdds, bm.title, away);
  }

  return { home, draw, away, bookCount };
}

function sortRows(rows: OddsCompareRow[]) {
  rows.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    const ae = a.bestEdgeVsBack ?? -999;
    const be = b.bestEdgeVsBack ?? -999;
    if (be !== ae) return be - ae;
    return Date.parse(a.start) - Date.parse(b.start);
  });
}

function appendUnmatched(
  rows: OddsCompareRow[],
  bolsaEvents: BetBraEvent[],
  matchedIds: Set<string>,
) {
  for (const ev of bolsaEvents) {
    if (matchedIds.has(ev.id)) continue;
    const { home, away } = teamNames(ev);
    const matchOdds = extractMatchOdds(ev);
    rows.push({
      eventId: ev.id,
      home,
      away,
      start: ev.start,
      competition: competitionName(ev),
      mexchangeUrl: mexchangeEventUrl(ev.id, matchOdds.market?.id),
      matched: false,
      matchScore: 0,
      bookCount: 0,
      selections: buildSelections(home, away, matchOdds, emptyBooks()),
      bestEdgeVsBack: null,
    });
  }
}

async function buildWithTheOddsApi(
  bolsaEvents: BetBraEvent[],
  opts: { regions: string; maxSports: number },
): Promise<OddsComparePayload> {
  const sportKeys = await resolveSoccerKeysToScan(opts.maxSports);
  const metaBySport = new Map<
    string,
    Awaited<ReturnType<typeof listSportEvents>>
  >();
  await Promise.all(
    sportKeys.map(async (key) => {
      try {
        metaBySport.set(key, await listSportEvents(key));
      } catch {
        metaBySport.set(key, []);
      }
    }),
  );

  type Hit = {
    bolsa: BetBraEvent;
    home: string;
    away: string;
    sportKey: string;
    oddsId: string;
    score: number;
    flipped: boolean;
    sport_title?: string;
  };

  const hits: Hit[] = [];
  const usedOddsIds = new Set<string>();

  for (const ev of bolsaEvents) {
    const { home, away } = teamNames(ev);
    let best: Hit | null = null;

    for (const sportKey of sportKeys) {
      for (const meta of metaBySport.get(sportKey) ?? []) {
        if (usedOddsIds.has(meta.id)) continue;
        if (!kickoffClose(ev.start, meta.commence_time)) continue;
        const { score, flipped } = pairSimilarity(
          home,
          away,
          meta.home_team,
          meta.away_team,
        );
        if (score < 0.55) continue;
        if (!best || score > best.score) {
          best = {
            bolsa: ev,
            home,
            away,
            sportKey,
            oddsId: meta.id,
            score,
            flipped,
            sport_title: meta.sport_title,
          };
        }
      }
    }

    if (best && best.score >= 0.62) {
      usedOddsIds.add(best.oddsId);
      hits.push(best);
    }
  }

  const sportsNeeded = [...new Set(hits.map((h) => h.sportKey))];
  const oddsById = new Map<string, OddsApiEventOdds>();
  let creditsRemaining: number | null = null;
  let creditsUsed: number | null = null;

  for (const sportKey of sportsNeeded) {
    try {
      const { events, remaining, used } = await fetchSportH2hOdds(
        sportKey,
        opts.regions,
      );
      if (remaining != null) creditsRemaining = remaining;
      if (used != null) creditsUsed = used;
      for (const e of events) oddsById.set(e.id, e);
    } catch {
      // liga sem odds
    }
  }

  const matchedIds = new Set(hits.map((h) => h.bolsa.id));
  const rows: OddsCompareRow[] = [];

  for (const hit of hits) {
    const matchOdds = extractMatchOdds(hit.bolsa);
    const oddsEvent = oddsById.get(hit.oddsId) ?? null;
    const books = oddsEvent
      ? bestBooksFromTheOddsApi(oddsEvent, hit.flipped)
      : emptyBooks();
    const selections = buildSelections(hit.home, hit.away, matchOdds, books);
    const edges = selections
      .map((s) => s.edgeVsBack)
      .filter((n): n is number => n != null);

    rows.push({
      eventId: hit.bolsa.id,
      home: hit.home,
      away: hit.away,
      start: hit.bolsa.start,
      competition: competitionName(hit.bolsa),
      mexchangeUrl: mexchangeEventUrl(hit.bolsa.id, matchOdds.market?.id),
      matched: Boolean(oddsEvent && books.bookCount > 0),
      matchScore: Math.round(hit.score * 100) / 100,
      oddsApiEventId: hit.oddsId,
      sportKey: hit.sportKey,
      sportTitle: hit.sport_title ?? oddsEvent?.sport_title,
      bookCount: books.bookCount,
      selections,
      bestEdgeVsBack: edges.length ? Math.max(...edges) : null,
    });
  }

  appendUnmatched(rows, bolsaEvents, matchedIds);
  sortRows(rows);

  return {
    generatedAt: new Date().toISOString(),
    configured: true,
    provider: "the-odds-api",
    creditsRemaining,
    creditsUsed,
    sportsScanned: sportsNeeded.length ? sportsNeeded : sportKeys,
    bookmakers: [],
    bolsaEvents: bolsaEvents.length,
    matchedCount: rows.filter((r) => r.matched).length,
    rows,
  };
}

export async function buildOddsCompare(opts?: {
  limit?: number;
  regions?: string;
  maxSports?: number;
}): Promise<OddsComparePayload> {
  const limit = opts?.limit ?? 40;
  const regions = opts?.regions ?? "eu";
  const maxSports = opts?.maxSports ?? 8;

  const hasIo = Boolean(getOddsApiIoKey());
  const hasTheOdds = Boolean(getOddsApiKey());
  const hasExt = hasFreshExtOdds();

  if (!hasIo && !hasTheOdds && !hasExt) {
    return {
      generatedAt: new Date().toISOString(),
      configured: false,
      provider: null,
      message:
        "Configure ODDS_API_IO_KEY (Bet365 + Betnacional) ou use a extensão.",
      creditsRemaining: null,
      creditsUsed: null,
      sportsScanned: [],
      bookmakers: resolveBookmakers(),
      bolsaEvents: 0,
      matchedCount: 0,
      rows: [],
      extOddsCount: 0,
    };
  }

  const listed = await listSoccerEvents({ perPage: limit });
  const bolsaEvents = listed.events ?? [];

  // Fonte principal: Odds-API.io (Bet365 + Betnacional).
  // Extensão NÃO mescla aqui — o DOM da Betnacional gera odds lixo (ex.: 81 vs Bolsa 1.01).
  if (hasIo) {
    try {
      const io = await buildWithOddsApiIo(bolsaEvents);
      const rows = dedupeRows(sanitizeRows(io.rows));
      return {
        ...io,
        rows,
        matchedCount: rows.filter((r) => r.matched).length,
        extOddsCount: hasExt ? listAllExtOdds().length : 0,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha Odds-API.io";
      if (hasExt) {
        const ext = await buildWithExtensionOdds(bolsaEvents);
        const rows = dedupeRows(sanitizeRows(ext.rows));
        return {
          ...ext,
          rows,
          matchedCount: rows.filter((r) => r.matched).length,
          message: `${message} · usando extensão (filtrada) como fallback.`,
        };
      }
      if (!hasTheOdds) {
        return {
          generatedAt: new Date().toISOString(),
          configured: false,
          provider: null,
          message,
          creditsRemaining: null,
          creditsUsed: null,
          sportsScanned: [],
          bookmakers: resolveBookmakers(),
          bolsaEvents: bolsaEvents.length,
          matchedCount: 0,
          rows: [],
          extOddsCount: 0,
        };
      }
    }
  }

  if (hasExt) {
    const ext = await buildWithExtensionOdds(bolsaEvents);
    const rows = dedupeRows(sanitizeRows(ext.rows));
    return {
      ...ext,
      rows,
      matchedCount: rows.filter((r) => r.matched).length,
    };
  }

  if (hasTheOdds) {
    try {
      const api = await buildWithTheOddsApi(bolsaEvents, { regions, maxSports });
      const rows = dedupeRows(sanitizeRows(api.rows));
      return {
        ...api,
        rows,
        matchedCount: rows.filter((r) => r.matched).length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha The Odds API";
      return {
        generatedAt: new Date().toISOString(),
        configured: false,
        provider: null,
        message,
        creditsRemaining: null,
        creditsUsed: null,
        sportsScanned: [],
        bookmakers: ["Bet365", "Betnacional"],
        bolsaEvents: bolsaEvents.length,
        matchedCount: 0,
        rows: [],
        extOddsCount: 0,
      };
    }
  }

  return buildWithExtensionOdds(bolsaEvents);
}
