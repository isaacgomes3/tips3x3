/**
 * Parse do minuto de jogo a partir de labels BetBra / FotMob / Sofascore.
 * Nunca usar o 1º dígito cego ("1H 12'" → 1); preferir o relógio real.
 */

function clampMinute(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const m = Math.floor(n);
  if (m < 0 || m > 130) return null;
  return m;
}

/** Extrai minuto de jogo de strings como 12', 45+2, HT, 2H 67, 1º | 12:02. */
export function parseLiveMinute(value: unknown): number | null {
  if (value == null || value === "") return null;

  if (typeof value === "number") return clampMinute(value);

  const s = String(value).trim();
  if (!s) return null;

  if (/^(ht|intervalo|half[\s-]?time)$/i.test(s)) return 45;
  if (/^(ft|aet|pen|ended|encerrado|full[\s-]?time)$/i.test(s)) return 90;

  // 45+2 / 90+3'
  const stoppage = s.match(/\b(\d{1,3})\s*\+\s*(\d{1,2})\b/);
  if (stoppage) {
    return clampMinute(Number(stoppage[1]) + Number(stoppage[2]));
  }

  // 12' / 12′
  const apostrophe = s.match(/(\d{1,3})\s*['′]/);
  if (apostrophe) return clampMinute(Number(apostrophe[1]));

  // "1º | 12:02" / "12:02" → minutos antes dos segundos
  const clock = s.match(/\b(\d{1,3})\s*:\s*\d{2}\b/);
  if (clock) return clampMinute(Number(clock[1]));

  const nums = [...s.matchAll(/\d{1,3}/g)].map((m) => Number(m[0]));
  const plausible = nums.filter((n) => n >= 0 && n <= 130);
  if (!plausible.length) return null;

  // "1H 12" / "2º 67": descarta o marcador de tempo (1/2) se houver outro número
  if (plausible.length >= 2) {
    const withoutHalfMarker = plausible.filter((n) => n !== 1 && n !== 2);
    if (withoutHalfMarker.length) {
      return clampMinute(withoutHalfMarker[withoutHalfMarker.length - 1]!);
    }
  }

  return clampMinute(plausible[plausible.length - 1]!);
}

/** True se Bolsa e FotMob discordam do relógio (≥ divergeMin minutos). */
export function minutesConflict(
  betbraMinute?: number | null,
  fotmobMinute?: number | null,
  divergeMin = 10,
): boolean {
  const bra = betbraMinute ?? null;
  const foto = fotmobMinute ?? null;
  if (bra == null || foto == null) return false;
  return Math.abs(bra - foto) >= divergeMin;
}

/**
 * Escolhe o minuto para exibição.
 * Prioriza o relógio da BetBra (`inplay-info`: timeElapsed / elapsedRegularTime).
 * FotMob só preenche lacuna quando a Bolsa não manda minuto.
 * Em conflito (≥ divergeMin), a UI fica com a Bolsa; a indicação continua
 * bloqueada via `minutesConflict` / `evaluateIndicationGate`.
 */
export function pickTrustedLiveMinute(opts: {
  betbraMinute?: number | null;
  fotmobMinute?: number | null;
}): number | null {
  const bra = opts.betbraMinute ?? null;
  const foto = opts.fotmobMinute ?? null;
  if (bra != null) return bra;
  if (foto != null) return foto;
  return null;
}
