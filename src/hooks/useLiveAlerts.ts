"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FavoriteMatch } from "@/lib/favorites";
import {
  playAlertSound,
  unlockAlertAudio,
  isAlertAudioUnlocked,
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

function matchName(favorites: FavoriteMatch[], row: LiveScoreRow): string {
  const fav = favorites.find((f) => f.eventId === row.analysis.eventId);
  if (fav) return `${fav.home} vs ${fav.away}`;
  return (
    row.analysis.eventName ||
    `${row.analysis.home ?? "?"} vs ${row.analysis.away ?? "?"}`
  );
}

function isFinishedStatus(status?: string | null) {
  if (!status) return false;
  return (
    /^(FT|FINISHED|ENDED|COMPLETE|FullTime|FINAL)/i.test(status.trim()) ||
    /final|encerrado|ended|finished|full.?time/i.test(status)
  );
}

async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

function browserNotify(opts: { title: string; body: string; tag: string }) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
    });
    window.setTimeout(() => n.close(), 16_000);
  } catch {
    // ignore
  }
}

function vibrateEnter() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([80, 40, 80, 40, 160]);
    }
  } catch {
    // ignore
  }
}

/**
 * Alertas mobile/desktop: gol/FT em favoritos + ENTRAR em qualquer monitorado.
 */
export function useLiveAlerts(
  favorites: FavoriteMatch[],
  liveRows: LiveScoreRow[] | undefined,
) {
  const [toasts, setToasts] = useState<LiveToast[]>([]);
  const [alertsArmed, setAlertsArmed] = useState(false);
  const lastScoreRef = useRef<Map<string, string>>(new Map());
  const lastStatusRef = useRef<Map<string, string>>(new Map());
  const enterNotifiedRef = useRef<Set<string>>(new Set());
  const seenLiveFavRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);
  const ftNotifiedRef = useRef<Set<string>>(new Set());
  const bootAtRef = useRef(Date.now());

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
      if (opts.kind === "enter") vibrateEnter();
      browserNotify({
        title: opts.title,
        body: opts.body,
        tag: opts.tag,
      });
      window.setTimeout(() => {
        setToasts((list) => list.filter((t) => t.id !== toast.id));
      }, opts.kind === "enter" ? 20_000 : 12_000);
    },
    [],
  );

  const armAlerts = useCallback(async () => {
    await unlockAlertAudio();
    await ensureNotifyPermission();
    setAlertsArmed(
      isAlertAudioUnlocked() ||
        (typeof Notification !== "undefined" &&
          Notification.permission === "granted"),
    );
  }, []);

  useEffect(() => {
    const unlock = () => {
      void unlockAlertAudio().then(() => {
        if (isAlertAudioUnlocked()) setAlertsArmed(true);
      });
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      setAlertsArmed(true);
    }
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
    const primed = primedRef.current;
    // Após ~1.2s do boot, já alerta ENTRAR mesmo se já estava pronto no 1º poll
    const warm =
      primed || Date.now() - bootAtRef.current > 1200 || rows.length > 0;

    if (primed) {
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

      if (isFav && label) {
        const prev = lastScoreRef.current.get(id);
        lastScoreRef.current.set(id, label);
        if (primed && prev && prev !== label) {
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

      if (isFav) {
        const prevStatus = lastStatusRef.current.get(id);
        if (status) lastStatusRef.current.set(id, status);
        if (
          primed &&
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

      // ENTRAR — alerta na 1ª vez que fica pronto (e de novo se sair e voltar)
      const ready = Boolean(row.tradePlan?.entryReady || row.confirmed);
      if (ready) {
        if (warm && !enterNotifiedRef.current.has(id)) {
          enterNotifiedRef.current.add(id);
          const minute =
            row.live?.minute != null
              ? ` @ ${Math.floor(row.live.minute)}′`
              : "";
          pushAlert({
            kind: "enter",
            title: `ENTRAR · ${name}`,
            body: label
              ? `Indicação de entrada · ${label}${minute}`
              : `Indicação de entrada${minute}`,
            tag: `tips3x3-enter-${id}-${Date.now()}`,
          });
        }
      } else {
        enterNotifiedRef.current.delete(id);
      }
    }

    primedRef.current = true;
  }, [favorites, liveRows, pushAlert]);

  // Revalida quando o celular volta à tela
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      void unlockAlertAudio();
      const rows = liveRows ?? [];
      for (const row of rows) {
        const ready = Boolean(row.tradePlan?.entryReady || row.confirmed);
        const id = row.analysis.eventId;
        if (ready && !enterNotifiedRef.current.has(id)) {
          enterNotifiedRef.current.add(id);
          const name = matchName(favorites, row);
          const label = row.live?.scoreLabel;
          pushAlert({
            kind: "enter",
            title: `ENTRAR · ${name}`,
            body: label
              ? `Indicação de entrada · ${label}`
              : "Indicação de entrada",
            tag: `tips3x3-enter-${id}-vis`,
          });
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [favorites, liveRows, pushAlert]);

  return { toasts, dismiss, alertsArmed, armAlerts };
}
