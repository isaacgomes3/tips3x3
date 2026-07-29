"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isFavorite,
  loadFavorites,
  pruneFavorites,
  removeFavorite,
  saveFavorites,
  upsertFavorite,
  type FavoriteMatch,
} from "@/lib/favorites";
import { isFinishedStatus } from "@/lib/live-status";

async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

type LiveFavoriteRow = {
  analysis: { eventId: string };
  live?: { status?: string | null } | null;
};

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteMatch[]>([]);
  const [ready, setReady] = useState(false);
  const seenLiveRef = useRef(new Set<string>());

  useEffect(() => {
    setFavorites(loadFavorites());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveFavorites(favorites);
  }, [favorites, ready]);

  const favoriteIds = useMemo(
    () => new Set(favorites.map((f) => f.eventId)),
    [favorites],
  );

  const toggleFavorite = useCallback(
    async (entry: {
      eventId: string;
      home: string;
      away: string;
      competition?: string;
      start?: string;
    }) => {
      let added = false;
      const currentlyOn = favoriteIds.has(entry.eventId);
      if (!currentlyOn) {
        await ensureNotifyPermission();
        added = true;
      }
      setFavorites((prev) => {
        if (isFavorite(prev, entry.eventId)) {
          seenLiveRef.current.delete(entry.eventId);
          return removeFavorite(prev, entry.eventId);
        }
        const allowed =
          typeof Notification !== "undefined" &&
          Notification.permission === "granted";
        return upsertFavorite(prev, {
          ...entry,
          notifyGoals: allowed || Notification.permission !== "denied",
        });
      });
      return added;
    },
    [favoriteIds],
  );

  const checkFavorite = useCallback(
    (eventId: string) => favoriteIds.has(eventId),
    [favoriteIds],
  );

  /** Remove favoritos com FT / sumidos do live / expirados / órfãos do feed. */
  const reconcileWithLive = useCallback(
    (
      liveRows?: LiveFavoriteRow[] | null,
      activeIds?: Set<string> | null,
    ) => {
      if (!ready) return;
      const rows = liveRows ?? [];
      const liveIds = new Set(rows.map((r) => r.analysis.eventId));
      const finishedIds = new Set<string>();

      for (const row of rows) {
        const id = row.analysis.eventId;
        if (row.live) seenLiveRef.current.add(id);
        if (isFinishedStatus(row.live?.status)) finishedIds.add(id);
      }

      setFavorites((prev) => {
        const next = pruneFavorites(prev, {
          liveIds,
          finishedIds,
          seenLiveIds: seenLiveRef.current,
          activeIds,
        });
        if (next.length === prev.length) return prev;
        for (const id of [...seenLiveRef.current]) {
          if (!next.some((f) => f.eventId === id)) {
            seenLiveRef.current.delete(id);
          }
        }
        return next;
      });
    },
    [ready],
  );

  return {
    favorites,
    favoriteIds,
    ready,
    toggleFavorite,
    isFavorite: checkFavorite,
    reconcileWithLive,
  };
}
