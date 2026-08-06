"use client";

import { useState, useEffect } from "react";
import {
  LAY_OVER_LIMIT_PRESSURE,
  getLolpStakePct,
  getLolpTargetProfitPct,
  setLolpStakePct,
  setLolpTargetProfitPct,
} from "@/lib/analysis/lay-over-limit-pressure";
import { syncAutoLayBackground } from "@/lib/betbra/auto-lay-bg";
import {
  isLayOverLimitPressureEnabled,
  setLayOverLimitPressureEnabled,
} from "@/lib/strategy-settings";
import { CollapsePanel } from "./CollapsePanel";

export function LayOverLimitPressurePanel() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [targetProfitPct, setTargetProfitPct] = useState<number>(
    LAY_OVER_LIMIT_PRESSURE.defaultTargetProfitPct,
  );
  const [stakePct, setStakePct] = useState<number>(
    LAY_OVER_LIMIT_PRESSURE.defaultStakePct,
  );

  useEffect(() => {
    setTargetProfitPct(getLolpTargetProfitPct());
    setStakePct(getLolpStakePct());
    setEnabled(isLayOverLimitPressureEnabled());
  }, []);

  const handleProfitChange = (value: number) => {
    setTargetProfitPct(setLolpTargetProfitPct(value));
    void syncAutoLayBackground();
  };

  const handleStakeChange = (value: number) => {
    setStakePct(setLolpStakePct(value));
    void syncAutoLayBackground();
  };

  const handleEnabledChange = (checked: boolean) => {
    setEnabled(checked);
    setLayOverLimitPressureEnabled(checked);
    void syncAutoLayBackground();
  };

  const badge = enabled ? (
    <span className="badge badge-success">Ativo</span>
  ) : (
    <span className="badge badge-muted">Desativo</span>
  );

  return (
    <CollapsePanel
      title="Lay Over Limite com Pressão"
      subtitle="Varre mercados de gol limite · Cruza estatísticas e pressão"
      open={open}
      onToggle={() => setOpen(!open)}
      badge={badge}
      className="lay-over-limit-pressure-panel"
    >
      <div className="panel-content">
        {/* Ativação */}
        <div className="setting-group">
          <label className="setting-label">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => handleEnabledChange(e.target.checked)}
              className="setting-checkbox"
            />
            <span>Ativar filtro</span>
          </label>
          <p className="setting-hint">
            Quando ativo, o sistema varre os jogos nos mercados de gol limite
            (Over 2.5, 3.5, 4.5) e aplica análise cruzada de estatísticas.
          </p>
        </div>

        {/* Objetivo de Lucro */}
        <div className="setting-group">
          <label className="setting-label">Objetivo de Lucro</label>
          <div className="setting-input-row">
            <input
              type="number"
              min="0.001"
              max="0.1"
              step="0.001"
              value={targetProfitPct}
              onChange={(e) => handleProfitChange(parseFloat(e.target.value) || 0)}
              className="setting-input"
            />
            <span className="setting-unit">
              {(targetProfitPct * 100).toFixed(1)}%
            </span>
          </div>
          <p className="setting-hint">
            Default: {(LAY_OVER_LIMIT_PRESSURE.defaultTargetProfitPct * 100).toFixed(1)}% · Intervalo: 0,1% a 10%
          </p>
        </div>

        {/* % da Banca */}
        <div className="setting-group">
          <label className="setting-label">% da Banca por Aposta</label>
          <div className="setting-input-row">
            <input
              type="number"
              min="0.01"
              max="0.2"
              step="0.01"
              value={stakePct}
              onChange={(e) => handleStakeChange(parseFloat(e.target.value) || 0)}
              className="setting-input"
            />
            <span className="setting-unit">
              {(stakePct * 100).toFixed(1)}%
            </span>
          </div>
          <p className="setting-hint">
            Default: {(LAY_OVER_LIMIT_PRESSURE.defaultStakePct * 100).toFixed(1)}% · Intervalo: 1% a 20%
          </p>
        </div>

        {/* Configurações Críticas */}
        <div className="setting-group info-group">
          <h3 className="setting-subheading">Análise Cruzada (Automática)</h3>
          <ul className="setting-list">
            <li>
              <strong>Ticks/min:</strong> Mínimo {LAY_OVER_LIMIT_PRESSURE.minFavorTicksPerMin} a
              favor (odd lay subindo)
            </li>
            <li>
              <strong>Fluidez:</strong> Oscilação min {(LAY_OVER_LIMIT_PRESSURE.fluidity.minSwingPct * 100).toFixed(1)}% ·
              Matched min R$ {LAY_OVER_LIMIT_PRESSURE.fluidity.minMatchedTotal}
            </li>
            <li>
              <strong>Correção:</strong> Drop min {(LAY_OVER_LIMIT_PRESSURE.correction.minDropPct * 100).toFixed(1)}% ·
              Até {LAY_OVER_LIMIT_PRESSURE.correction.maxDropMinutes} min
            </li>
            <li>
              <strong>Faixa Odd:</strong> {LAY_OVER_LIMIT_PRESSURE.oddsBand.min}–{LAY_OVER_LIMIT_PRESSURE.oddsBand.max} ·
              Preferida {LAY_OVER_LIMIT_PRESSURE.oddsBand.preferredMin}–{LAY_OVER_LIMIT_PRESSURE.oddsBand.preferredMax}
            </li>
            <li>
              <strong>Gap:</strong> Máximo {LAY_OVER_LIMIT_PRESSURE.maxGapTicks} ticks
            </li>
          </ul>
        </div>

        {/* Análise de Pressão */}
        <div className="setting-group info-group">
          <h3 className="setting-subheading">Pressão em Tempo Real</h3>
          <ul className="setting-list">
            <li>
              <strong>Pressão do Favorito:</strong>{" "}
              &lt; {LAY_OVER_LIMIT_PRESSURE.pressure.maxFavoritePressureBias.toFixed(2)} = entrada rápida OK
            </li>
            <li>
              <strong>Chutes/min:</strong> Máximo{" "}
              {LAY_OVER_LIMIT_PRESSURE.pressure.maxShotsPerMinFavorite.toFixed(1)}
            </li>
            <li>
              <strong>Pressão na Área:</strong> Máximo{" "}
              {LAY_OVER_LIMIT_PRESSURE.pressure.maxAreaPressurePerMin.toFixed(1)} passes/min
            </li>
            <li className="setting-list-note">
              O sistema valida estas métricas no gráfico de pressão antes de confirmar entrada.
            </li>
          </ul>
        </div>

        {/* Linhas Monitoradas */}
        <div className="setting-group info-group">
          <h3 className="setting-subheading">Linhas de Over Monitoradas (5 linhas)</h3>
          <div className="lines-grid">
            {LAY_OVER_LIMIT_PRESSURE.lines.map((line) => (
              <div key={line} className="line-badge">
                Over {line.toFixed(1)}
              </div>
            ))}
          </div>
          <p className="setting-hint">
            Cobre toda cobertura de gol limite: desde 0-0 (0.5) até 4+ gols (4.5).
          </p>
        </div>
      </div>

      <style jsx>{`
        .lay-over-limit-pressure-panel {
          --color-primary: #0f766e;
          --color-primary-light: #14b8a6;
          --color-warning: #ea580c;
          --color-success: #16a34a;
          --color-muted: #6b7280;
        }

        .panel-content {
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .setting-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .setting-label {
          font-weight: 600;
          font-size: 0.95rem;
          color: #1f2937;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }

        .setting-checkbox {
          width: 1rem;
          height: 1rem;
          cursor: pointer;
          accent-color: var(--color-primary);
        }

        .setting-input-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .setting-input {
          flex: 1;
          max-width: 150px;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 0.95rem;
          font-family: monospace;
          transition: border-color 0.2s;
        }

        .setting-input:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
        }

        .setting-unit {
          min-width: 50px;
          text-align: right;
          font-weight: 600;
          color: var(--color-primary);
          font-size: 0.9rem;
        }

        .setting-hint {
          font-size: 0.85rem;
          color: var(--color-muted);
          margin: 0;
        }

        .setting-subheading {
          font-size: 0.95rem;
          font-weight: 600;
          color: #374151;
          margin: 0.5rem 0 0.75rem 0;
        }

        .info-group {
          background: #f3f4f6;
          border-left: 3px solid var(--color-primary);
          padding: 1rem;
          border-radius: 0.375rem;
        }

        .setting-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .setting-list li {
          font-size: 0.9rem;
          color: #374151;
          padding: 0.25rem 0;
        }

        .setting-list-note {
          font-style: italic;
          color: var(--color-muted);
          margin-top: 0.5rem;
        }

        .lines-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .line-badge {
          padding: 0.5rem 1rem;
          background: white;
          border: 1px solid var(--color-primary);
          border-radius: 9999px;
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--color-primary);
        }

        .badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .badge-success {
          background: #dcfce7;
          color: #166534;
        }

        .badge-muted {
          background: #f3f4f6;
          color: #6b7280;
        }
      `}</style>
    </CollapsePanel>
  );
}
