/**
 * Traduz o intel do FotMob nas métricas de pressão que o LOLP consome.
 *
 * O feed só expõe estatísticas acumuladas do jogo (sem série temporal), por isso
 * chutes/área são taxas médias por minuto decorrido — proxy do "nível recente".
 * O gráfico de momentum, esse sim, é por minuto: dele sai a leitura dos últimos
 * minutos usada para decidir se o momento permite entrada rápida.
 */

import type { SofaGraphPoint } from "@/lib/sofascore/types";

export type IntelStatRow = { name: string; home: string; away: string };

/** Janela do gráfico de pressão considerada "agora". */
export const RECENT_PRESSURE_WINDOW_MIN = 10;

function parseStatNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const match = String(raw).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function statForSide(
  extras: IntelStatRow[],
  re: RegExp,
  side: "home" | "away",
): number | null {
  const row = extras.find((r) => re.test(r.name));
  if (!row) return null;
  return parseStatNumber(side === "home" ? row.home : row.away);
}

/**
 * Diferencial de momentum do favorito na janela recente, na mesma escala do
 * `favoritePressureBias` do resto do sistema: 0 = equilibrado/dominado,
 * 1 = domínio total do favorito.
 */
export function recentFavoritePressureBias(
  momentum: SofaGraphPoint[] | null | undefined,
  favoriteSide: "home" | "away",
  windowMin = RECENT_PRESSURE_WINDOW_MIN,
): number | null {
  if (!momentum?.length) return null;
  const lastMinute = momentum.reduce(
    (max, p) => (Number.isFinite(p.minute) && p.minute > max ? p.minute : max),
    0,
  );
  const cut = lastMinute - windowMin;
  const window = momentum.filter(
    (p) => Number.isFinite(p.minute) && p.minute >= cut,
  );
  if (!window.length) return null;

  let home = 0;
  let away = 0;
  for (const p of window) {
    if (!Number.isFinite(p.value)) continue;
    if (p.value > 0) home += p.value;
    else if (p.value < 0) away += Math.abs(p.value);
  }
  const total = home + away;
  if (total <= 0) return 0;

  const favShare = (favoriteSide === "home" ? home : away) / total;
  return Math.max(0, favShare - (1 - favShare));
}

export function derivePressureFromIntel(opts: {
  extras?: IntelStatRow[] | null;
  momentum?: SofaGraphPoint[] | null;
  favoriteSide: "home" | "away";
  minute?: number | null;
}): {
  shotsPerMinFavorite: number | null;
  areaPressurePerMin: number | null;
  recentBias: number | null;
} {
  const extras = opts.extras ?? [];
  const minute =
    opts.minute != null && Number.isFinite(opts.minute) && opts.minute >= 5
      ? opts.minute
      : null;

  const shotsOnTarget = statForSide(
    extras,
    /finaliza(ç|c)(õ|o)es no gol/i,
    opts.favoriteSide,
  );
  const touchesInBox = statForSide(
    extras,
    /toques na (á|a)rea/i,
    opts.favoriteSide,
  );

  return {
    shotsPerMinFavorite:
      minute != null && shotsOnTarget != null ? shotsOnTarget / minute : null,
    areaPressurePerMin:
      minute != null && touchesInBox != null ? touchesInBox / minute : null,
    recentBias: recentFavoritePressureBias(opts.momentum, opts.favoriteSide),
  };
}
