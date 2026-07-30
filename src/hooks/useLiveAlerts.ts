"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FavoriteMatch } from "@/lib/favorites";
import {
  playAlertSound,
  unlockAlertAudio,
  isAlertAudioUnlocked,
  type AlertSoundKind,
} from "@/lib/alert-sound";
import {
  initNativeAlerts,
  isNativeApp,
  nativeNotify,
} from "@/lib/native-alerts";
import {
  clearExtAutoEntryDispatched,
  dispatchExtAutoEntry,
  dispatchExtMatchFinished,
  dispatchExtScoreUpdate,
  hasExtAutoEntryBeenDispatched,
  isExtAutoSendEnabled,
  markExtAutoEntryDispatched,
  qovSelectionLabel,
  setExtAutoSendEnabled,
} from "@/lib/bolsa-bridge";
import { isFinishedStatus } from "@/lib/live-status";

export type LiveToast = {
  id: string;
  kind: AlertSoundKind;
  title: string;
  body: string;
  at: number;
};

type QovSnap = {
  entryReady?: boolean;
  settled?: boolean;
  side?: "lay" | "back";
  underdogSide?: "home" | "away" | null;
  favoriteSide?: "home" | "away" | null;
  entryOdds?: number | null;
  layOdds?: number | null;
  backOdds?: number | null;
  marketId?: string;
  runnerId?: string;
  summary?: string;
};

type EventosRarosSnap = {
  entryReady?: boolean;
  settled?: boolean;
  layOdds?: number | null;
  scoreLabel?: string | null;
  scoreLabels?: string[];
  entries?: Array<{
    label: string;
    layOdds: number;
    runnerId?: string;
    marketId?: string;
    entryReady?: boolean;
  }>;
  marketId?: string;
  runnerId?: string;
  summary?: string;
};

type LiveScoreRow = {
  analysis: {
    eventId: string;
    home?: string;
    away?: string;
    eventName?: string;
    layOdds?: number | null;
    marketId?: string;
    runnerId?: string;
  };
  live?: {
    scoreLabel?: string;
    minute?: number | null;
    status?: string;
  } | null;
  tradePlan?: {
    entryReady?: boolean;
    layOdds?: number | null;
  };
  qovLayUnderdog?: QovSnap;
  eventosRaros?: EventosRarosSnap;
  confirmed?: boolean;
  mexchangeUrl?: string;
  qovMexchangeUrl?: string;
  eventosRarosMexchangeUrl?: string;
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
  const [extAutoSend, setExtAutoSendState] = useState(false);
  const lastScoreRef = useRef<Map<string, string>>(new Map());
  const lastStatusRef = useRef<Map<string, string>>(new Map());
  const enterNotifiedRef = useRef<Set<string>>(new Set());
  /** Memoriza a transição do sinal para evitar reenvio enquanto permanece pronto. */
  const entryReadyPrevRef = useRef<Map<string, boolean>>(new Map());
  const seenLiveFavRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);
  const ftNotifiedRef = useRef<Set<string>>(new Set());
  const finishedSentRef = useRef<Set<string>>(new Set());
  const autoSentRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setExtAutoSendState(isExtAutoSendEnabled());
  }, []);

  const setExtAutoSend = useCallback((on: boolean) => {
    setExtAutoSendEnabled(on);
    setExtAutoSendState(on);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const sendToExtension = useCallback(
    (
      row: LiveScoreRow,
      opts: {
        score: string;
        layOdds: number;
        marketId?: string;
        runnerId?: string;
        mexchangeUrl?: string;
        exitMode?: "hold" | "green";
        dedupeKey: string;
      },
    ): boolean => {
      if (!isExtAutoSendEnabled()) return false;
      const id = row.analysis.eventId;
      if (!id || !(opts.layOdds > 1.01)) return false;
      if (autoSentRef.current.has(opts.dedupeKey)) return false;
      autoSentRef.current.add(opts.dedupeKey);
      const ok = dispatchExtAutoEntry({
        eventId: id,
        eventName:
          row.analysis.eventName ||
          `${row.analysis.home ?? "?"} vs ${row.analysis.away ?? "?"}`,
        score: opts.score,
        layOdds: opts.layOdds,
        marketId: opts.marketId,
        runnerId: opts.runnerId,
        mexchangeUrl: opts.mexchangeUrl || row.mexchangeUrl,
        exitMode: opts.exitMode,
        dedupeKey: opts.dedupeKey,
      });
      if (ok) {
        markExtAutoEntryDispatched(opts.dedupeKey);
      } else {
        autoSentRef.current.delete(opts.dedupeKey);
      }
      return ok;
    },
    [],
  );

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
      void nativeNotify({
        kind: opts.kind,
        title: opts.title,
        body: opts.body,
        tag: opts.tag,
      }).then((sent) => {
        if (!sent) {
          browserNotify({
            title: opts.title,
            body: opts.body,
            tag: opts.tag,
          });
        }
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
    // Pedir permissão só no gesto do usuário (evita freeze no boot do APK).
    if (isNativeApp()) await initNativeAlerts({ requestPermission: true });
    setAlertsArmed(
      isAlertAudioUnlocked() ||
        isNativeApp() ||
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
    if (isNativeApp()) {
      void initNativeAlerts({ requestPermission: false }).then((ok) => {
        if (ok) setAlertsArmed(true);
      });
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

    const shouldFireEnter = (key: string, ready: boolean): boolean => {
      const prev = entryReadyPrevRef.current.get(key);
      entryReadyPrevRef.current.set(key, ready);
      if (!ready) {
        enterNotifiedRef.current.delete(key);
        autoSentRef.current.delete(key);
        clearExtAutoEntryDispatched(key);
        return false;
      }
      // Uma entrada que já estava pronta ao abrir o painel também precisa ser
      // entregue. A marca da sessão evita reenviá-la a cada recarga.
      if (hasExtAutoEntryBeenDispatched(key)) return false;
      // Se a extensão estava desligada quando o sinal apareceu, reavalia na
      // próxima atualização após ela ser ativada.
      if (prev === true && !isExtAutoSendEnabled()) return false;
      return true;
    };

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
      const entryKeys = [
        `${id}:lay-3x3`,
        `${id}:qov-lay-zebra`,
        `${id}:eventos-raros`,
      ];
      // Multi-placar: limpa também chaves por score
      for (const key of [...enterNotifiedRef.current]) {
        if (key.startsWith(`${id}:eventos-raros`)) {
          entryKeys.push(key);
        }
      }

      if (isFav && label) {
        seenLiveFavRef.current.add(id);
      }

      if (isFav && label) {
        const prev = lastScoreRef.current.get(id);
        lastScoreRef.current.set(id, label);
        if (primed && prev !== label) {
          dispatchExtScoreUpdate({
            eventId: id,
            score: label,
            eventName: name,
          });
        }
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

      if (isFinishedStatus(status)) {
        for (const key of entryKeys) {
          entryReadyPrevRef.current.set(key, false);
          enterNotifiedRef.current.delete(key);
          autoSentRef.current.delete(key);
          clearExtAutoEntryDispatched(key);
        }
        if (!finishedSentRef.current.has(id)) {
          finishedSentRef.current.add(id);
          dispatchExtMatchFinished({ eventId: id, score: label, status });
        }
        continue;
      }

      // ENTRAR Lay 3-3 — apenas pelo gate estrito do plano.
      const layEntryKey = `${id}:lay-3x3`;
      const layReady = Boolean(row.tradePlan?.entryReady);
      if (shouldFireEnter(layEntryKey, layReady)) {
        enterNotifiedRef.current.add(layEntryKey);
        const minute =
          row.live?.minute != null
            ? ` @ ${Math.floor(row.live.minute)}′`
            : "";
        const layOdds = Number(
          row.tradePlan?.layOdds ?? row.analysis.layOdds ?? 0,
        );
        pushAlert({
          kind: "enter",
          title: `ENTRAR · ${name}`,
          body: label
            ? `Indicação de entrada · ${label}${minute}${layOdds > 1 ? ` · lay x${layOdds}` : ""}`
            : `Indicação de entrada${minute}${layOdds > 1 ? ` · lay x${layOdds}` : ""}`,
          tag: `tips3x3-enter-${id}-${Date.now()}`,
        });
        sendToExtension(row, {
          score: "3-3",
          layOdds,
          marketId: row.analysis.marketId,
          runnerId: row.analysis.runnerId,
          mexchangeUrl: row.mexchangeUrl,
          dedupeKey: layEntryKey,
        });
      }

      // ENTRAR Lay QOV zebra (auto-extensão).
      const qovLayKey = `${id}:qov-lay-zebra`;
      const qovLay = row.qovLayUnderdog;
      const qovLayReady = Boolean(qovLay?.entryReady && !qovLay?.settled);
      if (shouldFireEnter(qovLayKey, qovLayReady)) {
        enterNotifiedRef.current.add(qovLayKey);
        const minute =
          row.live?.minute != null
            ? ` @ ${Math.floor(row.live.minute)}′`
            : "";
        const entryOdds = Number(qovLay?.entryOdds ?? qovLay?.layOdds ?? 0);
        const dogSide = qovLay?.underdogSide === "away" ? "away" : "home";
        pushAlert({
          kind: "enter",
          title: `ENTRAR · LAY QOV ZEBRA · ${name}`,
          body: label
            ? `${label}${minute}${entryOdds > 1 ? ` · lay x${entryOdds}` : ""}`
            : `Indicação Lay QOV${minute}${entryOdds > 1 ? ` · lay x${entryOdds}` : ""}`,
          tag: `tips3x3-enter-qov-lay-${id}-${Date.now()}`,
        });
        sendToExtension(row, {
          score: qovSelectionLabel(dogSide),
          layOdds: entryOdds,
          marketId: qovLay?.marketId,
          runnerId: qovLay?.runnerId,
          mexchangeUrl: row.qovMexchangeUrl ?? row.mexchangeUrl,
          dedupeKey: qovLayKey,
        });
      }

      // ENTRAR Eventos raros — auto-entry por placar (multi-lay CS / mesmo saldo).
      const er = row.eventosRaros;
      const erEntries =
        er?.entries?.filter((e) => e.entryReady !== false) ??
        (er?.entryReady && er.scoreLabel
          ? [
              {
                label: er.scoreLabel,
                layOdds: Number(er.layOdds ?? 0),
                runnerId: er.runnerId,
                marketId: er.marketId,
              },
            ]
          : []);
      const erLabelsSeen = new Set<string>();
      for (const entry of erEntries) {
        const score = entry.label;
        if (!score || erLabelsSeen.has(score)) continue;
        erLabelsSeen.add(score);
        const erKey = `${id}:eventos-raros:${score}`;
        const erReady = Boolean(er?.entryReady && !er?.settled);
        if (!shouldFireEnter(erKey, erReady)) continue;
        enterNotifiedRef.current.add(erKey);
        const minute =
          row.live?.minute != null
            ? ` @ ${Math.floor(row.live.minute)}′`
            : "";
        const entryOdds = Number(entry.layOdds ?? 0);
        const multiHint =
          erEntries.length > 1
            ? ` · ${erEntries.length} placares no evento`
            : "";
        pushAlert({
          kind: "enter",
          title: `ENTRAR · EVENTOS RAROS · ${score} · ${name}`,
          body: label
            ? `${label}${minute} · lay ${score} x${entryOdds > 1 ? entryOdds : "?"} · hold${multiHint}`
            : `Lay ${score}${minute}${entryOdds > 1 ? ` · x${entryOdds}` : ""} · hold${multiHint}`,
          tag: `tips3x3-enter-er-${id}-${score}-${Date.now()}`,
        });
        sendToExtension(row, {
          score,
          layOdds: entryOdds,
          marketId: entry.marketId ?? er?.marketId,
          runnerId: entry.runnerId,
          mexchangeUrl: row.eventosRarosMexchangeUrl ?? row.mexchangeUrl,
          exitMode: "hold",
          dedupeKey: erKey,
        });
      }
      // Limpa chaves de placares que saíram do setup
      const activeErKeys = new Set(
        erEntries.map((e) => `${id}:eventos-raros:${e.label}`),
      );
      for (const key of [...enterNotifiedRef.current]) {
        if (
          key.startsWith(`${id}:eventos-raros:`) &&
          !activeErKeys.has(key)
        ) {
          enterNotifiedRef.current.delete(key);
          entryReadyPrevRef.current.set(key, false);
          autoSentRef.current.delete(key);
          clearExtAutoEntryDispatched(key);
        }
      }
    }

    primedRef.current = true;
  }, [extAutoSend, favorites, liveRows, pushAlert, sendToExtension]);

  // Revalida quando o celular volta à tela — só flanco novo (não reenvia sinal antigo)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      void unlockAlertAudio();
      if (!primedRef.current) return;
      const rows = liveRows ?? [];
      for (const row of rows) {
        const id = row.analysis.eventId;
        if (isFinishedStatus(row.live?.status)) continue;
        const layEntryKey = `${id}:lay-3x3`;
        const layReady = Boolean(row.tradePlan?.entryReady);
        const layPrev = entryReadyPrevRef.current.get(layEntryKey);
        entryReadyPrevRef.current.set(layEntryKey, layReady);
        if (
          layReady &&
          layPrev !== true &&
          !enterNotifiedRef.current.has(layEntryKey) &&
          !hasExtAutoEntryBeenDispatched(layEntryKey)
        ) {
          enterNotifiedRef.current.add(layEntryKey);
          const name = matchName(favorites, row);
          const label = row.live?.scoreLabel;
          const layOdds = Number(
            row.tradePlan?.layOdds ?? row.analysis.layOdds ?? 0,
          );
          pushAlert({
            kind: "enter",
            title: `ENTRAR · ${name}`,
            body: label
              ? `Indicação de entrada · ${label}`
              : "Indicação de entrada",
            tag: `tips3x3-enter-${id}-vis`,
          });
          sendToExtension(row, {
            score: "3-3",
            layOdds,
            marketId: row.analysis.marketId,
            runnerId: row.analysis.runnerId,
            mexchangeUrl: row.mexchangeUrl,
            dedupeKey: layEntryKey,
          });
        }

        const er = row.eventosRaros;
        const erEntries =
          er?.entries?.filter((e) => e.entryReady !== false) ?? [];
        for (const entry of erEntries) {
          const score = entry.label;
          if (!score) continue;
          const erKey = `${id}:eventos-raros:${score}`;
          const erReady = Boolean(er?.entryReady && !er?.settled);
          const erPrev = entryReadyPrevRef.current.get(erKey);
          entryReadyPrevRef.current.set(erKey, erReady);
          if (
            !erReady ||
            erPrev === true ||
            enterNotifiedRef.current.has(erKey) ||
            hasExtAutoEntryBeenDispatched(erKey)
          ) {
            continue;
          }
          enterNotifiedRef.current.add(erKey);
          const name = matchName(favorites, row);
          const label = row.live?.scoreLabel;
          const entryOdds = Number(entry.layOdds ?? 0);
          pushAlert({
            kind: "enter",
            title: `ENTRAR · EVENTOS RAROS · ${score} · ${name}`,
            body: label
              ? `${label} · lay ${score} · hold`
              : `Lay ${score} · hold`,
            tag: `tips3x3-enter-er-${id}-${score}-vis`,
          });
          sendToExtension(row, {
            score,
            layOdds: entryOdds,
            marketId: entry.marketId ?? er?.marketId,
            runnerId: entry.runnerId,
            mexchangeUrl: row.eventosRarosMexchangeUrl ?? row.mexchangeUrl,
            exitMode: "hold",
            dedupeKey: erKey,
          });
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [favorites, liveRows, pushAlert, sendToExtension]);

  return {
    toasts,
    dismiss,
    alertsArmed,
    armAlerts,
    extAutoSend,
    setExtAutoSend,
  };
}
