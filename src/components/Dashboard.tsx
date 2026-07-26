"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CollapsePanel } from "@/components/CollapsePanel";
import { FavoriteStarButton } from "@/components/FavoriteStarButton";
import { MatchCardPressure } from "@/components/MatchCardPressure";
import { MatchIntelCard } from "@/components/MatchIntelCard";
import { MomentAnalysisCard } from "@/components/MomentAnalysisCard";
import { OddsQuoteButtons } from "@/components/OddsQuoteButtons";
import { OddsVolumeChart } from "@/components/OddsVolumeChart";
import { useFavorites } from "@/hooks/useFavorites";
import { useGoalNotifications } from "@/hooks/useGoalNotifications";

type TradePlan = {
  layOdds: number | null;
  inEntryWindow: boolean;
  targetBackOdds: number | null;
  targetProfitPct: number;
  entryReady: boolean;
  summary: string;
  risk?: {
    tier: "baixo" | "medio" | "alto" | "fora";
    requiredMovePct: number | null;
    liabilityMultiple: number | null;
    favorsQuickCorrection: boolean;
    detail: string;
  };
  oscillation: null | {
    active: boolean;
    detail: string;
    swingPct: number;
  };
  fluidity?: null | {
    level: string;
    score: number;
    tradable: boolean;
    lateralized: boolean;
    detail: string;
  };
  correction?: null | {
    entryBias: "favor" | "neutral" | "avoid";
    summary: string;
    avgCorrectionMinutes: number | null;
    underdogCrash?: null | {
      matched: boolean;
      quality: "strong" | "weak" | "none";
      peakOdd: number;
      troughOdd: number;
      dropPct: number;
      favorsQuickBounce: boolean;
      phase: string;
      detail: string;
    };
    episode: null | {
      phase: string;
      favorableMove: boolean;
      recoveredPct: number;
      minutesSinceTrough: number;
      detail: string;
    };
  };
  example: null | {
    layStake: number;
    liability: number;
    backStake: number | null;
    profit: number | null;
  };
};

type OpportunityPayload = {
  generatedAt: string;
  window: { min: number; max: number; preferredMax?: number; minLiquidity: number };
  totalEvents: number;
  opportunities: Array<{
    mexchangeUrl: string;
    analysis: {
      eventId: string;
      eventName: string;
      home: string;
      away: string;
      start: string;
      competition?: string;
      marketId?: string;
      runnerId?: string;
      layOdds: number | null;
      oddsSource: string;
      quotes?: {
        back: { odds: number | null; amount: number };
        lay: { odds: number | null; amount: number };
        lastMatched: number | null;
      };
      liquidity: number;
      volume3x3: number;
      bttsYes: number | null;
      over25: number | null;
      score: number;
      idealOdds: boolean;
      watchlist: boolean;
      summary: string;
      tradePlan?: TradePlan;
      signals: Array<{
        id: string;
        label: string;
        detail: string;
        level: string;
        score: number;
      }>;
      matchOdds: {
        home: { name?: string; back?: number };
        draw: { name?: string; back?: number };
        away: { name?: string; back?: number };
      };
    };
  }>;
  error?: string;
};

type OpportunityRow = OpportunityPayload["opportunities"][number];

type LivePayload = {
  generatedAt: string;
  inplayCount: number;
  monitored: number;
  entries: number;
  alerts: Array<{
    id: string;
    severity: "info" | "watch" | "entry" | "abort";
    title: string;
    message: string;
    at: string;
  }>;
  rows: Array<{
    confirmed: boolean;
    mexchangeUrl: string;
    reasons: string[];
    tradePlan?: TradePlan;
    live: null | {
      scoreLabel: string;
      minute: number | null;
      status: string;
      stillPossible33: boolean;
    };
    analysis: {
      eventId: string;
      eventName: string;
      home?: string;
      away?: string;
      start?: string;
      competition?: string;
      marketId?: string;
      runnerId?: string;
      score: number;
      layOdds: number | null;
      oddsSource?: string;
      quotes?: {
        back: { odds: number | null; amount: number };
        lay: { odds: number | null; amount: number };
        lastMatched: number | null;
      };
      liquidity?: number;
      volume3x3?: number;
      bttsYes?: number | null;
      over25?: number | null;
      idealOdds?: boolean;
      watchlist?: boolean;
      summary?: string;
      signals?: OpportunityRow["analysis"]["signals"];
      matchOdds?: OpportunityRow["analysis"]["matchOdds"];
      tradePlan?: TradePlan;
    };
  }>;
  error?: string;
};

type NavView = "jogos" | "live" | "alertas" | "evento";

function formatKickTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "--:--";
  }
}

function formatKickDate(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) return "HOJE";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

function formatKickoff(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function severityClass(severity: string) {
  switch (severity) {
    case "entry":
      return "alert-entry";
    case "abort":
      return "alert-abort";
    case "watch":
      return "alert-watch";
    default:
      return "alert-info";
  }
}

function tradeStatus(plan?: TradePlan | null) {
  if (!plan) return "—";
  if (plan.entryReady) return "ENTRAR";
  if (plan.correction?.underdogCrash?.matched) {
    if (plan.correction.entryBias === "favor") return "BOUNCE";
    return "ZEBRA↓";
  }
  if (plan.risk?.tier === "alto") return "RISCO";
  if (plan.correction?.entryBias === "favor") return "CORRIGINDO";
  if (plan.fluidity?.lateralized) return "LATERAL";
  if (plan.inEntryWindow && plan.risk?.favorsQuickCorrection) return "FAVORAVEL";
  if (plan.inEntryWindow) return "AGUARDAR";
  return "FORA";
}

export function Dashboard() {
  const [opps, setOpps] = useState<OpportunityPayload | null>(null);
  const [live, setLive] = useState<LivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onlyIdeal, setOnlyIdeal] = useState(false);
  const [onlyLive, setOnlyLive] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<NavView>("jogos");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { favorites, favoriteIds, toggleFavorite, isFavorite } = useFavorites();

  useGoalNotifications(favorites, live?.rows);
  const [detailOpen, setDetailOpen] = useState<Record<string, boolean>>({
    trade: true,
    moment: true,
    intel: true,
    signals: false,
    live: true,
    chart: false,
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [oRes, lRes] = await Promise.all([
        fetch(`/api/opportunities?limit=40${onlyIdeal ? "&ideal=1" : ""}`),
        fetch("/api/live?limit=40"),
      ]);
      const oJson = (await oRes.json()) as OpportunityPayload;
      const lJson = (await lRes.json()) as LivePayload;
      if (!oRes.ok) throw new Error(oJson.error || "Falha ao carregar oportunidades");
      if (!lRes.ok) throw new Error(lJson.error || "Falha ao carregar live");
      setOpps(oJson);
      setLive(lJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setLoading(false);
    }
  }, [onlyIdeal]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 20000);
    return () => window.clearInterval(id);
  }, []);

  const liveMap = useMemo(() => {
    const map = new Map<string, LivePayload["rows"][number]>();
    for (const row of live?.rows ?? []) {
      map.set(row.analysis.eventId, row);
    }
    return map;
  }, [live]);

  const liveAsOpportunities = useMemo((): OpportunityRow[] => {
    return (live?.rows ?? [])
      .filter((r) => r.live)
      .map((r) => {
        const a = r.analysis;
        const [homeFallback, awayFallback] = (a.eventName ?? "").split(/\s+vs\s+/i);
        return {
          mexchangeUrl: r.mexchangeUrl,
          analysis: {
            eventId: a.eventId,
            eventName: a.eventName,
            home: a.home ?? homeFallback ?? "Casa",
            away: a.away ?? awayFallback ?? "Fora",
            start: a.start ?? new Date().toISOString(),
            competition: a.competition,
            marketId: a.marketId,
            runnerId: a.runnerId,
            layOdds: a.layOdds,
            oddsSource: (a.oddsSource as OpportunityRow["analysis"]["oddsSource"]) ?? "none",
            quotes: a.quotes,
            liquidity: a.liquidity ?? 0,
            volume3x3: a.volume3x3 ?? 0,
            bttsYes: a.bttsYes ?? null,
            over25: a.over25 ?? null,
            score: a.score,
            idealOdds: a.idealOdds ?? false,
            watchlist: a.watchlist ?? true,
            summary: a.summary ?? "",
            tradePlan: r.tradePlan ?? a.tradePlan,
            signals: a.signals ?? [],
            matchOdds: a.matchOdds ?? {
              home: {},
              draw: {},
              away: {},
            },
          },
        };
      });
  }, [live]);

  const games = useMemo(() => {
    const q = query.trim().toLowerCase();
    const oppsList = opps?.opportunities ?? [];
    const liveList = liveAsOpportunities;

    let source: OpportunityRow[];
    if (onlyLive) {
      source = liveList;
    } else {
      // Live primeiro (com placar/minuto), depois pré-live sem duplicar
      const liveIds = new Set(liveList.map((r) => r.analysis.eventId));
      source = [
        ...liveList,
        ...oppsList.filter((r) => !liveIds.has(r.analysis.eventId)),
      ];
    }

    const filtered = source.filter((row) => {
      const a = row.analysis;
      if (onlyFavorites && !favoriteIds.has(a.eventId)) return false;
      if (onlyIdeal && !a.idealOdds && !onlyLive) return false;
      if (!q) return true;
      const hay = `${a.home} ${a.away} ${a.eventName} ${a.competition ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

    // ENTRAR no topo, depois favoritos, depois o restante
    const favRank = new Map(favorites.map((f, i) => [f.eventId, i]));
    const isEntry = (row: OpportunityRow) => {
      const plan =
        liveMap.get(row.analysis.eventId)?.tradePlan ?? row.analysis.tradePlan;
      return Boolean(plan?.entryReady);
    };
    return [...filtered].sort((a, b) => {
      const ae = isEntry(a) ? 0 : 1;
      const be = isEntry(b) ? 0 : 1;
      if (ae !== be) return ae - be;

      const ai = favRank.has(a.analysis.eventId)
        ? (favRank.get(a.analysis.eventId) as number)
        : Number.POSITIVE_INFINITY;
      const bi = favRank.has(b.analysis.eventId)
        ? (favRank.get(b.analysis.eventId) as number)
        : Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return 0;
    });
  }, [
    opps,
    query,
    onlyLive,
    onlyIdeal,
    onlyFavorites,
    liveAsOpportunities,
    liveMap,
    favoriteIds,
    favorites,
  ]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return (
      games.find((o) => o.analysis.eventId === selectedId) ??
      liveAsOpportunities.find((o) => o.analysis.eventId === selectedId) ??
      opps?.opportunities.find((o) => o.analysis.eventId === selectedId) ??
      null
    );
  }, [opps, selectedId, games, liveAsOpportunities]);

  const liveForSelected = selectedId ? liveMap.get(selectedId) : undefined;
  const activeTrade = liveForSelected?.tradePlan ?? selected?.analysis.tradePlan;
  const entryAlerts = (live?.alerts ?? []).filter((a) => a.severity === "entry").length;

  const openEvent = (eventId: string) => {
    setSelectedId(eventId);
    setView("evento");
    setSidebarOpen(false);
    setDetailOpen({
      trade: true,
      moment: true,
      intel: true,
      signals: false,
      live: true,
      chart: false,
    });
  };

  const goNav = (next: NavView) => {
    setView(next);
    setSidebarOpen(false);
    if (next !== "evento") setSelectedId(null);
  };

  const toggleDetail = (key: string) => {
    setDetailOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="app-frame">
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <img
            className="brand-logo"
            src="/logo-tips3x3.png"
            alt="tips3x3"
            width={180}
            height={53}
          />
        </div>

        <nav className="sidebar-nav" aria-label="Menu principal">
          <p className="sidebar-section">Análise</p>
          <button
            type="button"
            className={`sidebar-link ${view === "jogos" ? "active" : ""}`}
            onClick={() => goNav("jogos")}
          >
            <span className="sidebar-ico" aria-hidden>
              ▦
            </span>
            Jogos em análise
          </button>
          <button
            type="button"
            className={`sidebar-link ${view === "live" ? "active" : ""}`}
            onClick={() => goNav("live")}
          >
            <span className="sidebar-ico" aria-hidden>
              ●
            </span>
            Live
            {(live?.inplayCount ?? 0) > 0 && (
              <span className="sidebar-badge">{live?.inplayCount}</span>
            )}
          </button>
          <button
            type="button"
            className={`sidebar-link ${view === "alertas" ? "active" : ""}`}
            onClick={() => goNav("alertas")}
          >
            <span className="sidebar-ico" aria-hidden>
              ⚑
            </span>
            Alertas
            {entryAlerts > 0 && <span className="sidebar-badge hot">{entryAlerts}</span>}
          </button>

          <p className="sidebar-section">Operações</p>
          <button
            type="button"
            className={`sidebar-link ${view === "evento" ? "active" : ""}`}
            onClick={() => {
              if (selectedId) setView("evento");
              else goNav("jogos");
            }}
            disabled={!selectedId && view !== "evento"}
          >
            <span className="sidebar-ico" aria-hidden>
              ◆
            </span>
            Detalhe do evento
          </button>
          <a
            className="sidebar-link"
            href="https://bolsadeaposta.bet.br"
            target="_blank"
            rel="noreferrer"
          >
            <span className="sidebar-ico" aria-hidden>
              ↗
            </span>
            Abrir exchange
          </a>
        </nav>

        <div className="sidebar-foot">
          <p>Lay preferido 20–32 · ~1% liability · menos risco</p>
          <button type="button" className="btn-ghost" onClick={() => setTick((t) => t + 1)}>
            Atualizar agora
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main-pane">
        <header className="main-head">
          <div className="main-head-left">
            <button
              type="button"
              className="btn-menu"
              aria-label="Abrir menu"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <div>
              <h2>
                {view === "evento" && selected
                  ? selected.analysis.eventName
                  : view === "live"
                    ? "Live"
                    : view === "alertas"
                      ? "Alertas"
                      : "Jogos em análise"}
              </h2>
              <p>
                {view === "evento"
                  ? "Todas as informações do evento selecionado"
                  : "Terminal de liquidez · mercado 3-3"}
              </p>
            </div>
          </div>
          <div className="main-head-actions">
            {view === "evento" && (
              <button type="button" className="btn-secondary" onClick={() => goNav("jogos")}>
                ← Voltar aos jogos
              </button>
            )}
            <button type="button" className="btn-icon" onClick={() => setTick((t) => t + 1)} title="Atualizar">
              ↻
            </button>
          </div>
        </header>

        {error && <div className="banner-error">{error}</div>}

        {view === "jogos" && (
          <>
            <div className="filter-bar">
              <div className="filter-pills">
                <button
                  type="button"
                  className={`pill ${!onlyLive ? "active" : ""}`}
                  onClick={() => setOnlyLive(false)}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`pill ${onlyLive ? "active" : ""}`}
                  onClick={() => setOnlyLive(true)}
                >
                  <span className="dot-live" /> Ao vivo
                </button>
                <button
                  type="button"
                  className={`pill ${onlyFavorites ? "active" : ""}`}
                  onClick={() => setOnlyFavorites((v) => !v)}
                >
                  ★ Favoritos{favorites.length > 0 ? ` (${favorites.length})` : ""}
                </button>
                <button
                  type="button"
                  className={`pill ${onlyIdeal ? "active" : ""}`}
                  onClick={() => setOnlyIdeal(true)}
                >
                  Lay preferido
                </button>
                <button
                  type="button"
                  className={`pill ${!onlyIdeal ? "active" : ""}`}
                  onClick={() => setOnlyIdeal(false)}
                >
                  Todos os lays
                </button>
              </div>
              <label className="search-field">
                <span aria-hidden>⌕</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar jogo ou campeonato"
                />
              </label>
            </div>

            <div className="match-board">
              <div className="match-board-head" aria-hidden>
                <span>★</span>
                <span>Horário</span>
                <span>Confronto</span>
                <span>Pressão</span>
                <span>Mercado</span>
              </div>

              {loading && games.length === 0 && (
                <div className="banner-info">Carregando jogos do Mexchange…</div>
              )}

              {!loading && games.length === 0 && (
                <div className="empty-state panel-block">
                  <div className="empty-icon" aria-hidden>
                    ≡
                  </div>
                  <strong>
                    {onlyFavorites
                      ? "Nenhum favorito nesta lista"
                      : onlyLive
                        ? "Nenhum jogo ao vivo agora"
                        : "Sem partidas com liquidez"}
                  </strong>
                  <p>
                    {onlyFavorites
                      ? "Toque na estrela de um jogo para fixá-lo no topo e receber gols."
                      : onlyLive
                        ? `Feed in-play: ${live?.inplayCount ?? 0} evento(s). Atualize em instantes.`
                        : "Só aparecem jogos com mercado 3-3 no dia."}
                  </p>
                </div>
              )}

              <div className="match-card-list">
                {games.map((row) => (
                  <GameRow
                    key={row.analysis.eventId}
                    row={row}
                    liveRow={liveMap.get(row.analysis.eventId)}
                    active={row.analysis.eventId === selectedId}
                    favorited={isFavorite(row.analysis.eventId)}
                    onToggleFavorite={() =>
                      void toggleFavorite({
                        eventId: row.analysis.eventId,
                        home: row.analysis.home,
                        away: row.analysis.away,
                        competition: row.analysis.competition,
                      })
                    }
                    onOpen={() => openEvent(row.analysis.eventId)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {view === "live" && (
          <div className="panel-block">
            <ul className="live-list">
              {(live?.rows ?? []).map((row) => (
                <li key={row.analysis.eventId}>
                  <button type="button" className="live-card" onClick={() => openEvent(row.analysis.eventId)}>
                    <div className="live-card-main">
                      <LiveScoreBadge
                        scoreLabel={row.live?.scoreLabel}
                        minute={row.live?.minute}
                        status={row.live?.status}
                        compact
                      />
                      <div>
                        <strong>{row.analysis.eventName}</strong>
                        <p>{row.analysis.home && row.analysis.away ? `${row.analysis.home} vs ${row.analysis.away}` : "Ao vivo"}</p>
                      </div>
                    </div>
                    <span className={`tag ${row.confirmed ? "tag-entry" : ""}`}>
                      {row.confirmed ? "ENTRADA" : tradeStatus(row.tradePlan)}
                    </span>
                  </button>
                </li>
              ))}
              {(live?.rows.length ?? 0) === 0 && (
                <li className="empty">Nenhum jogo live monitorado.</li>
              )}
            </ul>
          </div>
        )}

        {view === "alertas" && (
          <div className="panel-block">
            <ul className="alerts">
              {(live?.alerts ?? []).map((a) => (
                <li key={a.id} className={severityClass(a.severity)}>
                  <strong>{a.title}</strong>
                  <p>{a.message}</p>
                  <time>{formatKickoff(a.at)}</time>
                </li>
              ))}
              {(live?.alerts.length ?? 0) === 0 && (
                <li className="empty">Nenhum alerta ainda.</li>
              )}
            </ul>
          </div>
        )}

        {view === "evento" && selected && (
          <EventDetail
            selected={selected}
            liveForSelected={liveForSelected}
            activeTrade={activeTrade}
            detailOpen={detailOpen}
            favorited={isFavorite(selected.analysis.eventId)}
            onToggleFavorite={() =>
              void toggleFavorite({
                eventId: selected.analysis.eventId,
                home: selected.analysis.home,
                away: selected.analysis.away,
                competition: selected.analysis.competition,
              })
            }
            onToggle={toggleDetail}
          />
        )}

        {view === "evento" && !selected && (
          <div className="empty-state panel-block">
            <strong>Selecione um jogo</strong>
            <p>Volte à lista e clique em um evento para ver a análise completa.</p>
            <button type="button" className="btn-primary" onClick={() => goNav("jogos")}>
              Ver jogos
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function formatLiveMinute(minute: number | null | undefined, status?: string) {
  if (minute == null || !Number.isFinite(minute)) {
    if (status && /HT|intervalo/i.test(status)) return "HT";
    return "—";
  }
  return `${Math.max(0, Math.floor(minute))}′`;
}

function LiveScoreBadge({
  scoreLabel,
  minute,
  status,
  compact = false,
}: {
  scoreLabel?: string | null;
  minute?: number | null;
  status?: string;
  compact?: boolean;
}) {
  if (!scoreLabel) {
    return <span className="live-score-empty">—</span>;
  }

  return (
    <div className={`live-score-badge ${compact ? "compact" : ""}`}>
      <strong className="live-score-num">{scoreLabel}</strong>
      <span className="live-score-min">
        <span className="dot-live" aria-hidden />
        {formatLiveMinute(minute, status)}
      </span>
    </div>
  );
}

function GameRow({
  row,
  liveRow,
  active,
  favorited,
  onToggleFavorite,
  onOpen,
}: {
  row: OpportunityRow;
  liveRow?: LivePayload["rows"][number];
  active?: boolean;
  favorited: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
}) {
  const a = row.analysis;
  const plan = liveRow?.tradePlan ?? a.tradePlan;
  const live = liveRow?.live ?? null;
  const isLive = Boolean(live);
  const status = tradeStatus(plan);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`match-card ${active ? "is-active" : ""} ${isLive ? "is-live" : ""} ${favorited ? "is-fav" : ""}`.trim()}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="match-card-fav">
        <FavoriteStarButton active={favorited} onToggle={onToggleFavorite} size="sm" />
      </div>

      <div className="match-card-time">
        {isLive ? (
          <>
            <span className="match-card-live-tag">
              <span className="dot-live" /> AO VIVO
            </span>
            <strong>{formatLiveMinute(live?.minute, live?.status)}</strong>
          </>
        ) : (
          <>
            <span className="match-card-date">{formatKickDate(a.start)}</span>
            <strong>{formatKickTime(a.start)}</strong>
          </>
        )}
      </div>

      <div className="match-card-center">
        <div className="match-card-line">
          <strong className="match-card-teams">
            {a.home} <span>x</span> {a.away}
          </strong>
          {isLive && live?.scoreLabel ? (
            <span className="match-card-score">{live.scoreLabel}</span>
          ) : null}
          <span className="match-card-comp">{a.competition || "Futebol"}</span>
          <span className={`status-chip status-${status.toLowerCase()}`}>{status}</span>
        </div>
      </div>

      <MatchCardPressure
        home={a.home}
        away={a.away}
        start={a.start}
        enabled={isLive}
      />

      <div className="match-card-odds">
        <OddsQuoteButtons
          backOdds={a.quotes?.back.odds}
          backAmount={a.quotes?.back.amount ?? 0}
          layOdds={a.quotes?.lay.odds}
          layAmount={a.quotes?.lay.amount ?? 0}
          href={row.mexchangeUrl}
          size="sm"
        />
      </div>
    </div>
  );
}

function EventDetail({
  selected,
  liveForSelected,
  activeTrade,
  detailOpen,
  favorited,
  onToggleFavorite,
  onToggle,
}: {
  selected: OpportunityRow;
  liveForSelected?: LivePayload["rows"][number];
  activeTrade?: TradePlan;
  detailOpen: Record<string, boolean>;
  favorited: boolean;
  onToggleFavorite: () => void;
  onToggle: (key: string) => void;
}) {
  const a = selected.analysis;

  return (
    <div className="event-detail">
      <div className="event-hero">
        <div>
          <div className="event-hero-title-row">
            <p className="eyebrow">{a.competition || "Futebol"}</p>
            <FavoriteStarButton
              active={favorited}
              onToggle={onToggleFavorite}
              size="md"
            />
          </div>
          <h3>
            {a.home} <span>vs</span> {a.away}
          </h3>
          {favorited && (
            <p className="fav-hint">
              Favorito · no topo da lista · notificações de gol ativas
            </p>
          )}
          {liveForSelected?.live ? (
            <LiveScoreBadge
              scoreLabel={liveForSelected.live.scoreLabel}
              minute={liveForSelected.live.minute}
              status={liveForSelected.live.status}
            />
          ) : (
            <p className="event-kick">Início {formatKickoff(a.start)}</p>
          )}
          <p className="event-summary">{a.summary}</p>
        </div>
        <div className="event-hero-actions">
          <OddsQuoteButtons
            backOdds={a.quotes?.back.odds}
            backAmount={a.quotes?.back.amount ?? 0}
            layOdds={a.quotes?.lay.odds}
            layAmount={a.quotes?.lay.amount ?? 0}
            href={selected.mexchangeUrl}
            size="md"
          />
          <a className="btn-primary" href={selected.mexchangeUrl} target="_blank" rel="noreferrer">
            Abrir na Bolsa
          </a>
          <span className={`status-chip status-${tradeStatus(activeTrade).toLowerCase()}`}>
            {tradeStatus(activeTrade)}
          </span>
        </div>
      </div>

      <div className="metric-strip">
        <div>
          <span>Lay</span>
          <strong>{activeTrade?.layOdds?.toFixed(0) ?? a.layOdds?.toFixed(0) ?? "—"}</strong>
        </div>
        <div>
          <span>Alvo back</span>
          <strong>{activeTrade?.targetBackOdds?.toFixed(0) ?? "—"}</strong>
        </div>
        <div>
          <span>Score</span>
          <strong>{a.score}</strong>
        </div>
        <div>
          <span>BTTS / Over</span>
          <strong>
            {a.bttsYes?.toFixed(2) ?? "—"} / {a.over25?.toFixed(2) ?? "—"}
          </strong>
        </div>
      </div>

      <div className="detail-stack">
        <CollapsePanel
          title="Plano de trade"
          subtitle={activeTrade?.summary ?? "Lay 3-3 e saída no back"}
          open={detailOpen.trade}
          onToggle={() => onToggle("trade")}
          badge={<span className="tag tag-watch">{tradeStatus(activeTrade)}</span>}
        >
              {activeTrade?.example && (
                <p className="trade-example">
                  Ex. stake R$ {activeTrade.example.layStake}: liability R${" "}
                  {activeTrade.example.liability.toFixed(2)} → back R${" "}
                  {activeTrade.example.backStake?.toFixed(2) ?? "—"} · lucro R${" "}
                  {activeTrade.example.profit?.toFixed(2) ?? "—"}
                  {activeTrade.risk?.requiredMovePct != null
                    ? ` · odd precisa subir ~${activeTrade.risk.requiredMovePct.toFixed(0)}%`
                    : ""}
                </p>
              )}
              {activeTrade?.risk && (
                <p className={`trade-oscillation risk-${activeTrade.risk.tier}`}>
                  Risco {activeTrade.risk.tier}: {activeTrade.risk.detail}
                </p>
              )}
              {activeTrade?.fluidity && (
                <p className="trade-oscillation">{activeTrade.fluidity.detail}</p>
              )}
              {activeTrade?.correction && (
                <p className="trade-oscillation">
                  Correção: {activeTrade.correction.summary}
                  {activeTrade.correction.avgCorrectionMinutes != null
                    ? ` · média ${activeTrade.correction.avgCorrectionMinutes.toFixed(1)} min`
                    : ""}
                </p>
              )}
              {activeTrade?.correction?.underdogCrash?.matched && (
                <p className="trade-oscillation crash-pattern">
                  Zebra-crash {activeTrade.correction.underdogCrash.quality}:{" "}
                  {activeTrade.correction.underdogCrash.peakOdd.toFixed(0)}→
                  {activeTrade.correction.underdogCrash.troughOdd.toFixed(0)} (
                  {(activeTrade.correction.underdogCrash.dropPct * 100).toFixed(0)}
                  %)
                  {activeTrade.correction.underdogCrash.favorsQuickBounce
                    ? " · bounce rápido provável"
                    : ""}
                </p>
              )}
        </CollapsePanel>

        <CollapsePanel
          title="Confirmação live"
          subtitle={
            liveForSelected?.live
              ? `${liveForSelected.live.scoreLabel} · ${liveForSelected.live.minute ?? "?"}′`
              : "Feed ao vivo"
          }
          open={detailOpen.live}
          onToggle={() => onToggle("live")}
          badge={
            liveForSelected?.confirmed ? (
              <span className="tag tag-entry">ENTRADA</span>
            ) : undefined
          }
        >
          {liveForSelected?.live ? (
            <div className="live-box bare">
              <p>
                Placar <strong>{liveForSelected.live.scoreLabel}</strong> ·{" "}
                {liveForSelected.live.minute ?? "?"}′ ·{" "}
                {liveForSelected.confirmed ? (
                  <span className="tag tag-entry">ENTRADA</span>
                ) : (
                  <span className="tag">monitorando</span>
                )}
              </p>
              {liveForSelected.reasons?.length ? (
                <ul>
                  {liveForSelected.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="empty">Sem feed ao vivo para este evento no momento.</p>
          )}
        </CollapsePanel>

        <CollapsePanel
          title="Análise de momento"
          subtitle="Pré × live × fluidez × correção"
          open={detailOpen.moment}
          onToggle={() => onToggle("moment")}
        >
          <MomentAnalysisCard eventId={a.eventId} />
        </CollapsePanel>

        <CollapsePanel
          title="xG & pressão"
          subtitle="Sofascore · expected goals e attack momentum"
          open={detailOpen.intel}
          onToggle={() => onToggle("intel")}
        >
          <MatchIntelCard home={a.home} away={a.away} start={a.start} />
        </CollapsePanel>

        <CollapsePanel
          title="Sinais pré-live"
          subtitle={`Score ${a.score}/100`}
          open={detailOpen.signals}
          onToggle={() => onToggle("signals")}
        >
          <div className="signals">
            {a.signals.map((s) => (
              <article key={s.id} className={`signal level-${s.level}`}>
                <header>
                  <strong>{s.label}</strong>
                  <span>{s.score}</span>
                </header>
                <p>{s.detail}</p>
              </article>
            ))}
          </div>
        </CollapsePanel>

        <CollapsePanel
          title="Gráfico odd & volume"
          subtitle="Movimentação e matched"
          open={detailOpen.chart}
          onToggle={() => onToggle("chart")}
        >
          <OddsVolumeChart
            runnerId={a.runnerId}
            marketId={a.marketId}
            eventId={a.eventId}
            layOddsHint={a.layOdds}
            title={`Odd 3-3 · ${a.home} vs ${a.away}`}
          />
        </CollapsePanel>
      </div>
    </div>
  );
}
