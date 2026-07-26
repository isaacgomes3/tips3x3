const STORAGE_KEY = "tips3x3.favorites.v1";

export type FavoriteMatch = {
  eventId: string;
  home: string;
  away: string;
  competition?: string;
  addedAt: number;
  /** Notificações de gol (padrão: true ao favoritar). */
  notifyGoals: boolean;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadFavorites(): FavoriteMatch[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FavoriteMatch[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f) => f && typeof f.eventId === "string");
  } catch {
    return [];
  }
}

export function saveFavorites(list: FavoriteMatch[]) {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function upsertFavorite(
  list: FavoriteMatch[],
  entry: Omit<FavoriteMatch, "addedAt" | "notifyGoals"> & {
    notifyGoals?: boolean;
  },
): FavoriteMatch[] {
  const without = list.filter((f) => f.eventId !== entry.eventId);
  return [
    {
      eventId: entry.eventId,
      home: entry.home,
      away: entry.away,
      competition: entry.competition,
      addedAt: Date.now(),
      notifyGoals: entry.notifyGoals ?? true,
    },
    ...without,
  ];
}

export function removeFavorite(list: FavoriteMatch[], eventId: string) {
  return list.filter((f) => f.eventId !== eventId);
}

export function isFavorite(list: FavoriteMatch[], eventId: string) {
  return list.some((f) => f.eventId === eventId);
}
