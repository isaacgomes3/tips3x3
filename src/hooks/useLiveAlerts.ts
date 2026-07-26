"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FavoriteMatch } from "@/lib/favorites";
import {
  playAlertSound,
  unlockAlertAudio,
  type AlertSoundKind,
} from "@/lib/alert-sound";

export type LiveToast = {
  id: string;
  kind: AlertSoundKind;
  title: string;
  body: string;
  at: number;
};

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
    status?: string;
  } | null;
  tradePlan?: {
    entryReady?: boolean;
  };
  confirmed?: boolean;
};

function parseGoals(scoreLabel?: string | null): number | null {
  if (!scoreLabel) return null;
  const m = scoreLabel.match(/^(\d+)\s*[-–:]\s*(\d+)$/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]);
}

function matchName(
  favorites: FavoriteMatch[],
  row: LiveScoreRow,
): string {
  const fav = favorites.find((f) => f.eventId === row.analysis.eventId);
  if (fav) return `${fav.home} vs ${fav.away}`;
  return (
    row.analysis.eventName ||
    `${row.analysis.home ?? "?"} vs ${row.analysis.away ?? "?"}`
  );
}

function isFinishedStatus(status?: string | null) {
  if (!status) return false;
  return /^(FT|FINISHED|ENDED|COMPLETE|FullTime|FINAL)/i.test(status.trim()) ||
    /final|encerrado|ended|finished|full.?time/i.test(status);
}

function browserNotify(opts: { title: string; body: string; tag: string }) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
    });
    window.setTimeout(() => n.close(), 14_000);
  } catch {
    // ignore
  }
}

/**
 * Alertas mobile/desktop: gol e fim de jogo em favoritos;
 * indicação ENTRAR em qualquer partida monitorada.
 * Mostra toast na tela + som + Notification (se permitido).
 */
export function useLiveAlerts(
  favorites: FavoriteMatch[],
  liveRows: LiveScoreRow[] | undefined,
) {
  const [toasts, setToasts] = useState<LiveToast[]>([]);
  const lastScoreRef = useRef<Map<string, string>>(new Map());
  const lastStatusRef = useRef<Map<string, string>>(new Map());
  const lastEntryRef = useRef<Map<string, boolean>>(new Map());
  const seenLiveFavRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);
  const ftNotifiedRef = useRef<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const pushAlert = useCallback(
    (opts: {
      kind: AlertSoundKind;
      title: string;
      body: string;
      tag: string;
    }) => {
      const toast: LiveToast = {
        id: opts.tag,
        kind: opts.kind,
        title: opts.title,
        body: opts.body,
        at: Date.now(),
      };
      setToasts((list) => {
        const without = list.filter((t) => t.id !== toast.id);
        return [toast, ...without].slice(0, 5);
      });
      void playAlertSound(opts.kind);
      browserNotify({
        title: opts.title,
        body: opts.body,
        tag: opts.tag,
      });
      window.setTimeout(() => {
        setToasts((list) => list.filter((t) => t.id !== toast.id));
      }, 12_000);
    },
    [],
  );

  // Desbloqueia áudio no primeiro toque (necessário no iOS/Android)
  useEffect(() => {
    const unlock = () => {
      void unlockAlertAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const favIds = new Set(
      favorites.filter((f) => f.notifyGoals).map((f) => f.eventId),
    );
    const rows = liveRows ?? [];
    const liveIds = new Set(rows.map((r) => r.analysis.eventId));

    // ——— Fim de jogo: favorito sumiu do feed live após ter sido visto ———
    if (primedRef.current) {
      for (const id of seenLiveFavRef.current) {
        if (!favIds.has(id)) continue;
        if (liveIds.has(id)) continue;
        if (ftNotifiedRef.current.has(id)) continue;
        ftNotifiedRef.current.add(id);
        const fav = favorites.find((f) => f.eventId === id);
        const name = fav ? `${fav.home} vs ${fav.away}` : "Favorito";
        const lastScore = lastScoreRef.current.get(id);
        pushAlert({
          kind: "ft",
          title: `Fim de jogo · ${name}`,
          body: lastScore ? `Placar final ${lastScore}` : "Partida encerrada",
          tag: `tips3x3-ft-${id}`,
        });
      }
    }

    for (const row of rows) {
      const id = row.analysis.eventId;
      const name = matchName(favorites, row);
      const label = row.live?.scoreLabel;
      const status = row.live?.status ?? "";
      const isFav = favIds.has(id);

      if (isFav && label) {
        seenLiveFavRef.current.add(id);
      }

      // ——— Gol em favorito ———
      if (isFav && label) {
        const prev = lastScoreRef.current.get(id);
        lastScoreRef.current.set(id, label);
        if (primedRef.current && prev && prev !== label) {
          const prevGoals = parseGoals(prev);
          const nextGoals = parseGoals(label);
          if (
            prevGoals != null &&
            nextGoals != null &&
            nextGoals > prevGoals
          ) {
            const minute =
              row.live?.minute != null
                ? ` · ${Math.floor(row.live.minute)}′`
                : "";
            pushAlert({
              kind: "goal",
              title: `Gol · ${name}`,
              body: `${prev} → ${label}${minute}`,
              tag: `tips3x3-goal-${id}-${label}`,
            });
          }
        }
      }

      // ——— Fim de jogo via status ———
      if (isFav) {
        const prevStatus = lastStatusRef.current.get(id);
        if (status) lastStatusRef.current.set(id, status);
        if (
          primedRef.current &&
          !ftNotifiedRef.current.has(id) &&
          isFinishedStatus(status) &&
          !isFinishedStatus(prevStatus)
        ) {
          ftNotifiedRef.current.add(id);
          pushAlert({
            kind: "ft",
            title: `Fim de jogo · ${name}`,
            body: label ? `Placar final ${label}` : status,
            tag: `tips3x3-ft-${id}`,
          });
        }
      }

      // ——— ENTRAR (qualquer partida monitorada) ———
      const ready = Boolean(row.tradePlan?.entryReady || row.confirmed);
      const wasReady = lastEntryRef.current.get(id) ?? false;
      lastEntryRef.current.set(id, ready);
      if (primedRef.current && ready && !wasReady) {
        const minute =
          row.live?.minute != null ? ` @ ${Math.floor(row.live.minute)}′` : "";
        pushAlert({
          kind: "enter",
          title: `ENTRAR · ${name}`,
          body: label
            ? `Indicação de entrada · ${label}${minute}`
            : `Indicação de entrada${minute}`,
          tag: `tips3x3-enter-${id}`,
        });
      }
    }

    primedRef.current = true;
  }, [favorites, liveRows, pushAlert]);

  return { toasts, dismiss };
}
