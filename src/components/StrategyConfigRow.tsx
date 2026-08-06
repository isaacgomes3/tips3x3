"use client";

export type StrategyConfigRowStake = {
  value: number;
  unit: "%" | "R$";
  step: number;
  min: number;
  max?: number;
  onChange: (next: number) => void;
};

export type StrategyConfigRowProps = {
  icon: string;
  name: string;
  tag: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  stake?: StrategyConfigRowStake;
  note?: string;
  /** Filtro fora da faixa de crédito do cliente — mostra cadeado e trava o toggle. */
  locked?: boolean;
  lockedNote?: string;
};

export function StrategyConfigRow({
  icon,
  name,
  tag,
  checked,
  onToggle,
  stake,
  note,
  locked,
  lockedNote,
}: StrategyConfigRowProps) {
  const step = (delta: number) => {
    if (!stake) return;
    const next = Math.round((stake.value + delta) * 100) / 100;
    const clamped = Math.min(
      stake.max ?? Number.POSITIVE_INFINITY,
      Math.max(stake.min, next),
    );
    stake.onChange(clamped);
  };

  return (
    <div className={`cfg-row ${locked ? "is-locked" : ""}`}>
      <span className="cfg-row-icon" aria-hidden>
        {locked ? "🔒" : icon}
      </span>
      <div className="cfg-row-main">
        <strong>{name}</strong>
        <span className="cfg-row-tag">{tag}</span>
        {locked ? (
          <em className="cfg-row-note is-locked">
            {lockedNote || "Bloqueado para sua faixa de crédito"}
          </em>
        ) : note ? (
          <em className="cfg-row-note">{note}</em>
        ) : null}
      </div>
      {stake && !locked ? (
        <div className="cfg-row-stake">
          <button type="button" aria-label="Diminuir" onClick={() => step(-stake.step)}>
            −
          </button>
          <input
            type="number"
            inputMode="decimal"
            value={stake.value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) stake.onChange(n);
            }}
          />
          <span>{stake.unit}</span>
          <button type="button" aria-label="Aumentar" onClick={() => step(stake.step)}>
            +
          </button>
        </div>
      ) : null}
      <label className={`cfg-switch ${locked ? "is-disabled" : ""}`}>
        <input
          type="checkbox"
          checked={locked ? false : checked}
          disabled={locked}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="cfg-switch-track" aria-hidden />
      </label>
    </div>
  );
}
