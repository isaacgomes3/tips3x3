/**
 * Classificação de uma ordem sem acesso a disco — pode ser usada no browser.
 * Fonte única para "casou na Bolsa?" no painel, na API e no admin.
 */

import type { Indication, IndicationExecStatus } from "@/lib/indications-types";

/**
 * true = Lay casado na Bolsa, false = ainda no book, null = sem informação.
 *
 * Ordens gravadas antes do ciclo de vida (`events`) não têm como ser
 * verificadas: nelas o valor registrado continua valendo como ordem efetiva.
 */
export function inferLayMatched(raw: Indication): boolean | null {
  if (raw.layMatched === true) return true;
  if (raw.layMatched === false) return false;
  const events = Array.isArray(raw.events) ? raw.events : [];
  if (events.some((e) => e.type === "lay-matched" || e.type === "back-sent")) {
    return true;
  }
  if (events.some((e) => e.type === "lay-sent")) return false;
  if (Number(raw.stake) > 0 || Number(raw.liability) > 0) return true;
  return null;
}

/**
 * Ciclo só com "failed" e sem valor = tentativa que nunca virou ordem.
 * Registros antigos ficaram como "placed" porque o POST default promovia.
 */
export function inferExecStatus(raw: Indication): IndicationExecStatus {
  if (raw.execStatus === "failed") return "failed";
  const events = Array.isArray(raw.events) ? raw.events : [];
  if (events.length > 0 && events.every((e) => e.type === "failed")) {
    const hasValue = Number(raw.stake) > 0 || Number(raw.liability) > 0;
    if (!hasValue) return "failed";
  }
  return "placed";
}

/** Tentativa que falhou não é posição: fica fora de settle e de performance. */
export function isFailedAttempt(item: Indication): boolean {
  return inferExecStatus(item) === "failed";
}

/** Indicação gerada só pela varredura live — não é ordem na Bolsa. */
export function isScannerOnlyIndication(item: Indication): boolean {
  return !item.userEmail && (item.source === "sistema" || !item.source);
}

/** Ordem enviada por usuário (app, painel ou extensão). */
export function isUserExecutedOperation(item: Indication): boolean {
  return Boolean(item.userEmail?.trim()) && !isFailedAttempt(item);
}

/** Lay casado na exchange — green/red e financeiro só contam daqui. */
export function isLayMatchedOnExchange(item: Indication): boolean {
  return inferLayMatched(item) === true;
}

/** Lay enviado mas ainda no book (não correspondido). */
export function isLayUnmatchedOnExchange(item: Indication): boolean {
  return isUserExecutedOperation(item) && inferLayMatched(item) === false;
}
