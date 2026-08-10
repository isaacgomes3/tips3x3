/**
 * Domínio da Bolsa usado para abrir links e para o Auto Lay nativo logar.
 * BetBra e Bolsa de Aposta são o mesmo Mexchange por baixo — mas cada
 * domínio tem sessão/cookies próprios, então o usuário escolhe onde loga.
 */
export type ExchangeDomain = "betbra.bet.br";

export const DEFAULT_EXCHANGE_DOMAIN: ExchangeDomain = "betbra.bet.br";

export const EXCHANGE_DOMAIN_OPTIONS: Array<{
  value: ExchangeDomain;
  label: string;
}> = [
  { value: "betbra.bet.br", label: "BetBra" },
];

const STORAGE_KEY = "tips3x3-exchange-domain";

export function getExchangeDomain(): ExchangeDomain {
  if (typeof window === "undefined") return DEFAULT_EXCHANGE_DOMAIN;
  window.localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_EXCHANGE_DOMAIN;
}

export function setExchangeDomain(_domain: ExchangeDomain) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Troca o host betbra.bet.br pelo domínio escolhido pelo usuário, se houver. */
export function withExchangeDomain(url: string | null | undefined): string {
  if (!url) return "";
  return url.replace(/bolsadeaposta\.bet\.br/g, DEFAULT_EXCHANGE_DOMAIN);
}
