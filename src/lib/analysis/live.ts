import type { InplayEvent } from "../betbra/types";
import type { PreLiveAnalysis } from "./prelive";
import {
  isEntryScoreAllowed,
  resolveInitialFavorite,
} from "./score-entry";

export type AlertSeverity = "info" | "watch" | "entry" | "abort";

export interface LiveSnapshot {
  eventId: string;
  homeScore: number;
  awayScore: number;
  scoreLabel: string;
  minute: number | null;
  status: string;
  matchStatus?: string;
  totalGoals: number;
  goalDiff: number;
  stillPossible33: boolean;
}

export interface LiveConfirmation {
  analysis: PreLiveAnalysis;
  live: LiveSnapshot | null;
  confirmed: boolean;
  alerts: Array<{
    id: string;
    severity: AlertSeverity;
    title: string;
    message: string;
    at: string;
  }>;
  reasons: string[];
}

function toInt(v: string | undefined, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function toLiveSnapshot(event: InplayEvent): LiveSnapshot {
  const homeScore = toInt(event.score?.home?.score);
  const awayScore = toInt(event.score?.away?.score);
  const minuteRaw = event.elapsedRegularTime ?? event.timeElapsed;
  const minute = minuteRaw != null && minuteRaw !== "" ? toInt(minuteRaw, NaN) : null;

  const stillPossible33 =
    homeScore <= 3 &&
    awayScore <= 3 &&
    !(homeScore === 3 && awayScore === 3);

  return {
    eventId: event.eventId,
    homeScore,
    awayScore,
    scoreLabel: `${homeScore}-${awayScore}`,
    minute: Number.isFinite(minute as number) ? (minute as number) : null,
    status: event.status ?? "UNKNOWN",
    matchStatus: event.inPlayMatchStatus,
    totalGoals: homeScore + awayScore,
    goalDiff: Math.abs(homeScore - awayScore),
    stillPossible33,
  };
}

export function confirmLivePattern(
  analysis: PreLiveAnalysis,
  inplay: InplayEvent | undefined,
): LiveConfirmation {
  const at = new Date().toISOString();
  const alerts: LiveConfirmation["alerts"] = [];
  const reasons: string[] = [];

  if (!inplay) {
    return {
      analysis,
      live: null,
      confirmed: false,
      alerts: [
        {
          id: `${analysis.eventId}-waiting`,
          severity: "info",
          title: "Aguardando live",
          message: `${analysis.eventName}: análise pré-live pronta (${analysis.score}/100). Sem feed ao vivo ainda.`,
          at,
        },
      ],
      reasons: ["Evento ainda não aparece no feed in-play"],
    };
  }

  const live = toLiveSnapshot(inplay);
  const { pattern } = analysis;

  if (!live.stillPossible33 || live.scoreLabel === "3-3") {
    alerts.push({
      id: `${analysis.eventId}-abort-score`,
      severity: "abort",
      title: "Padrão invalidado",
      message: `${analysis.eventName}: placar ${live.scoreLabel} encerra a tese lay 3-3.`,
      at,
    });
    reasons.push("Placar impede ou realiza o 3-3");
    return { analysis, live, confirmed: false, alerts, reasons };
  }

  if (!pattern.allowScores.includes(live.scoreLabel)) {
    alerts.push({
      id: `${analysis.eventId}-watch-score`,
      severity: "watch",
      title: "Placar fora do roteiro",
      message: `${analysis.eventName}: ${live.scoreLabel} não está na lista preferencial do pré-live.`,
      at,
    });
    reasons.push("Placar fora da lista allowScores");
  }

  const favorite = resolveInitialFavorite(analysis.matchOdds);
  let favoriteScoreOk = false;
  if (!favorite.qualifies || !favorite.side) {
    reasons.push(favorite.detail);
  } else {
    const gate = isEntryScoreAllowed(
      live.homeScore,
      live.awayScore,
      favorite.side,
    );
    favoriteScoreOk = gate.allowed;
    if (!gate.allowed) {
      alerts.push({
        id: `${analysis.eventId}-watch-fav-score`,
        severity: "watch",
        title: "Placar vs favorito",
        message: `${analysis.eventName}: ${gate.reason}`,
        at,
      });
      reasons.push(gate.reason);
    }
  }

  if (live.totalGoals > pattern.maxGoalsBeforeEntry) {
    reasons.push("Gols totais acima do máximo pré-definido");
  }

  if (pattern.requireCompetitive && live.goalDiff >= 3) {
    // 3-0 / 0-3 continua elegível para indicação (regra de placar do favorito)
    if (live.scoreLabel !== "3-0" && live.scoreLabel !== "0-3") {
      alerts.push({
        id: `${analysis.eventId}-abort-diff`,
        severity: "abort",
        title: "Jogo desequilibrado",
        message: `${analysis.eventName}: diferença de ${live.goalDiff} gols quebra o padrão competitivo.`,
        at,
      });
      reasons.push("Diferença de gols alta");
      return { analysis, live, confirmed: false, alerts, reasons };
    }
  }

  const minuteOk =
    live.minute == null ||
    (live.minute >= pattern.preferMinuteFrom &&
      live.minute <= pattern.preferMinuteTo);

  const scorePathOk = pattern.allowScores.includes(live.scoreLabel);
  const goalsOk = live.totalGoals <= pattern.maxGoalsBeforeEntry;
  const preOk = analysis.watchlist && analysis.idealOdds;

  const confirmed = Boolean(
    preOk && scorePathOk && goalsOk && minuteOk && favoriteScoreOk,
  );

  if (confirmed) {
    alerts.push({
      id: `${analysis.eventId}-entry`,
      severity: "entry",
      title: "ALERTA DE ENTRADA · LAY 3-3",
      message: `${analysis.eventName} ${live.scoreLabel} @ ${live.minute ?? "?"}' · pré-live ${analysis.score}/100 · odd ref ${analysis.layOdds?.toFixed(2) ?? "—"} (${analysis.oddsSource})`,
      at,
    });
    reasons.push("Pré-live + placar + janela de tempo alinhados");
  } else if (preOk && scorePathOk) {
    alerts.push({
      id: `${analysis.eventId}-watch`,
      severity: "watch",
      title: "Monitorar",
      message: `${analysis.eventName}: padrão parcial em ${live.scoreLabel} (${live.minute ?? "?"}'). Aguardando confirmação completa.`,
      at,
    });
    reasons.push("Aguardando janela de minuto ou condição restante");
  } else {
    alerts.push({
      id: `${analysis.eventId}-live`,
      severity: "info",
      title: "Live ativo",
      message: `${analysis.eventName}: ${live.scoreLabel} · ${live.minute ?? "?"}′ · status ${live.status}`,
      at,
    });
  }

  return { analysis, live, confirmed, alerts, reasons };
}
