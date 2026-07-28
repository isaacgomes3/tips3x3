"use client";

import { useEffect, useMemo, useState } from "react";

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

function isLikelyLive(status: unknown, minute: number | null) {
  if (minute != null && minute >= 0 && minute <= 130) return true;
  const s = String(status ?? "").toLowerCase();
  return /live|vivo|1st|2nd|ht|half|minuto|['′]/.test(s);
}

function needsEnrichment(
  game: GameRef,
  hasBetbraLive: boolean,
): boolean {
  if (hasBetbraLive) return false;
  const start = Date.parse(game.start);
  if (!Number.isFinite(start)) return false;
  const now = Date.now();
  return start <= now + 8 * 60_000 && start >= now - 4 * 60 * 60_000;
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

  const pending = useMemo(() => {
    return games
      .filter((g) => needsEnrichment(g, hasBetbraLive(g.eventId)))
      .slice(0, 10);
  }, [games, hasBetbraLive]);

  useEffect(() => {
    if (!pending.length) return;

    let cancelled = false;

    const load = async () => {
      for (const game of pending) {
        if (cancelled) break;
        try {
          const qs = new URLSearchParams({
            home: game.home,
            away: game.away,
          });
          if (game.eventId) qs.set("eventId", game.eventId);
          if (game.start) qs.set("start", game.start);
          const res = await fetch(`/api/match-stats?${qs.toString()}`);
          if (!res.ok) continue;
          const json = (await res.json()) as {
            scoreLabel?: string | null;
            minute?: string | number | null;
            status?: string | null;
          };
          const minute = parseMinute(json.minute ?? json.status);
          if (!json.scoreLabel || !isLikelyLive(json.status, minute)) continue;

          const snap: EnrichedLiveSnapshot = {
            scoreLabel: json.scoreLabel.replace(/\s+/g, ""),
            minute,
            status: json.status ?? "Ao vivo",
          };

          setByEventId((prev) => new Map(prev).set(game.eventId, snap));
          setByTeams((prev) =>
            new Map(prev).set(normalizeTeams(game.home, game.away), snap),
          );
        } catch {
          /* ignore */
        }
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pending]);

  const resolve = (game: GameRef): EnrichedLiveSnapshot | null => {
    return (
      byEventId.get(game.eventId) ??
      byTeams.get(normalizeTeams(game.home, game.away)) ??
      null
    );
  };

  return { resolve };
}
