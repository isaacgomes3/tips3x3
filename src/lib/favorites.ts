const STORAGE_KEY = "tips3x3.favorites.v1";

export type FavoriteMatch = {
  eventId: string;
  home: string;
  away: string;
  competition?: string;
  /** Kickoff ISO — usado para limpar favoritos após o jogo. */
  start?: string;
  addedAt: number;
  /** Notificações de gol (padrão: true ao favoritar). */
  notifyGoals: boolean;
};

/** Janela após o kickoff em que o favorito ainda é considerado ativo. */
export const FAVORITE_TTL_AFTER_KICKOFF_MS = 4 * 60 * 60_000;
/** Fallback se não houver `start` gravado. */
export const FAVORITE_TTL_AFTER_ADDED_MS = 12 * 60 * 60_000;

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
      start: entry.start,
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

export function isFavoriteExpired(
  fav: FavoriteMatch,
  now = Date.now(),
): boolean {
  if (fav.start) {
    const kickoff = Date.parse(fav.start);
    if (Number.isFinite(kickoff)) {
      return now > kickoff + FAVORITE_TTL_AFTER_KICKOFF_MS;
    }
  }
  return now > fav.addedAt + FAVORITE_TTL_AFTER_ADDED_MS;
}

/**
 * Remove favoritos finalizados / fora do live / expirados.
 * Mantém pré-live e jogos ainda presentes em `liveIds` (ou em `activeIds`).
 */
export function pruneFavorites(
  list: FavoriteMatch[],
  opts: {
    liveIds: Set<string>;
    finishedIds: Set<string>;
    seenLiveIds: Set<string>;
    /** live ∪ oportunidades — quando definido, remove favoritos órfãos. */
    activeIds?: Set<string> | null;
    now?: number;
  },
): FavoriteMatch[] {
  const now = opts.now ?? Date.now();
  return list.filter((fav) => {
    if (opts.finishedIds.has(fav.eventId)) return false;
    if (opts.liveIds.has(fav.eventId)) return true;
    if (opts.seenLiveIds.has(fav.eventId)) return false;

    if (opts.activeIds && !opts.activeIds.has(fav.eventId)) {
      return false;
    }

    if (fav.start) {
      const kickoff = Date.parse(fav.start);
      // Já passou o kickoff e sumiu do live → partida encerrada / removida do feed
      if (Number.isFinite(kickoff) && now > kickoff + 15 * 60_000) {
        return false;
      }
    }

    if (isFavoriteExpired(fav, now)) return false;
    return true;
  });
}
