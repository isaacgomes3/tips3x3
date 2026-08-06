import { useMemo } from "react";
import { buildLay1x1Snapshot, type Lay1x1Snapshot } from "@/lib/analysis/lay-1x1";
import { isLay1x1Enabled } from "@/lib/strategy-settings";

export interface Lay1x1GameData {
  marketId?: string;
  runnerId?: string;
  layOdds: number | null;
  backOdds: number | null;
  layLiquidity?: number;
  minute?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  favoritePressureBias?: number | null;
  matchOdds?: {
    home?: { back?: number | null };
    away?: { back?: number | null };
  };
}

/**
 * Calcula snapshots Lay 1x1 para uma lista de jogos.
 * Retorna apenas os não-settlados, priorizando entryReady=true.
 */
export function useLay1x1(games: Lay1x1GameData[] = []): Lay1x1Snapshot[] {
  return useMemo(() => {
    if (!Array.isArray(games) || games.length === 0) return [];

    const snapshots: Lay1x1Snapshot[] = [];

    for (const game of games) {
      const snap = buildLay1x1Snapshot(game);
      if (!snap.settled && snap.layOdds != null) {
        snapshots.push(snap);
      }
    }

    snapshots.sort((a, b) => {
      if (a.entryReady !== b.entryReady) return a.entryReady ? -1 : 1;
      return b.goodCount - a.goodCount;
    });

    return snapshots;
  }, [games]);
}

export function useLay1x1Settings() {
  return { enabled: isLay1x1Enabled() };
}
