/**
 * Mercados que o painel do cliente autoriza para a execução automática.
 *
 * Antes o servidor publicava todo ENTRAR e só a extensão decidia, pelo
 * `enabledMarkets` do HUD dela. Os dois lados divergiam: o cliente via o
 * filtro ligado no painel e a extensão recusava o sinal com "mercado
 * desabilitado". Agora o painel manda — envia os filtros ativos no /api/live
 * e este módulo guarda o conjunto para filtrar a publicação e espelhar o
 * estado no HUD da extensão.
 */

import type { StrategyMarketKey } from "@/lib/wallet/credit-tier";

/** Estratégia do sinal -> mercado da extensão. */
export const EXT_MARKET_BY_KIND: Record<string, StrategyMarketKey> = {
  "lay-3x3": "lay_3_3",
  "eventos-raros": "lay_eventos_raros",
  "lucro-certo": "lay_lucro_certo",
  "over-3.5": "lay_over_35",
  "over-4.5": "lay_over_45",
  "qov-lay-zebra": "lay_qov",
  "lay-over-limit-pressure": "lay_over_limit_pressure",
};

const ALL_MARKETS: StrategyMarketKey[] = [
  "lay_3_3",
  "lay_qov",
  "lay_eventos_raros",
  "lay_lucro_certo",
  "lay_over_35",
  "lay_over_45",
  "lay_over_limit_pressure",
];

/** Painel calado há tempo demais não manda mais no HUD (deixa como está). */
const PANEL_MARKETS_TTL_MS = 30 * 60_000;

export type PanelMarketFlags = Record<StrategyMarketKey, boolean>;

type Entry = { markets: PanelMarketFlags; at: number };

const byEmail = new Map<string, Entry>();

/**
 * `null` = painel antigo, que não informa filtros (mantém o comportamento
 * anterior de publicar tudo). Conjunto vazio = painel com tudo desligado.
 */
export function parsePanelKinds(raw: string | null): Set<string> | null {
  if (raw == null) return null;
  const kinds = raw
    .split(",")
    .map((s) => s.trim())
    .filter((k) => k && Object.prototype.hasOwnProperty.call(EXT_MARKET_BY_KIND, k));
  return new Set(kinds);
}

export function marketsFromKinds(kinds: Set<string>): PanelMarketFlags {
  const flags = Object.fromEntries(
    ALL_MARKETS.map((m) => [m, false]),
  ) as PanelMarketFlags;
  for (const kind of kinds) {
    const market = EXT_MARKET_BY_KIND[kind];
    if (market) flags[market] = true;
  }
  return flags;
}

export function setPanelMarkets(email: string, kinds: Set<string>) {
  byEmail.set(email.toLowerCase(), {
    markets: marketsFromKinds(kinds),
    at: Date.now(),
  });
}

export function getPanelMarkets(email: string): PanelMarketFlags | null {
  const entry = byEmail.get(email.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.at > PANEL_MARKETS_TTL_MS) {
    byEmail.delete(email.toLowerCase());
    return null;
  }
  return entry.markets;
}
