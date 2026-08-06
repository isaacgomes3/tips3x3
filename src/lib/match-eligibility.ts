/**
 * Regras de elegibilidade para indicar / auto-enviar.
 * Sem indicação se amistoso, dados incompletos ou fontes conflitantes.
 */

import { minutesConflict } from "@/lib/live-minute";

function normalizeComp(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Competições amistosas (clube ou seleção). */
export function isFriendlyCompetition(
  ...names: Array<string | null | undefined>
): boolean {
  for (const raw of names) {
    if (!raw?.trim()) continue;
    const s = normalizeComp(raw);
    if (
      /\bamistoso/.test(s) ||
      /\bamistosos\b/.test(s) ||
      /\bfriendly\b/.test(s) ||
      /\bfriendlies\b/.test(s) ||
      /\bexhibition\b/.test(s) ||
      /\bpartido amistoso\b/.test(s) ||
      /\binternational friendly\b/.test(s) ||
      /\bclub friendly\b/.test(s) ||
      /\bfriendly match\b/.test(s)
    ) {
      return true;
    }
  }
  return false;
}

export function isLiveDataIncomplete(opts: {
  scoreLabel?: string | null;
  minute?: number | null;
}): boolean {
  const score = opts.scoreLabel?.replace(/\s+/g, "") ?? "";
  if (!/^\d+[-–:]\d+$/.test(score)) return true;
  if (opts.minute == null || !Number.isFinite(opts.minute)) return true;
  return false;
}

export type IndicationGate = {
  ok: boolean;
  blockers: string[];
};

/**
 * Gate único antes de liberar ENTRAR / gravar indicação / enviar à extensão.
 */
export function evaluateIndicationGate(opts: {
  competition?: string | null;
  fotmobCompetition?: string | null;
  scoreLabel?: string | null;
  minute?: number | null;
  betbraMinute?: number | null;
  fotmobMinute?: number | null;
}): IndicationGate {
  const blockers: string[] = [];

  if (isFriendlyCompetition(opts.competition, opts.fotmobCompetition)) {
    blockers.push("Amistoso — sem indicação");
  }
  if (isLiveDataIncomplete({ scoreLabel: opts.scoreLabel, minute: opts.minute })) {
    blockers.push("Dados incompletos (placar/minuto)");
  }
  if (minutesConflict(opts.betbraMinute, opts.fotmobMinute)) {
    blockers.push("Minuto conflitante entre Bolsa e FotMob");
  }

  return { ok: blockers.length === 0, blockers };
}
