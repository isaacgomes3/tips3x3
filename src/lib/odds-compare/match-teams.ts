/** Normaliza nome de time para matching fuzzy. */
export function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(fc|cf|sc|ac|afc|clube|club|sport|sports|de|da|do|dos|das|the|united|city|real)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(name: string): string[] {
  return normalizeTeam(name)
    .split(" ")
    .filter((t) => t.length >= 3);
}

/** Similaridade 0–1 entre dois nomes de time. */
export function teamSimilarity(a: string, b: string): number {
  const na = normalizeTeam(a);
  const nb = normalizeTeam(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;

  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;

  let overlap = 0;
  for (const t of ta) {
    if (tb.some((u) => u === t || u.includes(t) || t.includes(u))) overlap += 1;
  }
  const denom = Math.max(ta.length, tb.length);
  return overlap / denom;
}

export function pairSimilarity(
  homeA: string,
  awayA: string,
  homeB: string,
  awayB: string,
): { score: number; flipped: boolean } {
  const direct =
    (teamSimilarity(homeA, homeB) + teamSimilarity(awayA, awayB)) / 2;
  const flipped =
    (teamSimilarity(homeA, awayB) + teamSimilarity(awayA, homeB)) / 2;
  if (flipped > direct) return { score: flipped, flipped: true };
  return { score: direct, flipped: false };
}

const KICKOFF_TOLERANCE_MS = 3 * 60 * 60_000;

export function kickoffClose(
  isoA: string,
  isoB: string,
  toleranceMs = KICKOFF_TOLERANCE_MS,
): boolean {
  const a = Date.parse(isoA);
  const b = Date.parse(isoB);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return Math.abs(a - b) <= toleranceMs;
}
