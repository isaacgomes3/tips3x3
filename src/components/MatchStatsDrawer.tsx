"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { MomentumChart } from "@/components/MomentumChart";
import type { FotmobRichMatch, FotmobPlayerCard } from "@/lib/fotmob/rich";
import type { SofaGraphPoint } from "@/lib/sofascore/types";

export type StatsTarget = {
  eventId?: string;
  home: string;
  away: string;
  start?: string;
  scoreLabel?: string | null;
  minute?: number | null;
  status?: string;
  competition?: string;
};

type StatsPayload = {
  found?: boolean;
  source?: string | null;
  home?: string;
  away?: string;
  scoreLabel?: string | null;
  minute?: string | number | null;
  status?: string | null;
  stats?: Array<{ name: string; home: string; away: string }>;
  timeline?: Array<{
    team?: string;
    teamName?: string;
    type?: string;
    minute?: string;
    at?: string;
  }>;
  pressure?: {
    points: SofaGraphPoint[];
    homeBias: number;
    awayBias: number;
    latest: number | null;
    summary: string;
  } | null;
  fotmob?: FotmobRichMatch | null;
  url?: string | null;
  message?: string;
  error?: string;
};

type TabKey = "resumo" | "escalacao" | "forma" | "tabela" | "stats" | "timeline";

function parseNum(v: string): number | null {
  const n = parseFloat(String(v).replace("%", "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

function ratingClass(r: number | null) {
  if (r == null) return "is-muted";
  if (r >= 7) return "is-good";
  if (r >= 6.5) return "is-ok";
  return "is-low";
}

function PossessionBar({
  home,
  away,
  homeColor,
  awayColor,
}: {
  home: string;
  away: string;
  homeColor: string;
  awayColor: string;
}) {
  const h = parseNum(home) ?? 50;
  const a = parseNum(away) ?? 50;
  const total = h + a || 1;
  const homePct = (h / total) * 100;
  return (
    <div className="fm-top-stat">
      <div className="fm-possession">
        <span className="fm-poss-home" style={{ width: `${homePct}%`, background: homeColor }}>
          {home.includes("%") ? home : `${Math.round(h)}%`}
        </span>
        <span
          className="fm-poss-away"
          style={{ width: `${100 - homePct}%`, background: awayColor }}
        >
          {away.includes("%") ? away : `${Math.round(a)}%`}
        </span>
      </div>
      <p className="fm-top-stat-label">Posse de bola</p>
    </div>
  );
}

function TopStatRow({
  name,
  home,
  away,
  homeColor,
}: {
  name: string;
  home: string;
  away: string;
  homeColor: string;
}) {
  const h = parseNum(home);
  const a = parseNum(away);
  const homeWins = h != null && a != null && h >= a;
  return (
    <div className="fm-top-stat-row">
      <span className={`fm-pill ${homeWins ? "is-lead" : ""}`} style={homeWins ? { background: homeColor } : undefined}>
        {home}
      </span>
      <span className="fm-top-stat-name">{name}</span>
      <span className={`fm-pill-plain ${!homeWins && h != null && a != null ? "is-lead-plain" : ""}`}>
        {away}
      </span>
    </div>
  );
}

function PlayerNode({ player }: { player: FotmobPlayerCard }) {
  return (
    <div
      className="fm-player"
      style={{ left: `${player.x * 100}%`, top: `${player.y * 100}%` }}
    >
      {player.subOutMinute != null ? (
        <span className="fm-player-sub">{player.subOutMinute}&apos;</span>
      ) : null}
      <div className="fm-player-avatar">
        <span>{player.shirtNumber || "·"}</span>
        {player.rating != null ? (
          <em className={`fm-rating ${ratingClass(player.rating)}`}>
            {player.rating.toFixed(1)}
          </em>
        ) : null}
        {player.goals > 0 ? <i className="fm-player-goal">⚽</i> : null}
        {player.yellow ? <i className="fm-disc is-yellow" /> : null}
        {player.red ? <i className="fm-disc is-red" /> : null}
      </div>
      <p>
        {player.shirtNumber ? `${player.shirtNumber} ` : ""}
        {player.shortName}
        {player.isCaptain ? " (C)" : ""}
      </p>
    </div>
  );
}

function FormColumn({
  title,
  matches,
}: {
  title: string;
  matches: FotmobRichMatch["teamForm"]["home"];
}) {
  return (
    <div className="fm-form-col">
      <h4>{title}</h4>
      <ul>
        {matches.map((m, i) => (
          <li key={`${m.scoreLabel}-${i}`}>
            <span className="fm-form-home">{m.homeName}</span>
            <span className={`fm-form-score is-${m.result.toLowerCase()}`}>
              {m.scoreLabel}
            </span>
            <span className="fm-form-away">{m.awayName}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MatchStatsDrawer({
  target,
  onClose,
}: {
  target: StatsTarget | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabKey>("resumo");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!target) {
      setData(null);
      setTab("resumo");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          home: target.home,
          away: target.away,
        });
        if (target.eventId) qs.set("eventId", target.eventId);
        if (target.start) qs.set("start", target.start);
        const res = await fetch(`/api/match-stats?${qs}`);
        const json = (await res.json()) as StatsPayload;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setData({
            error: e instanceof Error ? e.message : "Falha ao carregar stats",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(load, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  if (!target) return null;

  const fm = data?.fotmob;
  const homeName = fm?.homeName || data?.home || target.home;
  const awayName = fm?.awayName || data?.away || target.away;
  const score =
    (fm?.scoreLabel ?? data?.scoreLabel ?? target.scoreLabel)?.replace(
      "-",
      " - ",
    ) ?? "—";
  const minuteNum =
    data?.minute != null
      ? Number(data.minute)
      : target.minute != null
        ? Number(target.minute)
        : null;
  const minuteLabel =
    minuteNum != null && Number.isFinite(minuteNum)
      ? `${minuteNum}'`
      : data?.status ?? fm?.status ?? target.status ?? "";

  // Cores fixas estilo FotMob (azul casa / amarelo fora)
  const homeColor = "#3C9BDB";
  const awayColor = "#F5C400";
  const momentumPoints = fm?.momentum?.length
    ? fm.momentum
    : (data?.pressure?.points ?? []);
  const topStats = fm?.topStats?.length
    ? fm.topStats
    : (data?.stats ?? []).slice(0, 6);
  const possession = topStats.find((s) => /posse|possession/i.test(s.name));
  const otherTop = topStats.filter((s) => s !== possession);

  const hasLineupPlayers = Boolean(
    fm?.lineup?.home?.starters?.length || fm?.lineup?.away?.starters?.length,
  );

  const tabs: Array<{ key: TabKey; label: string; show?: boolean }> = [
    { key: "resumo", label: "Resumo" },
    { key: "escalacao", label: "Escalação", show: hasLineupPlayers },
    {
      key: "forma",
      label: "Forma",
      show: Boolean(fm?.teamForm.home.length || fm?.teamForm.away.length),
    },
    { key: "tabela", label: "Tabela", show: Boolean(fm?.table?.rows.length) },
    { key: "stats", label: "Stats" },
    { key: "timeline", label: "Timeline" },
  ];

  const visibleTabs = tabs.filter((t) => t.show !== false);
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : "resumo";

  return (
    <div className="stats-drawer-root" role="presentation">
      <button
        type="button"
        className="stats-drawer-scrim"
        aria-label="Fechar estatísticas"
        onClick={onClose}
      />
      <aside
        className="stats-drawer fm-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Estatísticas do jogo"
      >
        <div className="fm-drawer-chrome">
          <header className="fm-drawer-head">
            <div className="fm-scoreboard">
              <div className="fm-team is-home">
                {fm?.homeLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fm.homeLogo} alt="" width={36} height={36} />
                ) : null}
                <strong>{homeName}</strong>
              </div>
              <div className="fm-score-mid">
                <strong>{score}</strong>
                {minuteLabel ? <em>{minuteLabel}</em> : null}
              </div>
              <div className="fm-team is-away">
                <strong>{awayName}</strong>
                {fm?.awayLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fm.awayLogo} alt="" width={36} height={36} />
                ) : null}
              </div>
            </div>
            {(target.competition ?? fm?.competition) ? (
              <p className="fm-comp">{target.competition ?? fm?.competition}</p>
            ) : null}
            <button
              type="button"
              className="stats-drawer-close"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X />
            </button>
          </header>

          <nav className="fm-tabs" aria-label="Abas">
            {visibleTabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={activeTab === t.key ? "is-active" : ""}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
          </nav>
        </div>

        <div ref={bodyRef} className="stats-drawer-body fm-body">
          {loading && !data ? (
            <p className="stats-drawer-muted">Carregando estatísticas…</p>
          ) : null}
          {data?.error ? <p className="banner-error">{data.error}</p> : null}
          {data && data.found === false ? (
            <p className="stats-drawer-muted">
              {data.message ?? "Sem estatísticas para este jogo."}
            </p>
          ) : null}

          {activeTab === "resumo" && (
            <div className="fm-overview">
              <section className="fm-card">
                <div className="fm-card-split">
                  <div className="fm-card-block">
                    <h3>Momentum</h3>
                    {momentumPoints.length ? (
                      <MomentumChart
                        points={momentumPoints}
                        goals={fm?.goals ?? []}
                        homeColor={homeColor}
                        awayColor={awayColor}
                        currentMinute={minuteNum}
                      />
                    ) : (
                      <p className="stats-drawer-muted">
                        Momentum ainda não disponível para este jogo.
                      </p>
                    )}
                  </div>
                  <div className="fm-card-block">
                    <h3>Top stats</h3>
                    {possession ? (
                      <PossessionBar
                        home={possession.home}
                        away={possession.away}
                        homeColor={homeColor}
                        awayColor={awayColor}
                      />
                    ) : null}
                    {otherTop.map((row) => (
                      <TopStatRow
                        key={row.name}
                        name={row.name}
                        home={row.home}
                        away={row.away}
                        homeColor={homeColor}
                      />
                    ))}
                    {!possession && !otherTop.length ? (
                      <p className="stats-drawer-muted">Sem top stats ainda.</p>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === "escalacao" && fm?.lineup && (
            <div className="fm-lineup">
              {!hasLineupPlayers ? (
                <p className="stats-drawer-muted">
                  Escalação ainda não disponível para este jogo.
                </p>
              ) : null}
              <div className="fm-lineup-head">
                <div>
                  {fm.lineup.home?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fm.lineup.home.logoUrl} alt="" width={28} height={28} />
                  ) : null}
                  <div>
                    <strong>{fm.lineup.home?.name}</strong>
                    <span>{fm.lineup.home?.formation}</span>
                  </div>
                  {fm.lineup.home?.rating != null ? (
                    <em className={`fm-rating ${ratingClass(fm.lineup.home.rating)}`}>
                      {fm.lineup.home.rating.toFixed(1)}
                    </em>
                  ) : null}
                </div>
                <div>
                  {fm.lineup.away?.rating != null ? (
                    <em className={`fm-rating ${ratingClass(fm.lineup.away.rating)}`}>
                      {fm.lineup.away.rating.toFixed(1)}
                    </em>
                  ) : null}
                  <div>
                    <strong>{fm.lineup.away?.name}</strong>
                    <span>{fm.lineup.away?.formation}</span>
                  </div>
                  {fm.lineup.away?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fm.lineup.away.logoUrl} alt="" width={28} height={28} />
                  ) : null}
                </div>
              </div>

              <div className="fm-pitch">
                <div className="fm-pitch-half is-home">
                  {(fm.lineup.home?.starters ?? []).map((p) => (
                    <PlayerNode key={p.id} player={p} />
                  ))}
                </div>
                <div className="fm-pitch-half is-away">
                  {(fm.lineup.away?.starters ?? []).map((p) => (
                    <PlayerNode
                      key={p.id}
                      player={{ ...p, y: 1 - p.y }}
                    />
                  ))}
                </div>
              </div>

              <div className="fm-coaches">
                <span>{fm.lineup.home?.coach ?? "—"}</span>
                <em>Técnicos</em>
                <span>{fm.lineup.away?.coach ?? "—"}</span>
              </div>
            </div>
          )}

          {activeTab === "forma" && fm && (
            <div className="fm-form">
              <h3>Team form</h3>
              <div className="fm-form-grid">
                <FormColumn title={homeName} matches={fm.teamForm.home} />
                <FormColumn title={awayName} matches={fm.teamForm.away} />
              </div>
            </div>
          )}

          {activeTab === "tabela" && fm?.table && (
            <div className="fm-table-wrap">
              <h3>{fm.table.leagueName}</h3>
              <div className="fm-table-scroll">
                <table className="fm-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Time</th>
                      <th>J</th>
                      <th>V</th>
                      <th>E</th>
                      <th>D</th>
                      <th>+/-</th>
                      <th>SG</th>
                      <th>Pts</th>
                      <th>Forma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fm.table.rows.map((row) => (
                      <tr
                        key={row.id}
                        className={row.highlight ? "is-highlight" : ""}
                      >
                        <td>
                          {row.qualColor ? (
                            <i
                              className="fm-qual"
                              style={{ background: row.qualColor }}
                            />
                          ) : null}
                          {row.idx}
                        </td>
                        <td>
                          <span className="fm-table-team">
                            {row.name}
                            {row.ongoingScore ? (
                              <em className="fm-live-badge">{row.ongoingScore}</em>
                            ) : null}
                          </span>
                        </td>
                        <td>{row.played}</td>
                        <td>{row.wins}</td>
                        <td>{row.draws}</td>
                        <td>{row.losses}</td>
                        <td>{row.scoresStr}</td>
                        <td>{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                        <td>
                          <strong>{row.pts}</strong>
                        </td>
                        <td>
                          <span className="fm-form-dots">
                            {row.form.map((f, i) => (
                              <i key={i} className={`is-${f.toLowerCase()}`}>
                                {f}
                              </i>
                            ))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "stats" && (
            <section className="fm-card fm-all-stats">
              <div className="stats-list">
              {(fm?.allStats?.length ? fm.allStats : data?.stats ?? []).map(
                (row) => {
                  const h = parseNum(row.home);
                  const a = parseNum(row.away);
                  const total = (h ?? 0) + (a ?? 0);
                  const homePct =
                    total > 0 && h != null ? (h / total) * 100 : 50;
                  return (
                    <div className="stats-row" key={row.name}>
                      <div className="stats-row-vals">
                        <strong className="is-home">{row.home}</strong>
                        <span className="stats-row-name">{row.name}</span>
                        <strong className="is-away">{row.away}</strong>
                      </div>
                      <div className="stats-bar-track" aria-hidden>
                        <span
                          className="stats-bar-home"
                          style={{ width: `${homePct}%`, background: homeColor }}
                        />
                        <span
                          className="stats-bar-away"
                          style={{
                            width: `${100 - homePct}%`,
                            background: awayColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                },
              )}
              </div>
            </section>
          )}

          {activeTab === "timeline" && (
            <ul className="stats-timeline">
              {(data?.timeline ?? []).length === 0 && !(fm?.goals.length) ? (
                <li className="stats-drawer-muted">Sem eventos na timeline.</li>
              ) : (
                <>
                  {(fm?.goals ?? []).map((g, i) => (
                    <li key={`g-${i}`}>
                      <strong>{g.minute}&apos;</strong>
                      <span>
                        Gol · {g.isHome ? homeName : awayName}
                        {g.player ? ` · ${g.player}` : ""}
                      </span>
                    </li>
                  ))}
                  {(data?.timeline ?? []).map((u, i) => (
                    <li key={`${u.at}-${i}`}>
                      <strong>{u.minute ? `${u.minute}'` : "—"}</strong>
                      <span>
                        {u.type ?? "EVENT"} · {u.teamName ?? u.team ?? "—"}
                      </span>
                    </li>
                  ))}
                </>
              )}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
