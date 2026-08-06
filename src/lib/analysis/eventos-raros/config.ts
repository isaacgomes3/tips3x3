/** Config Eventos Raros — Correct Score lay ≥ 100, 2º tempo, hold até settle. */
export const EVENTOS_RAROS = {
  livePreferred: true,
  minLayOdds: 100,
  oddsBand: {
    min: 100,
    max: 1000,
    preferredMin: 120,
    preferredMax: 400,
  },
  /**
   * Só 2º tempo.
   * max = teto de minuto válido (90 + acréscimos).
   */
  secondHalfMinute: 45,
  minute: { min: 45, max: 98 },
  /** Minuto de referência para tempo restante (90 + acréscimos). */
  fullTimeMinute: 95,
  /**
   * Diff de gols do live |casa−fora| ≥ N → entrada do padrão a qualquer
   * momento no 2º tempo. Abaixo disso → só nos últimos `lastMinutesBeforeEnd`.
   */
  minGoalDiffAnytime: 3,
  /** Com diff &lt; minGoalDiffAnytime, só nos últimos N minutos. */
  lastMinutesBeforeEnd: 5,
  minLayLiquidity: 5,
  /** Tempo crítico (gate B): gols extras vs minutos restantes. */
  time: {
    minGoalsNeeded: 2,
    maxGoalsPerRemainingMin: 0.2,
    /** Com needed ≥ 3 no 2º tempo → time-blocked independente da taxa. */
    lateMinGoalsHard: 3,
  },
  /** Forma: projeção alta enfraquece tese de placar raro. */
  maxProjectedTotal: 3.4,
  /**
   * Cartão vermelho desequilibra o jogo e destrói a tese do padrão.
   * Vale só para o padrão "ainda possível" — LUCRO CERTO (placar já
   * impossível) é green matemático e ignora esta regra.
   */
  blockOnRedCard: true,
  /** Top candidatos no snapshot para UI. */
  topN: 5,
  /**
   * Máx. de placares com entrada no mesmo evento.
   * CS compartilha saldo/mercado — várias lays no mesmo book são ok.
   */
  maxEntriesPerEvent: 8,
  /**
   * Placar já impossível (ex.: live 1-1 → lay 0-2): prioridade máxima.
   * Ainda exige 2º tempo + odd lay ≥ minLayOdds.
   */
  alreadyImpossible: {
    enabled: true,
    /** Prioridade máxima no ranking. */
    rarityBonus: 200,
  },
  exit: "hold" as const,
} as const;

export type EventosRarosConfig = typeof EVENTOS_RAROS;
