/** Config Eventos Raros — Correct Score lay ≥ 100, live late, hold até settle. */
export const EVENTOS_RAROS = {
  livePreferred: true,
  minLayOdds: 100,
  oddsBand: {
    min: 100,
    max: 1000,
    preferredMin: 120,
    preferredMax: 400,
  },
  /** Janela late / perto do fecho. */
  minute: { min: 70, max: 98 },
  /** Minuto de referência para tempo restante (90 + acréscimos). */
  fullTimeMinute: 95,
  minLayLiquidity: 5,
  /** Tempo crítico (gate B): gols extras vs minutos restantes. */
  time: {
    minGoalsNeeded: 2,
    maxGoalsPerRemainingMin: 0.2,
    /** Com minuto ≥ late e needed ≥ 3 → time-blocked independente da taxa. */
    lateMinGoalsHard: 3,
  },
  /** Forma: projeção alta enfraquece tese de placar raro. */
  maxProjectedTotal: 3.4,
  /** Top candidatos no snapshot para UI. */
  topN: 5,
  /**
   * Máx. de placares com entrada no mesmo evento.
   * CS compartilha saldo/mercado — várias lays no mesmo book são ok.
   */
  maxEntriesPerEvent: 8,
  /**
   * Placar já impossível (ex.: live 1-1 → lay 0-2): entrada imediata.
   * Sem risco de settle — sem filtros de book/late/modelo (só odd lay ≥ minLayOdds).
   */
  alreadyImpossible: {
    enabled: true,
    /** Prioridade máxima no ranking. */
    rarityBonus: 200,
  },
  exit: "hold" as const,
} as const;

export type EventosRarosConfig = typeof EVENTOS_RAROS;
