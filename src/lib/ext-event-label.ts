/** Nome legível do evento para a extensão Bolsa Manual (Último Evento). */

export function resolveExtEventName(opts: {
  eventName?: string | null;
  home?: string | null;
  away?: string | null;
  eventId?: string | null;
}): string {
  const named = String(opts.eventName || "").trim();
  if (named && !/^event\s*\d+$/i.test(named)) return named;

  const home = String(opts.home || "").trim();
  const away = String(opts.away || "").trim();
  if (home && away && home !== "?" && away !== "?") {
    return `${home} vs ${away}`;
  }
  if (home && home !== "?") return home;
  if (away && away !== "?") return away;

  const id = String(opts.eventId || "").trim();
  return id ? `Evento ${id}` : "Evento";
}
