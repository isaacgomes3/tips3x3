"use client";

import type { LayOverLimitPressureSnapshot } from "@/lib/analysis/lay-over-limit-pressure";

/** O snapshot vem do /api/live já com o jogo e o link do mercado. */
export type LayOverLimitPressureResult = LayOverLimitPressureSnapshot & {
  eventId?: string;
  eventName?: string;
  mexchangeUrl?: string;
};

export interface LayOverLimitPressureResultsProps {
  results: LayOverLimitPressureResult[];
  onSelectResult?: (result: LayOverLimitPressureResult) => void;
}

export function LayOverLimitPressureResults({
  results,
  onSelectResult,
}: LayOverLimitPressureResultsProps) {
  if (results.length === 0) {
    return (
      <div className="results-empty">
        <p>Nenhuma entrada ready no momento.</p>
        <p className="results-empty-hint">
          O sistema varre os mercados de gol limite e mostrará as melhores
          oportunidades aqui.
        </p>
      </div>
    );
  }

  const readyEntries = results.filter((r) => r.entryReady);
  const pendingEntries = results.filter((r) => !r.entryReady);

  return (
    <div className="results-container">
      {readyEntries.length > 0 && (
        <section className="results-section">
          <h3 className="results-section-title">
            🚀 Pronto para Entrada ({readyEntries.length})
          </h3>
          <div className="results-grid">
            {readyEntries.map((result, idx) => (
              <ResultCard
                key={idx}
                result={result}
                isReady={true}
                onClick={() => onSelectResult?.(result)}
              />
            ))}
          </div>
        </section>
      )}

      {pendingEntries.length > 0 && (
        <section className="results-section">
          <h3 className="results-section-title">
            ⏳ Monitorando ({pendingEntries.length})
          </h3>
          <div className="results-grid">
            {pendingEntries.map((result, idx) => (
              <ResultCard
                key={idx}
                result={result}
                isReady={false}
                onClick={() => onSelectResult?.(result)}
              />
            ))}
          </div>
        </section>
      )}

      <style jsx>{`
        .results-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .results-empty {
          text-align: center;
          padding: 2rem 1rem;
          background: #f9fafb;
          border-radius: 0.375rem;
          color: #6b7280;
        }

        .results-empty-hint {
          font-size: 0.875rem;
          margin-top: 0.5rem;
        }

        .results-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .results-section-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: #1f2937;
          margin: 0;
        }

        .results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1rem;
        }
      `}</style>
    </div>
  );
}

function ResultCard({
  result,
  isReady,
  onClick,
}: {
  result: LayOverLimitPressureResult;
  isReady: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`result-card ${isReady ? "is-ready" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      {result.eventName ? (
        <div className="card-event">{result.eventName}</div>
      ) : null}

      {/* Header */}
      <div className="card-header">
        <div className="card-line">
          <span className="card-label">Over</span>
          <strong className="card-value">{result.line.toFixed(1)}</strong>
        </div>
        <div className="card-odds">
          <span className="card-odds-label">Lay</span>
          <strong className="card-odds-value">
            {result.layOdds?.toFixed(2) ?? "—"}
          </strong>
        </div>
        {result.exitPlan && (
          <div className="card-exit">
            <span className="card-exit-label">Back alvo</span>
            <strong className="card-exit-value">
              {result.exitPlan.targetBackOdds.toFixed(2)}
            </strong>
          </div>
        )}
      </div>

      {/* Indicadores */}
      <div className="card-indicators">
        {result.indicators.map((ind) => (
          <div
            key={ind.id}
            className={`indicator indicator-${ind.tone}`}
            title={ind.detail}
          >
            <span className="indicator-icon">{ind.icon}</span>
            <span className="indicator-label">{ind.label}</span>
          </div>
        ))}
      </div>

      {/* Badge de status */}
      <div className="card-status">
        <span className={`status-badge ${isReady ? "status-ready" : "status-pending"}`}>
          {isReady ? "✓ Pronto" : "○ Monitorando"}
        </span>
        <span className="status-count">
          {result.goodCount}/{result.indicators.length} OK
        </span>
      </div>

      {/* Pressão */}
      {result.pressureMetrics && (
        <div className="card-pressure">
          <div className="pressure-item">
            <span className="pressure-label">Pressão:</span>
            <span className={`pressure-value pressure-${result.pressureMetrics.momentRecommendation}`}>
              {result.pressureMetrics.favoritePressureBias?.toFixed(2) ?? "?"}
            </span>
          </div>
          <div className="pressure-recommendation">
            {result.pressureMetrics.momentRecommendation === "entrada-rapida" && (
              <span className="rec-good">Entrada rápida favorável ✓</span>
            )}
            {result.pressureMetrics.momentRecommendation === "esperar" && (
              <span className="rec-warn">Esperar melhora ⌛</span>
            )}
            {result.pressureMetrics.momentRecommendation === "evitar" && (
              <span className="rec-bad">Pressão elevada — evitar ✗</span>
            )}
          </div>
        </div>
      )}

      {/* Exit Plan */}
      {result.exitPlan && (
        <div className="card-exit-plan">
          <div className="exit-row">
            <span className="exit-label">Lucro alvo:</span>
            <strong className="exit-value">
              {(result.exitPlan.targetProfitPct * 100).toFixed(1)}%
            </strong>
          </div>
          <div className="exit-row">
            <span className="exit-label">ETA:</span>
            <strong className="exit-value">
              {result.exitPlan.etaMinutes != null
                ? `~${result.exitPlan.etaMinutes.toFixed(0)} min`
                : "—"}
            </strong>
          </div>
          <div className="exit-row">
            <span className="exit-label">Confiança:</span>
            <strong className={`confidence-${result.exitPlan.confidence}`}>
              {result.exitPlan.confidence.charAt(0).toUpperCase() +
                result.exitPlan.confidence.slice(1)}
            </strong>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="card-summary">
        <p>{result.summary}</p>
      </div>

      <style jsx>{`
        .result-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
          border-left: 4px solid #d1d5db;
        }

        .result-card:hover {
          border-color: #0f766e;
          box-shadow: 0 4px 12px rgba(15, 118, 110, 0.1);
        }

        .result-card.is-ready {
          border-left-color: #16a34a;
          background: #f0fdf4;
        }

        .card-event {
          font-size: 0.8rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }

        .card-line,
        .card-odds,
        .card-exit {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .card-label,
        .card-odds-label,
        .card-exit-label {
          font-size: 0.75rem;
          color: #6b7280;
          font-weight: 500;
          text-transform: uppercase;
        }

        .card-value,
        .card-odds-value,
        .card-exit-value {
          font-size: 1.1rem;
          color: #1f2937;
        }

        .card-indicators {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
          gap: 0.5rem;
        }

        .indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0.5rem;
          border-radius: 0.375rem;
          font-size: 0.75rem;
          font-weight: 500;
          text-align: center;
        }

        .indicator-good {
          background: #dcfce7;
          color: #166534;
        }

        .indicator-warn {
          background: #fef3c7;
          color: #92400e;
        }

        .indicator-bad {
          background: #fee2e2;
          color: #991b1b;
        }

        .indicator-idle {
          background: #f3f4f6;
          color: #6b7280;
        }

        .indicator-icon {
          font-size: 1rem;
          margin-bottom: 0.25rem;
        }

        .indicator-label {
          display: block;
        }

        .card-status {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0;
          border-top: 1px solid #f3f4f6;
          border-bottom: 1px solid #f3f4f6;
        }

        .status-badge {
          font-size: 0.85rem;
          font-weight: 600;
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
        }

        .status-ready {
          background: #dcfce7;
          color: #166534;
        }

        .status-pending {
          background: #f3f4f6;
          color: #6b7280;
        }

        .status-count {
          font-size: 0.8rem;
          color: #6b7280;
        }

        .card-pressure {
          background: #f9fafb;
          padding: 0.75rem;
          border-radius: 0.375rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .pressure-item {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
        }

        .pressure-label {
          color: #6b7280;
          font-weight: 500;
        }

        .pressure-value {
          font-weight: 600;
        }

        .pressure-entrada-rapida {
          color: #16a34a;
        }

        .pressure-esperar {
          color: #ea580c;
        }

        .pressure-evitar {
          color: #dc2626;
        }

        .pressure-recommendation {
          font-size: 0.85rem;
          font-weight: 600;
          text-align: center;
        }

        .rec-good {
          color: #16a34a;
        }

        .rec-warn {
          color: #ea580c;
        }

        .rec-bad {
          color: #dc2626;
        }

        .card-exit-plan {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          background: #eff6ff;
          padding: 0.75rem;
          border-radius: 0.375rem;
          border-left: 3px solid #0f766e;
        }

        .exit-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
        }

        .exit-label {
          color: #6b7280;
          font-weight: 500;
        }

        .exit-value {
          color: #0f766e;
          font-weight: 600;
        }

        .confidence-high {
          color: #16a34a;
        }

        .confidence-medium {
          color: #ea580c;
        }

        .confidence-low {
          color: #6b7280;
        }

        .card-summary {
          font-size: 0.85rem;
          color: #4b5563;
          margin-top: 0.25rem;
        }

        .card-summary p {
          margin: 0;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
