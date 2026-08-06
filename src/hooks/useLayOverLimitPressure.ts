import { useMemo } from "react";
import {
  buildLayOverLimitPressureSnapshot,
  getLolpStakePct,
  getLolpTargetProfitPct,
  LAY_OVER_LIMIT_PRESSURE,
  type LayOverLimitPressureSnapshot,
} from "@/lib/analysis/lay-over-limit-pressure";
import { isLayOverLimitPressureEnabled } from "@/lib/strategy-settings";
import type { OddsHistoryPoint } from "@/lib/betbra/odds-history";

export interface LiveGameData {
  marketId?: string;
  runnerId?: string;
  layOdds: number | null;
  backOdds: number | null;
  layLiquidity?: number;
  historyPoints?: OddsHistoryPoint[];
  line?: number;
  targetProfitPct?: number | null;
  minute?: number | null;
  totalGoals?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  favoritePressureBias?: number | null;
  shotsPerMinFavorite?: number | null;
  areaPressurePerMin?: number | null;
  matchOdds?: {
    home?: { back?: number | null };
    away?: { back?: number | null };
  };
}

export function useLayOverLimitPressure(
  games: LiveGameData[] = [],
  targetProfitPct?: number | null,
): LayOverLimitPressureSnapshot[] {
  return useMemo(() => {
    if (!Array.isArray(games) || games.length === 0) return [];

    const snapshots: LayOverLimitPressureSnapshot[] = [];

    for (const game of games) {
      // Varrer cada linha de Over configurada
      for (const line of LAY_OVER_LIMIT_PRESSURE.lines) {
        const snapshot = buildLayOverLimitPressureSnapshot({
          ...game,
          line,
          targetProfitPct:
            targetProfitPct != null ? targetProfitPct : game.targetProfitPct,
        });

        // Filtrar apenas casos não settlados e com dados mínimos
        if (!snapshot.settled && snapshot.layOdds != null) {
          snapshots.push(snapshot);
        }
      }
    }

    // Ordenar por entryReady (primeiro) e depois por qualidade (goodCount desc)
    snapshots.sort((a, b) => {
      if (a.entryReady !== b.entryReady) {
        return a.entryReady ? -1 : 1;
      }
      return b.goodCount - a.goodCount;
    });

    return snapshots;
  }, [games, targetProfitPct]);
}

/** Configurações do painel (lucro alvo, % banca e ON/OFF da estratégia). */
export function useLayOverLimitPressureSettings() {
  return {
    targetProfitPct: getLolpTargetProfitPct(),
    stakePct: getLolpStakePct(),
    enabled: isLayOverLimitPressureEnabled(),
  };
}
