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
import { syncAutoLayBackground } from "@/lib/betbra/auto-lay-bg";
import {
  clearExtAutoEntryDispatched,
  dispatchExtAutoEntry,
  dispatchExtMatchFinished,
  dispatchExtScoreUpdate,
  hasExtAutoEntryBeenDispatched,
  isExtAutoSendEnabled,
  markExtAutoEntryDispatched,
  overSelectionLabel,
  qovSelectionLabel,
  setExtAutoSendEnabled,
  type Tips3x3EntryKind,
} from "@/lib/bolsa-bridge";
import { isFinishedStatus } from "@/lib/live-status";
import {
  getTargetProfitPctPoints,
  profitPointsToDecimal,
} from "@/lib/panel-settings";
import { getNotifyOnlyMatched } from "@/lib/notify-settings";
import { signalRank } from "@/lib/strategy-priority";

export type LiveToastStrategy =
  | "lay-3x3"
  | "eventos-raros"
  | "lucro-certo"
  | "qov"
  | "over-3.5"
  | "over-4.5"
  | "lay-over-limit-pressure";

export type LiveToast = {
  id: string;
  kind: AlertSoundKind;
  title: string;
  body: string;
  at: number;
  /** enter: lay-3x3 = verde; eventos-raros = gold */
  strategy?: LiveToastStrategy;
};

/** Execução pela extensão foi pausada enquanto o APK é o único executor. */
function isExtensionExecutionSuspended() {
  return true;
}

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
  exitPlan?: {
    exitOdds?: number | null;
    targetProfitPct?: number | null;
  } | null;
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
    alreadyImpossible?: boolean;
  }>;
  marketId?: string;
  runnerId?: string;
  summary?: string;
};

type OverSnap = {
  entryReady?: boolean;
  settled?: boolean;
  line?: number;
  layOdds?: number | null;
  marketId?: string;
  runnerId?: string;
  summary?: string;
  /** Cada linha de Over tem o seu mercado — o link vem no snapshot. */
  mexchangeUrl?: string;
  exitPlan?: {
    targetBackOdds?: number | null;
    targetProfitPct?: number | null;
  } | null;
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
    targetBackOdds?: number | null;
    targetProfitPct?: number;
  };
  qovLayUnderdog?: QovSnap;
  eventosRaros?: EventosRarosSnap;
  overLimite35?: OverSnap;
  overLimite45?: OverSnap;
  layOverLimitPressure?: OverSnap[];
  confirmed?: boolean;
  mexchangeUrl?: string;
  qovMexchangeUrl?: string;
  eventosRarosMexchangeUrl?: string;
  overMexchangeUrl35?: string;
  overMexchangeUrl45?: string;
  lolpMexchangeUrl?: string;
  homeScore?: number | null;
  awayScore?: number | null;
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

const MAX_TOASTS = 5;

function toastKindRank(kind: AlertSoundKind): number {
  if (kind === "enter") return 0;
  if (kind === "goal") return 1;
  return 2;
}

/**
 * Quando muitos sinais chegam juntos, quem sai da pilha é o menos importante —
 * gol/FT antes de ENTRAR e, entre ENTRAR, a estratégia de menor precedência.
 * Cortar pelo fim da lista descartava justamente o Lay 3x3.
 * A ordem de exibição continua do mais novo para o mais antigo.
 */
function trimToasts(list: LiveToast[]): LiveToast[] {
  if (list.length <= MAX_TOASTS) return list;
  const keep = new Set(
    [...list]
      .sort((a, b) => {
        const byKind = toastKindRank(a.kind) - toastKindRank(b.kind);
        if (byKind !== 0) return byKind;
        const byStrategy = signalRank(a.strategy) - signalRank(b.strategy);
        if (byStrategy !== 0) return byStrategy;
        return b.at - a.at;
      })
      .slice(0, MAX_TOASTS)
      .map((t) => t.id),
  );
  return list.filter((t) => keep.has(t.id));
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
  enabled = true,
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
    if (!enabled) return;
    setExtAutoSendState(isExtAutoSendEnabled());
    if (isNativeApp() && isExtAutoSendEnabled()) {
      void syncAutoLayBackground({ autoOn: true });
    }
  }, [enabled]);

  const setExtAutoSend = useCallback((on: boolean) => {
    setExtAutoSendEnabled(on);
    setExtAutoSendState(on);
    // Respeita filtros já desligados pelo utilizador — só sincroniza o estado atual.
    if (isNativeApp()) {
      if (on) {
        // Android 13+: pede a permissão no gesto do utilizador antes de
        // reiniciar o serviço persistente e sua notificação "Auto Lay ativo".
        void initNativeAlerts({ requestPermission: true }).then(() =>
          syncAutoLayBackground({ autoOn: true }),
        );
      } else {
        void syncAutoLayBackground({ autoOn: false });
      }
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const sendToExtension = useCallback(
    (
      row: LiveScoreRow,
      opts: {
        score: string;
        kind: Tips3x3EntryKind;
        layOdds: number;
        marketId?: string;
        runnerId?: string;
        mexchangeUrl?: string;
        exitMode?: "hold" | "green";
        targetBackOdds?: number;
        targetProfitPct?: number;
        dedupeKey: string;
      },
    ): boolean => {
      // A execução pela extensão foi suspensa. O APK continua enviando pelo
      // serviço nativo em segundo plano; este caminho nunca deve duplicá-lo.
      if (!enabled || isExtensionExecutionSuspended()) return false;
      if (!isExtAutoSendEnabled()) return false;
      const id = row.analysis.eventId;
      if (!id || !(opts.layOdds > 1.01)) return false;
      if (autoSentRef.current.has(opts.dedupeKey)) return false;
      // Reserva o slot; só marca sessão se a fila confirmar (senão re-tenta).
      autoSentRef.current.add(opts.dedupeKey);
      void dispatchExtAutoEntry({
        eventId: id,
        eventName:
          row.analysis.eventName ||
          `${row.analysis.home ?? "?"} vs ${row.analysis.away ?? "?"}`,
        score: opts.score,
        kind: opts.kind,
        home: row.analysis.home,
        away: row.analysis.away,
        minute: row.live?.minute ?? null,
        liveScore: row.live?.scoreLabel ?? null,
        layOdds: opts.layOdds,
        marketId: opts.marketId,
        runnerId: opts.runnerId,
        mexchangeUrl: opts.mexchangeUrl || row.mexchangeUrl,
        exitMode: opts.exitMode,
        targetBackOdds: opts.targetBackOdds,
        targetProfitPct: opts.targetProfitPct,
        dedupeKey: opts.dedupeKey,
      }).then((ok) => {
        if (ok) {
          markExtAutoEntryDispatched(opts.dedupeKey);
        } else {
          autoSentRef.current.delete(opts.dedupeKey);
          clearExtAutoEntryDispatched(opts.dedupeKey);
        }
      });
      return true;
    },
    [enabled],
  );

  const pushAlert = useCallback(
    (opts: {
      kind: AlertSoundKind;
      title: string;
      body: string;
      tag: string;
      strategy?: LiveToastStrategy;
    }) => {
      if (!enabled) return;
      const toast: LiveToast = {
        id: opts.tag,
        kind: opts.kind,
        title: opts.title,
        body: opts.body,
        at: Date.now(),
        strategy: opts.strategy,
      };
      // Modo "só matched": o toast/vibração continuam (feedback visual do
      // painel), mas a notificação (push/nativa) do sinal de entrada é
      // silenciada aqui — quem avisa é o gatilho de "Lay casado" no BetBra.
      const notifyOnlyMatched = getNotifyOnlyMatched();
      const suppressNotification = opts.kind === "enter" && notifyOnlyMatched;

      setToasts((list) => {
        const without = list.filter((t) => t.id !== toast.id);
        return trimToasts([toast, ...without]);
      });
      void playAlertSound(opts.kind);
      if (opts.kind === "enter") vibrateEnter();
      if (!suppressNotification) {
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
      }
      window.setTimeout(() => {
        setToasts((list) => list.filter((t) => t.id !== toast.id));
      }, opts.kind === "enter" ? 20_000 : 12_000);
    },
    [enabled],
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
    if (!enabled) return;
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
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
        // Avisa a extensão mesmo quando o favorito some do inplay sem status FT.
        if (!finishedSentRef.current.has(id)) {
          finishedSentRef.current.add(id);
          dispatchExtMatchFinished({
            eventId: id,
            score: lastScore || "",
            status: "FT",
          });
        }
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
        `${id}:over-3.5`,
        `${id}:over-4.5`,
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

      // ENTRAR Lay 3-3 — o alerta é sempre emitido; quem filtra execução é
      // o Auto Lay do app (prefs nativas) e a extensão (enabledMarkets).
      const layEntryKey = `${id}:lay-3x3`;
      const layReady = Boolean(row.tradePlan?.entryReady);
      if (shouldFireEnter(layEntryKey, layReady)) {
        const minute =
          row.live?.minute != null
            ? ` @ ${Math.floor(row.live.minute)}′`
            : "";
        const layOdds = Number(
          row.tradePlan?.layOdds ?? row.analysis.layOdds ?? 0,
        );
        const profitPct =
          row.tradePlan?.targetProfitPct != null &&
          row.tradePlan.targetProfitPct > 0
            ? row.tradePlan.targetProfitPct
            : profitPointsToDecimal(getTargetProfitPctPoints());
        const targetBack =
          row.tradePlan?.targetBackOdds != null &&
          row.tradePlan.targetBackOdds > 1.01
            ? row.tradePlan.targetBackOdds
            : undefined;
        if (!enterNotifiedRef.current.has(layEntryKey)) {
          enterNotifiedRef.current.add(layEntryKey);
          pushAlert({
            kind: "enter",
            strategy: "lay-3x3",
            title: `ENTRAR · LAY 3x3 · ${name}`,
            body: label
              ? `Lay→Back · ${label}${minute}${layOdds > 1 ? ` · lay x${layOdds}` : ""}${
                  targetBack ? ` → back x${targetBack.toFixed(2)}` : ""
                } · ${(profitPct * 100).toFixed(1).replace(".", ",")}%`
              : `Lay→Back${minute}${layOdds > 1 ? ` · lay x${layOdds}` : ""} · ${(profitPct * 100).toFixed(1).replace(".", ",")}%`,
            tag: `tips3x3-enter-${id}-${Date.now()}`,
          });
        }
        sendToExtension(row, {
          score: "3-3",
          kind: "lay-3x3",
          layOdds,
          marketId: row.analysis.marketId,
          runnerId: row.analysis.runnerId,
          mexchangeUrl: row.mexchangeUrl,
          exitMode: "green",
          targetBackOdds: targetBack,
          targetProfitPct: profitPct,
          dedupeKey: layEntryKey,
        });
      }

      // ENTRAR Lay QOV zebra — Lay→Back na zebra do Placar Exato.
      const qovLayKey = `${id}:qov-lay-zebra`;
      const qovLay = row.qovLayUnderdog;
      const qovLayReady = Boolean(qovLay?.entryReady && !qovLay?.settled);
      if (shouldFireEnter(qovLayKey, qovLayReady)) {
        const minute =
          row.live?.minute != null
            ? ` @ ${Math.floor(row.live.minute)}′`
            : "";
        const entryOdds = Number(qovLay?.entryOdds ?? qovLay?.layOdds ?? 0);
        const targetBack = qovLay?.exitPlan?.exitOdds ?? undefined;
        if (!enterNotifiedRef.current.has(qovLayKey)) {
          enterNotifiedRef.current.add(qovLayKey);
          pushAlert({
            kind: "enter",
            strategy: "qov",
            title: `ENTRAR · LAY QOV ZEBRA · ${name}`,
            body: label
              ? `${label}${minute}${entryOdds > 1 ? ` · lay x${entryOdds}` : ""}${
                  targetBack ? ` → back x${targetBack.toFixed(2)}` : ""
                }`
              : `Indicação Lay QOV${minute}${entryOdds > 1 ? ` · lay x${entryOdds}` : ""}`,
            tag: `tips3x3-enter-qov-lay-${id}-${Date.now()}`,
          });
        }

        if (qovLay?.underdogSide) {
          sendToExtension(row, {
            score: qovSelectionLabel(qovLay.underdogSide),
            kind: "qov-lay-zebra",
            layOdds: entryOdds,
            marketId: qovLay.marketId,
            runnerId: qovLay.runnerId,
            mexchangeUrl: row.qovMexchangeUrl,
            exitMode: "green",
            targetBackOdds: targetBack,
            targetProfitPct: qovLay.exitPlan?.targetProfitPct ?? undefined,
            dedupeKey: qovLayKey,
          });
        }
      }

      // ENTRAR Eventos raros / Lucro certo — alerta sempre; execução é do
      // Auto Lay do app conforme as prefs sincronizadas.
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
                alreadyImpossible: undefined as boolean | undefined,
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
        if (!shouldFireEnter(erKey, erReady)) {
          continue;
        }
        const minute =
          row.live?.minute != null
            ? ` @ ${Math.floor(row.live.minute)}′`
            : "";
        const entryOdds = Number(entry.layOdds ?? 0);
        const multiHint =
          erEntries.length > 1
            ? ` · ${erEntries.length} placares no evento`
            : "";
        const immediate = Boolean(entry.alreadyImpossible);
        if (!enterNotifiedRef.current.has(erKey)) {
          enterNotifiedRef.current.add(erKey);
          pushAlert({
            kind: "enter",
            strategy: immediate ? "lucro-certo" : "eventos-raros",
            title: immediate
              ? `LUCRO CERTO · ${score} · ${name}`
              : `ENTRAR · EVENTOS RAROS · ${score} · ${name}`,
            body: label
              ? `${label}${minute} · lay ${score} x${entryOdds > 1 ? entryOdds : "?"}${
                  immediate ? " · LUCRO CERTO (já impossível)" : " · hold"
                }${multiHint}`
              : `Lay ${score}${minute}${entryOdds > 1 ? ` · x${entryOdds}` : ""}${
                  immediate ? " · LUCRO CERTO" : " · hold"
                }${multiHint}`,
            tag: `tips3x3-enter-er-${id}-${score}-${Date.now()}`,
          });
        }
        sendToExtension(row, {
          score,
          kind: immediate ? "lucro-certo" : "eventos-raros",
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

      const fireOverEnter = (
        snap: OverSnap | undefined,
        line: 3.5 | 4.5,
        mexUrl?: string,
      ) => {
        const kind = line === 3.5 ? ("over-3.5" as const) : ("over-4.5" as const);
        const overKey = `${id}:${kind}`;
        const overReady = Boolean(snap?.entryReady && !snap?.settled);
        if (!shouldFireEnter(overKey, overReady)) return;
        const minute =
          row.live?.minute != null
            ? ` @ ${Math.floor(row.live.minute)}′`
            : "";
        const entryOdds = Number(snap?.layOdds ?? 0);
        const profitPct =
          snap?.exitPlan?.targetProfitPct != null &&
          snap.exitPlan.targetProfitPct > 0
            ? snap.exitPlan.targetProfitPct
            : profitPointsToDecimal(getTargetProfitPctPoints());
        const targetBack =
          snap?.exitPlan?.targetBackOdds != null &&
          snap.exitPlan.targetBackOdds > 1.01
            ? snap.exitPlan.targetBackOdds
            : undefined;
        if (!enterNotifiedRef.current.has(overKey)) {
          enterNotifiedRef.current.add(overKey);
          pushAlert({
            kind: "enter",
            strategy: kind,
            title: `ENTRAR · LAY OVER ${line} · ${name}`,
            body: label
              ? `Lay→Back · ${label}${minute}${entryOdds > 1 ? ` · lay x${entryOdds}` : ""}${
                  targetBack ? ` → back x${targetBack.toFixed(2)}` : ""
                } · ${(profitPct * 100).toFixed(1).replace(".", ",")}%`
              : `Lay→Back Over ${line}${minute}${entryOdds > 1 ? ` · lay x${entryOdds}` : ""} · ${(profitPct * 100).toFixed(1).replace(".", ",")}%`,
            tag: `tips3x3-enter-over-${line}-${id}-${Date.now()}`,
          });
        }
        sendToExtension(row, {
          score: overSelectionLabel(line),
          kind,
          layOdds: entryOdds,
          marketId: snap?.marketId,
          runnerId: snap?.runnerId,
          mexchangeUrl: mexUrl ?? row.mexchangeUrl,
          exitMode: "green",
          targetBackOdds: targetBack,
          targetProfitPct: profitPct,
          dedupeKey: overKey,
        });
      };

      fireOverEnter(row.overLimite35, 3.5, row.overMexchangeUrl35);
      fireOverEnter(row.overLimite45, 4.5, row.overMexchangeUrl45);

      // ENTRAR Lay Over Limite com Pressão — cruza estatísticas + pressão
      if (row.layOverLimitPressure && Array.isArray(row.layOverLimitPressure)) {
        for (const lolpSnap of row.layOverLimitPressure) {
          if (!lolpSnap?.entryReady || lolpSnap?.settled) continue;
          
          const lolpKey = `${id}:lay-over-limit-pressure:${lolpSnap.line ?? "?"}`;
          if (!shouldFireEnter(lolpKey, true)) continue;
          
          if (!enterNotifiedRef.current.has(lolpKey)) {
            enterNotifiedRef.current.add(lolpKey);
            const minute =
              row.live?.minute != null
                ? ` @ ${Math.floor(row.live.minute)}′`
                : "";
            const layOdds = Number(lolpSnap?.layOdds ?? 0);
            const profitPct = lolpSnap?.exitPlan?.targetProfitPct ?? 0.01;
            const targetBack = lolpSnap?.exitPlan?.targetBackOdds ?? undefined;
            
            pushAlert({
              kind: "enter",
              strategy: "lay-over-limit-pressure",
              title: `ENTRAR · LAY OVER ${lolpSnap.line} PRESSÃO · ${name}`,
              body: label
                ? `Lay→Back · ${label}${minute}${layOdds > 1 ? ` · lay x${layOdds}` : ""}${
                    targetBack ? ` → back x${targetBack.toFixed(2)}` : ""
                  } · ${(profitPct * 100).toFixed(1).replace(".", ",")}%`
                : `Lay→Back${minute}${layOdds > 1 ? ` · lay x${layOdds}` : ""} · ${(profitPct * 100).toFixed(1).replace(".", ",")}%`,
              tag: `tips3x3-enter-lolp-${id}-${lolpSnap.line}-${Date.now()}`,
            });
          }

          sendToExtension(row, {
            score: `Over ${lolpSnap.line}`,
            kind: "lay-over-limit-pressure",
            layOdds: Number(lolpSnap.layOdds ?? 0),
            marketId: lolpSnap.marketId,
            runnerId: lolpSnap.runnerId,
            mexchangeUrl: lolpSnap.mexchangeUrl ?? row.lolpMexchangeUrl,
            exitMode: "green",
            targetBackOdds: lolpSnap.exitPlan?.targetBackOdds ?? undefined,
            targetProfitPct: lolpSnap.exitPlan?.targetProfitPct ?? undefined,
            dedupeKey: lolpKey,
          });
        }
      }
    }

    primedRef.current = true;
  }, [enabled, extAutoSend, favorites, liveRows, pushAlert, sendToExtension]);

  // Revalida quando o celular volta à tela — só flanco novo (não reenvia sinal antigo)
  useEffect(() => {
    if (!enabled) return;
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
          const profitPct =
            row.tradePlan?.targetProfitPct != null &&
            row.tradePlan.targetProfitPct > 0
              ? row.tradePlan.targetProfitPct
              : profitPointsToDecimal(getTargetProfitPctPoints());
          const targetBack =
            row.tradePlan?.targetBackOdds != null &&
            row.tradePlan.targetBackOdds > 1.01
              ? row.tradePlan.targetBackOdds
              : undefined;
          pushAlert({
            kind: "enter",
            strategy: "lay-3x3",
            title: `ENTRAR · LAY 3x3 · ${name}`,
            body: label
              ? `Indicação de entrada · ${label}`
              : "Indicação de entrada",
            tag: `tips3x3-enter-${id}-vis`,
          });
          sendToExtension(row, {
            score: "3-3",
            kind: "lay-3x3",
            layOdds,
            marketId: row.analysis.marketId,
            runnerId: row.analysis.runnerId,
            mexchangeUrl: row.mexchangeUrl,
            exitMode: "green",
            targetBackOdds: targetBack,
            targetProfitPct: profitPct,
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
          const immediate = Boolean(entry.alreadyImpossible);
          pushAlert({
            kind: "enter",
            strategy: immediate ? "lucro-certo" : "eventos-raros",
            title: immediate
              ? `LUCRO CERTO · ${score} · ${name}`
              : `ENTRAR · EVENTOS RAROS · ${score} · ${name}`,
            body: label
              ? `${label} · lay ${score}${immediate ? " · LUCRO CERTO" : " · hold"}`
              : `Lay ${score}${immediate ? " · LUCRO CERTO" : " · hold"}`,
            tag: `tips3x3-enter-er-${id}-${score}-vis`,
          });
          sendToExtension(row, {
            score,
            kind: immediate ? "lucro-certo" : "eventos-raros",
            layOdds: entryOdds,
            marketId: entry.marketId ?? er?.marketId,
            runnerId: entry.runnerId,
            mexchangeUrl: row.eventosRarosMexchangeUrl ?? row.mexchangeUrl,
            exitMode: "hold",
            dedupeKey: erKey,
          });
        }

        // Over ficava fora da revalidação: um sinal que surgia com a tela
        // apagada só era entregue no flanco seguinte.
        const reviveOver = (
          snap: OverSnap | undefined,
          line: 3.5 | 4.5,
          mexUrl?: string,
        ) => {
          const kind =
            line === 3.5 ? ("over-3.5" as const) : ("over-4.5" as const);
          const overKey = `${id}:${kind}`;
          const ready = Boolean(snap?.entryReady && !snap?.settled);
          const prev = entryReadyPrevRef.current.get(overKey);
          entryReadyPrevRef.current.set(overKey, ready);
          if (
            !ready ||
            prev === true ||
            enterNotifiedRef.current.has(overKey) ||
            hasExtAutoEntryBeenDispatched(overKey)
          ) {
            return;
          }
          enterNotifiedRef.current.add(overKey);
          const name = matchName(favorites, row);
          const label = row.live?.scoreLabel;
          const entryOdds = Number(snap?.layOdds ?? 0);
          const profitPct =
            snap?.exitPlan?.targetProfitPct != null &&
            snap.exitPlan.targetProfitPct > 0
              ? snap.exitPlan.targetProfitPct
              : profitPointsToDecimal(getTargetProfitPctPoints());
          const targetBack =
            snap?.exitPlan?.targetBackOdds != null &&
            snap.exitPlan.targetBackOdds > 1.01
              ? snap.exitPlan.targetBackOdds
              : undefined;
          pushAlert({
            kind: "enter",
            strategy: kind,
            title: `ENTRAR · LAY OVER ${line} · ${name}`,
            body: label
              ? `Lay→Back · ${label}${entryOdds > 1 ? ` · lay x${entryOdds}` : ""}`
              : `Lay→Back Over ${line}${entryOdds > 1 ? ` · lay x${entryOdds}` : ""}`,
            tag: `tips3x3-enter-over-${line}-${id}-vis`,
          });
          sendToExtension(row, {
            score: overSelectionLabel(line),
            kind,
            layOdds: entryOdds,
            marketId: snap?.marketId,
            runnerId: snap?.runnerId,
            mexchangeUrl: mexUrl ?? row.mexchangeUrl,
            exitMode: "green",
            targetBackOdds: targetBack,
            targetProfitPct: profitPct,
            dedupeKey: overKey,
          });
        };

        reviveOver(row.overLimite35, 3.5, row.overMexchangeUrl35);
        reviveOver(row.overLimite45, 4.5, row.overMexchangeUrl45);

      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled, favorites, liveRows, pushAlert, sendToExtension]);

  return {
    toasts,
    dismiss,
    alertsArmed,
    armAlerts,
    extAutoSend,
    setExtAutoSend,
  };
}
