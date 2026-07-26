"use client";

import { useEffect, useState } from "react";

type MomentPayload = {
  llmEnabled?: boolean;
  moment?: {
    verdict: "ENTER" | "WAIT" | "ABORT";
    confidence: number;
    headline: string;
    thesis: string;
    pillars: Array<{
      id: string;
      title: string;
      ok: boolean;
      score: number;
      detail: string;
    }>;
    risks: string[];
    actions: string[];
    source: "rules" | "llm";
    model?: string;
  };
  fluidity?: {
    level: string;
    score: number;
    tradable: boolean;
    lateralized: boolean;
    detail: string;
    blockers: string[];
  };
  error?: string;
};

export function MomentAnalysisCard({ eventId }: { eventId?: string }) {
  const [data, setData] = useState<MomentPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) {
      setData(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/analyze-moment?eventId=${encodeURIComponent(eventId)}`,
        );
        const json = (await res.json()) as MomentPayload;
        if (!res.ok) throw new Error(json.error || "Falha na análise de momento");
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro na análise");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const id = window.setInterval(load, 25000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [eventId]);

  if (!eventId) return null;

  const moment = data?.moment;
  const verdictClass =
    moment?.verdict === "ENTER"
      ? "verdict-enter"
      : moment?.verdict === "ABORT"
        ? "verdict-abort"
        : "verdict-wait";

  return (
    <div className={`moment-card moment-card-nested ${verdictClass}`}>
      <div className="moment-head">
        <h4>Parecer</h4>
        <span className="moment-source">
          {loading && !moment
            ? "analisando…"
            : moment?.source === "llm"
              ? `LLM · ${moment.model ?? "ai"}`
              : data?.llmEnabled
                ? "regras (+ LLM disponível)"
                : "regras"}
        </span>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {moment && (
        <>
          <div className="moment-verdict">
            <strong>{moment.verdict}</strong>
            <span>{moment.confidence}/100</span>
          </div>
          <p className="moment-headline">{moment.headline}</p>
          <p className="moment-thesis">{moment.thesis}</p>

          <div className="moment-pillars">
            {moment.pillars.map((p) => (
              <article key={p.id} className={p.ok ? "ok" : "bad"}>
                <header>
                  <strong>{p.title}</strong>
                  <span>{p.score}</span>
                </header>
                <p>{p.detail}</p>
              </article>
            ))}
          </div>

          {data?.fluidity && (
            <p className="moment-fluidity">
              Fluidez: <strong>{data.fluidity.level}</strong> · {data.fluidity.detail}
              {data.fluidity.lateralized ? " · LATERALIZADO" : ""}
            </p>
          )}

          {moment.risks.length > 0 && (
            <ul className="moment-list">
              {moment.risks.map((r) => (
                <li key={r}>Risco: {r}</li>
              ))}
            </ul>
          )}

          {moment.actions.length > 0 && (
            <ul className="moment-list actions">
              {moment.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
