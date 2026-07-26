"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isFavorite,
  loadFavorites,
  removeFavorite,
  saveFavorites,
  upsertFavorite,
  type FavoriteMatch,
} from "@/lib/favorites";

async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteMatch[]>([]);
  const [ready, setReady] = useState(false);

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
    }) => {
      let added = false;
      const currentlyOn = favoriteIds.has(entry.eventId);
      if (!currentlyOn) {
        await ensureNotifyPermission();
        added = true;
      }
      setFavorites((prev) => {
        if (isFavorite(prev, entry.eventId)) {
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

  return {
    favorites,
    favoriteIds,
    ready,
    toggleFavorite,
    isFavorite: checkFavorite,
  };
}
