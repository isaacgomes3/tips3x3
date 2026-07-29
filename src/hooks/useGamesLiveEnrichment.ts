"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type EnrichedLiveSnapshot = {
  scoreLabel: string;
  minute: number | null;
  status: string;
};

type GameRef = {
  eventId: string;
  home: string;
  away: string;
  start: string;
};

function normalizeTeams(home: string, away: string) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  return `${norm(home)}|${norm(away)}`;
}

function parseMinute(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  const m = String(value).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function estimateMinuteFromKickoff(start: string): number | null {
  const t = Date.parse(start);
  if (!Number.isFinite(t)) return null;
  const elapsed = Math.floor((Date.now() - t) / 60_000);
  if (elapsed < 0 || elapsed > 130) return null;
  return elapsed;
}

function normalizeScoreLabel(raw: string): string | null {
  const label = raw.replace(/\s+/g, "");
  const m = label.match(/^(\d+)[-–:](\d+)$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

function needsEnrichment(game: GameRef, hasBetbraLive: boolean): boolean {
  if (hasBetbraLive) return false;
  const start = Date.parse(game.start);
  if (!Number.isFinite(start)) return false;
  const now = Date.now();
  return start <= now + 8 * 60_000 && start >= now - 4 * 60 * 60_000;
}

function gamesFingerprint(games: GameRef[]) {
  return games
    .map((g) => `${g.eventId}:${g.start}`)
    .sort()
    .join("|");
}

export function useGamesLiveEnrichment(
  games: GameRef[],
  hasBetbraLive: (eventId: string) => boolean,
) {
  const [byEventId, setByEventId] = useState<Map<string, EnrichedLiveSnapshot>>(
    new Map(),
  );
  const [byTeams, setByTeams] = useState<Map<string, EnrichedLiveSnapshot>>(
    new Map(),
  );

  const gamesKey = useMemo(() => gamesFingerprint(games), [games]);
  const gamesRef = useRef(games);
  gamesRef.current = games;
  const hasBetbraLiveRef = useRef(hasBetbraLive);
  hasBetbraLiveRef.current = hasBetbraLive;

  const pendingKey = useMemo(() => {
    return games
      .filter((g) => needsEnrichment(g, hasBetbraLive(g.eventId)))
      .slice(0, 14)
      .map((g) => g.eventId)
      .join("|");
  }, [games, gamesKey, hasBetbraLive]);

  useEffect(() => {
    if (!pendingKey) return;

    let cancelled = false;

    const currentPending = () =>
      gamesRef.current
        .filter((g) => needsEnrichment(g, hasBetbraLiveRef.current(g.eventId)))
        .slice(0, 14);

    const load = async () => {
      const pending = currentPending();
      if (!pending.length) return;

      const results = await Promise.all(
        pending.map(async (game) => {
          try {
            const qs = new URLSearchParams({
              home: game.home,
              away: game.away,
            });
            if (game.eventId) qs.set("eventId", game.eventId);
            if (game.start) qs.set("start", game.start);
            const res = await fetch(`/api/match-stats?${qs.toString()}`);
            if (!res.ok) return null;
            const json = (await res.json()) as {
              scoreLabel?: string | null;
              minute?: string | number | null;
              status?: string | null;
            };

            const scoreLabel = json.scoreLabel
              ? normalizeScoreLabel(json.scoreLabel)
              : null;
            // Só jogos na janela de kickoff entram em pending — placar válido basta
            if (!scoreLabel) return null;

            const minute =
              parseMinute(json.minute) ??
              parseMinute(json.status) ??
              estimateMinuteFromKickoff(game.start);

            return {
              game,
              snap: {
                scoreLabel,
                minute,
                status: json.status ?? "Ao vivo",
              } satisfies EnrichedLiveSnapshot,
            };
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;

      const ok = results.filter(
        (r): r is { game: GameRef; snap: EnrichedLiveSnapshot } => r != null,
      );
      if (!ok.length) return;

      setByEventId((prev) => {
        const next = new Map(prev);
        for (const { game, snap } of ok) next.set(game.eventId, snap);
        return next;
      });
      setByTeams((prev) => {
        const next = new Map(prev);
        for (const { game, snap } of ok) {
          next.set(normalizeTeams(game.home, game.away), snap);
        }
        return next;
      });
    };

    void load();
    const id = window.setInterval(() => void load(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pendingKey]);

  useEffect(() => {
    const ids = new Set(games.map((g) => g.eventId));
    setByEventId((prev) => {
      let changed = false;
      const next = new Map<string, EnrichedLiveSnapshot>();
      for (const [id, snap] of prev) {
        if (ids.has(id)) next.set(id, snap);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [games, gamesKey]);

  const resolve = (game: GameRef): EnrichedLiveSnapshot | null => {
    return (
      byEventId.get(game.eventId) ??
      byTeams.get(normalizeTeams(game.home, game.away)) ??
      null
    );
  };

  return { resolve };
}
