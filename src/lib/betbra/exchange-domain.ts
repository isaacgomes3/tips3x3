/**
 * Domínio da Bolsa usado para abrir links e para o Auto Lay nativo logar.
 * BetBra e Bolsa de Aposta são o mesmo Mexchange por baixo — mas cada
 * domínio tem sessão/cookies próprios, então o usuário escolhe onde loga.
 */
export type ExchangeDomain = "betbra.bet.br" | "bolsadeaposta.bet.br";

export const DEFAULT_EXCHANGE_DOMAIN: ExchangeDomain = "betbra.bet.br";

export const EXCHANGE_DOMAIN_OPTIONS: Array<{
  value: ExchangeDomain;
  label: string;
}> = [
  { value: "betbra.bet.br", label: "BetBra (betbra.bet.br)" },
  { value: "bolsadeaposta.bet.br", label: "Bolsa de Aposta (bolsadeaposta.bet.br)" },
];

const STORAGE_KEY = "tips3x3-exchange-domain";

export function getExchangeDomain(): ExchangeDomain {
  if (typeof window === "undefined") return DEFAULT_EXCHANGE_DOMAIN;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "bolsadeaposta.bet.br" ? raw : DEFAULT_EXCHANGE_DOMAIN;
}

export function setExchangeDomain(domain: ExchangeDomain) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, domain);
}

/** Troca o host betbra.bet.br pelo domínio escolhido pelo usuário, se houver. */
export function withExchangeDomain(url: string | null | undefined): string {
  if (!url) return "";
  const domain = getExchangeDomain();
  if (domain === DEFAULT_EXCHANGE_DOMAIN) return url;
  return url.replace(/betbra\.bet\.br/g, domain);
}
