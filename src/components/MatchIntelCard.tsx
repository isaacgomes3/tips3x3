"use client";

import { useEffect, useState } from "react";
import { PressureSparkline } from "@/components/PressureSparkline";
import type { MatchIntel } from "@/lib/sofascore/types";

type Payload =
  | { found: true; intel: MatchIntel }
  | { found: false; message?: string }
  | { error: string };

export function MatchIntelCard({
  home,
  away,
  start,
}: {
  home: string;
  away: string;
  start?: string;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ home, away });
        if (start) qs.set("start", start);
        const res = await fetch(`/api/match-intel?${qs}`);
        const json = (await res.json()) as Payload;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setData({
            error: e instanceof Error ? e.message : "Falha ao carregar inteligência",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(load, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [home, away, start]);

  if (loading && !data) {
    return <div className="banner-info">Buscando xG e pressão no Sofascore…</div>;
  }

  if (!data) return null;
  if ("error" in data) return <div className="banner-error">{data.error}</div>;
  if (!data.found) {
    return (
      <p className="empty">
        {data.message ?? "Sem dados de xG/pressão para este confronto."}
      </p>
    );
  }

  const { intel } = data;

  return (
    <div className="match-intel">
      <div className="match-intel-head">
        <div>
          <strong>{intel.matchName}</strong>
          <p>
            {intel.competition ?? "Sofascore"}
            {intel.scoreLabel ? ` · ${intel.scoreLabel}` : ""}
            {intel.status ? ` · ${intel.status}` : ""}
          </p>
        </div>
        <a href={intel.sofascoreUrl} target="_blank" rel="noreferrer" className="btn-secondary">
          Abrir Sofascore
        </a>
      </div>

      <div className="xg-strip">
        <div>
          <span>xG casa</span>
          <strong>{intel.xg.home?.toFixed(2) ?? "—"}</strong>
        </div>
        <div>
          <span>xG fora</span>
          <strong>{intel.xg.away?.toFixed(2) ?? "—"}</strong>
        </div>
        <div>
          <span>Pressão casa</span>
          <strong>{Math.round(intel.pressure.homeBias * 100)}%</strong>
        </div>
        <div>
          <span>Pressão fora</span>
          <strong>{Math.round(intel.pressure.awayBias * 100)}%</strong>
        </div>
      </div>

      <p className="match-intel-summary">{intel.pressure.summary}</p>
      {intel.pressure.points.length > 0 ? (
        <PressureSparkline points={intel.pressure.points} />
      ) : (
        <p className="empty">Sem pontos de pressão ainda.</p>
      )}

      {intel.extras.length > 0 && (
        <ul className="match-intel-extras">
          {intel.extras.map((e) => (
            <li key={e.name}>
              <span>{e.name}</span>
              <strong>
                {e.home} · {e.away}
              </strong>
            </li>
          ))}
        </ul>
      )}

      <p className="match-intel-foot">Match: {intel.matchedBy}</p>
    </div>
  );
}
