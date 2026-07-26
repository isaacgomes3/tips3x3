import type { PreLiveAnalysis } from "./prelive";
import type { LiveSnapshot } from "./live";
import type { TradePlan } from "./trade-plan";
import type { FluidityReport } from "./fluidity";
import type { CorrectionAnalysis } from "./correction";

export type MomentVerdict = "ENTER" | "WAIT" | "ABORT";

export interface MomentPillar {
  id: "prePattern" | "anti33" | "fluidity" | "correction" | "tradeWindow";
  title: string;
  ok: boolean;
  score: number;
  detail: string;
}

export interface MomentAnalysis {
  verdict: MomentVerdict;
  confidence: number;
  headline: string;
  thesis: string;
  pillars: MomentPillar[];
  risks: string[];
  actions: string[];
  source: "rules" | "llm";
  model?: string;
  analyzedAt: string;
}

function anti33Assessment(live: LiveSnapshot | null, pre: PreLiveAnalysis) {
  if (!live) {
    return {
      ok: true,
      score: 55,
      detail:
        "Sem live ainda — tese anti-3x3 depende do pré (equilíbrio/gols). Entrar só com fluidez e janela.",
      risks: [] as string[],
    };
  }

  const risks: string[] = [];
  let score = 70;
  const { homeScore, awayScore, totalGoals, goalDiff, scoreLabel, minute } = live;

  // Caminhos perigosos para o lay 3-3
  if (scoreLabel === "2-2" || scoreLabel === "3-2" || scoreLabel === "2-3") {
    score -= 45;
    risks.push(`Placar ${scoreLabel} eleva muito a chance de 3-3`);
  } else if (scoreLabel === "1-1" && (minute ?? 0) >= 55) {
    score -= 15;
    risks.push("1-1 após 55' ainda permite explosão para 3-3");
  } else if (totalGoals >= 4) {
    score -= 25;
    risks.push("Jogo já aberto demais (4+ gols)");
  }

  if (goalDiff >= 3) {
    score += 10; // goleada reduz 3-3
  }

  // Pré apontava jogo aberto (BTTS/Over baratos) → live deve confirmar se ficou "seguro"
  if ((pre.bttsYes ?? 99) <= 1.7 && totalGoals <= 1 && (minute ?? 0) >= 35) {
    score += 8;
  }
  if ((pre.over25 ?? 99) <= 1.7 && totalGoals === 0 && (minute ?? 0) >= 40) {
    score += 10; // over barato mas 0-0 tardio favorece lay 3-3
  }
  if (totalGoals >= 3 && homeScore > 0 && awayScore > 0) {
    score -= 20;
    risks.push("Ambos marcaram e placar alto — padrão contrário ao lay 3-3");
  }

  if (!live.stillPossible33) {
    return {
      ok: false,
      score: 5,
      detail: `Placar ${scoreLabel} invalida ou realiza o 3-3.`,
      risks: [`Placar ${scoreLabel}`],
    };
  }

  const ok = score >= 55;
  return {
    ok,
    score: Math.max(0, Math.min(100, score)),
    detail: ok
      ? `Padrão anti-3x3 OK em ${scoreLabel} (${minute ?? "?"}′): risco controlado para o lay.`
      : `Padrão anti-3x3 frágil em ${scoreLabel}: ${risks[0] ?? "risco elevado de 3-3"}.`,
    risks,
  };
}

function prePatternAssessment(pre: PreLiveAnalysis, live: LiveSnapshot | null) {
  const strong = pre.signals.filter((s) => s.level === "strong" || s.level === "ok");
  let score = pre.score;
  const notes: string[] = [];

  if (pre.watchlist) notes.push("Watchlist pré-live ativa");
  if (pre.idealOdds) notes.push(`Odd na janela (${pre.layOdds?.toFixed(0)})`);
  notes.push(`${strong.length}/${pre.signals.length} sinais pré OK`);

  if (live) {
    const allowed = pre.pattern.allowScores.includes(live.scoreLabel);
    if (!allowed) {
      score -= 20;
      notes.push(`Placar ${live.scoreLabel} fora do roteiro pré`);
    } else {
      notes.push(`Placar ${live.scoreLabel} dentro do roteiro pré`);
    }
    const minute = live.minute;
    if (
      minute != null &&
      (minute < pre.pattern.preferMinuteFrom || minute > pre.pattern.preferMinuteTo)
    ) {
      score -= 10;
      notes.push("Fora da janela de minuto preferencial");
    }
  }

  score = Math.max(0, Math.min(100, score));
  return {
    ok: score >= 55,
    score,
    detail: notes.join(" · "),
  };
}

export function buildRulesMomentAnalysis(input: {
  pre: PreLiveAnalysis;
  live: LiveSnapshot | null;
  trade: TradePlan;
  fluidity: FluidityReport;
  correction?: CorrectionAnalysis | null;
}): MomentAnalysis {
  const { pre, live, trade, fluidity } = input;
  const correction = input.correction ?? trade.correction;
  const crash = correction?.underdogCrash;
  const crashMatched = Boolean(crash?.matched);
  const prePillar = prePatternAssessment(pre, live);
  const anti = anti33Assessment(live, pre);

  const tradeOk = Boolean(trade.inEntryWindow && trade.targetBackOdds);
  const favorableMove = correction?.entryBias === "favor";
  const tradeScore = trade.entryReady
    ? 92
    : favorableMove && tradeOk
      ? 78
      : crashMatched && tradeOk
        ? 62
        : tradeOk
          ? 55
          : trade.layOdds
            ? 30
            : 10;

  let correctionScore = 40;
  if (crashMatched && favorableMove) correctionScore = 95;
  else if (crashMatched && (correction?.episode?.phase === "trough" || correction?.episode?.phase === "shock"))
    correctionScore = 68;
  else if (correction?.entryBias === "favor") correctionScore = 88;
  else if (correction?.episode?.phase === "trough") correctionScore = 50;
  else if (correction?.episode?.phase === "shock") correctionScore = 45;
  else if (correction?.episode?.phase === "completed") correctionScore = 25;
  else if (correction?.entryBias === "avoid") correctionScore = 20;

  const pillars: MomentPillar[] = [
    {
      id: "prePattern",
      title: "Padrão pré-live",
      ok: prePillar.ok,
      score: prePillar.score,
      detail: prePillar.detail,
    },
    {
      id: "anti33",
      title: "Tese anti-3x3",
      ok: anti.ok,
      score: anti.score,
      detail: anti.detail,
    },
    {
      id: "fluidity",
      title: "Fluidez & volume",
      ok: fluidity.tradable,
      score: fluidity.score,
      detail: fluidity.detail,
    },
    {
      id: "correction",
      title: "Correção do mercado",
      ok: favorableMove || (crashMatched && (correction?.episode?.phase === "trough" || correction?.episode?.phase === "shock")),
      score: correctionScore,
      detail:
        correction?.summary ??
        "Sem correção detectada — não entrar só porque a odd está na janela.",
    },
    {
      id: "tradeWindow",
      title: "Janela lay→back",
      ok: tradeOk && favorableMove,
      score: tradeScore,
      detail: trade.summary,
    },
  ];

  const risks = [
    ...anti.risks,
    ...fluidity.blockers,
    ...(!trade.inEntryWindow
      ? [`Lay fora de ${trade.window.min}–${trade.window.max}`]
      : []),
    ...(!favorableMove
      ? ["Sem perspectiva de movimentação favorável (correção ↑)"]
      : []),
  ];

  const confidence = Math.round(
    pillars.reduce((s, p) => s + p.score, 0) / pillars.length,
  );

  const allCriticalOk =
    prePillar.ok &&
    anti.ok &&
    fluidity.tradable &&
    trade.inEntryWindow &&
    favorableMove &&
    !fluidity.lateralized;

  const entryReady = allCriticalOk && trade.entryReady;

  let verdict: MomentVerdict = "WAIT";
  if (!anti.ok || (live && !live.stillPossible33)) verdict = "ABORT";
  else if (entryReady && confidence >= 58) verdict = "ENTER";
  else verdict = "WAIT";

  const actions: string[] = [];
  if (verdict === "ENTER") {
    actions.push(
      crashMatched
        ? `Entrar na correção pós-crash da zebra: lay ~${trade.layOdds?.toFixed(0)} → back ~${trade.targetBackOdds?.toFixed(0)} (não chasear o fundo)`
        : `Entrar no movimento de correção: lay ~${trade.layOdds?.toFixed(0)} → back ~${trade.targetBackOdds?.toFixed(0)}`,
    );
    if (correction?.avgCorrectionMinutes != null) {
      actions.push(
        `Janela típica de correção ~${correction.avgCorrectionMinutes.toFixed(1)} min — não atrasar a saída`,
      );
    }
    actions.push("Confirmar liquidez no book antes de casar a saída");
  } else if (verdict === "WAIT") {
    if (crashMatched && !favorableMove) {
      actions.push(
        "Padrão lay alto → crash (zebra): aguardar 1º tick ↑ da odd antes do lay",
      );
    } else if (!favorableMove) {
      actions.push(
        "Esperar choque (ex.: gol da zebra) e início da correção com odd subindo",
      );
    }
    if (fluidity.lateralized || !fluidity.tradable) {
      actions.push("Aguardar fluidez: evitar mercado lateralizado");
    }
    if (!trade.inEntryWindow) {
      actions.push(
        `Esperar lay na faixa preferida ${trade.window?.min ?? 20}–${trade.window?.preferredMax ?? 32} (correção ~1% mais rápida)`,
      );
    } else if (trade.risk?.tier === "alto") {
      actions.push(
        `Lay alto demais — esperar cair para ≤${trade.window?.preferredMax ?? 32} antes de entrar`,
      );
    }
    if (!anti.ok) actions.push("Reavaliar tese anti-3x3 a cada gol");
  } else {
    actions.push("Abortar / não entrar — padrão invalida o lay 3-3");
  }

  const headline =
    verdict === "ENTER"
      ? crashMatched
        ? "Correção pós-crash da zebra: entrar no bounce"
        : "Correção em curso: entrar no movimento, não só na odd"
      : verdict === "ABORT"
        ? "Abortar: risco de 3-3 ou placar inválido"
        : crashMatched
          ? "Zebra-crash armado — esperar correção ↑"
          : "Aguardar correção favorável — odd sozinha não basta";

  const avg =
    correction?.avgCorrectionMinutes != null
      ? ` · correção média ~${correction.avgCorrectionMinutes.toFixed(1)}min`
      : "";

  const thesis = `Lay 3-3 com saída back (~${(trade.targetProfitPct * 100).toFixed(0)}% liability). Pré ${pre.score}/100 · live ${live?.scoreLabel ?? "pré"} · fluidez ${fluidity.level}${avg}.`;

  return {
    verdict,
    confidence,
    headline,
    thesis,
    pillars,
    risks: [...new Set(risks)].slice(0, 6),
    actions,
    source: "rules",
    analyzedAt: new Date().toISOString(),
  };
}
