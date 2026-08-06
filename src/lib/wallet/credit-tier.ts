/**
 * Classificação do cliente por saldo de crédito e liberação de filtros
 * estratégicos por faixa — mesmo padrão dos cards da página inicial
 * (Crédito 10+, 50+, 250+). Faixas são cumulativas: 250+ inclui os
 * mercados de 50+ e 10+; 50+ inclui os de 10+.
 */

export type CreditTier = "none" | "10" | "50" | "250";

export type StrategyMarketKey =
  | "lay_3_3"
  | "lay_qov"
  | "lay_eventos_raros"
  | "lay_over_35"
  | "lay_over_45"
  | "lay_over_limit_pressure"
  | "lay_lucro_certo";

const TIER_ORDER: Exclude<CreditTier, "none">[] = ["10", "50", "250"];

const TIER_THRESHOLDS: Record<Exclude<CreditTier, "none">, number> = {
  "10": 10,
  "50": 50,
  "250": 250,
};

/** Mercados exclusivos liberados em cada faixa (ver CreditCard/DashboardHero). */
const TIER_MARKETS: Record<Exclude<CreditTier, "none">, StrategyMarketKey[]> = {
  "10": ["lay_over_35", "lay_over_45", "lay_over_limit_pressure"],
  "50": ["lay_3_3", "lay_qov"],
  "250": ["lay_eventos_raros", "lay_lucro_certo"],
};

export const CREDIT_TIER_LABEL: Record<Exclude<CreditTier, "none">, string> = {
  "10": "Crédito 10+",
  "50": "Crédito 50+",
  "250": "Crédito 250+",
};

/** Faixa do cliente a partir do saldo atual da carteira. */
export function getCreditTier(balance: number | null | undefined): CreditTier {
  const n = Number(balance);
  if (!Number.isFinite(n) || n <= 0) return "none";
  if (n >= TIER_THRESHOLDS["250"]) return "250";
  if (n >= TIER_THRESHOLDS["50"]) return "50";
  if (n >= TIER_THRESHOLDS["10"]) return "10";
  return "none";
}

/** Conjunto de mercados liberados pela faixa (cumulativo). */
export function getMarketsForTier(tier: CreditTier): Set<StrategyMarketKey> {
  const set = new Set<StrategyMarketKey>();
  if (tier === "none") return set;
  const idx = TIER_ORDER.indexOf(tier);
  for (let i = 0; i <= idx; i++) {
    for (const m of TIER_MARKETS[TIER_ORDER[i]!]) set.add(m);
  }
  return set;
}

export function isMarketAllowedForTier(
  market: StrategyMarketKey,
  tier: CreditTier,
): boolean {
  return getMarketsForTier(tier).has(market);
}

/** A partir de qual faixa o mercado é liberado — usado em avisos de bloqueio na UI. */
export function tierRequiredForMarket(
  market: StrategyMarketKey,
): Exclude<CreditTier, "none"> {
  for (const tier of TIER_ORDER) {
    if (TIER_MARKETS[tier].includes(market)) return tier;
  }
  return "10";
}

export function creditTierLabel(tier: CreditTier): string {
  if (tier === "none") return "Sem crédito";
  return CREDIT_TIER_LABEL[tier];
}
