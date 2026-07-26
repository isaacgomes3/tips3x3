"use client";

import { useEffect, useRef } from "react";
import type { FavoriteMatch } from "@/lib/favorites";

type LiveScoreRow = {
  analysis: {
    eventId: string;
    home?: string;
    away?: string;
    eventName?: string;
  };
  live?: {
    scoreLabel?: string;
    minute?: number | null;
    homeScore?: number;
    awayScore?: number;
    totalGoals?: number;
  } | null;
};

function parseGoals(scoreLabel?: string | null): number | null {
  if (!scoreLabel) return null;
  const m = scoreLabel.match(/^(\d+)\s*[-–:]\s*(\d+)$/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]);
}

function notifyGoal(opts: {
  title: string;
  body: string;
  tag: string;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
    });
    window.setTimeout(() => n.close(), 12_000);
  } catch {
    // ignore (Safari private etc.)
  }
}

/**
 * Dispara Notification do browser quando um favorito marca gol
 * (placar sobe no feed live).
 */
export function useGoalNotifications(
  favorites: FavoriteMatch[],
  liveRows: LiveScoreRow[] | undefined,
) {
  const lastScoreRef = useRef<Map<string, string>>(new Map());
  const primedRef = useRef(false);

  useEffect(() => {
    const favIds = new Set(
      favorites.filter((f) => f.notifyGoals).map((f) => f.eventId),
    );
    if (!favIds.size || !liveRows?.length) return;

    const nextScores = new Map<string, string>();

    for (const row of liveRows) {
      const id = row.analysis.eventId;
      if (!favIds.has(id)) continue;
      const label = row.live?.scoreLabel;
      if (!label) continue;
      nextScores.set(id, label);

      const prev = lastScoreRef.current.get(id);
      if (!primedRef.current) continue;
      if (!prev || prev === label) continue;

      const prevGoals = parseGoals(prev);
      const nextGoals = parseGoals(label);
      if (prevGoals == null || nextGoals == null || nextGoals <= prevGoals) {
        continue;
      }

      const fav = favorites.find((f) => f.eventId === id);
      const name =
        fav != null
          ? `${fav.home} vs ${fav.away}`
          : row.analysis.eventName || `${row.analysis.home} vs ${row.analysis.away}`;
      const minute =
        row.live?.minute != null ? ` · ${Math.floor(row.live.minute)}′` : "";

      notifyGoal({
        title: `Gol · ${name}`,
        body: `${prev} → ${label}${minute}`,
        tag: `tips3x3-goal-${id}-${label}`,
      });
    }

    // atualiza mapa (mantém scores de favoritos que saíram do live)
    for (const [id, label] of nextScores) {
      lastScoreRef.current.set(id, label);
    }
    primedRef.current = true;
  }, [favorites, liveRows]);
}
