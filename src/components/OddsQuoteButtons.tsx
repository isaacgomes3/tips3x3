"use client";

function formatLiq(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  if (amount >= 1000) {
    const k = amount / 1000;
    return `R$ ${k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `R$ ${amount.toFixed(0)}`;
}

function formatOdd(odds: number | null | undefined) {
  if (odds == null || !Number.isFinite(odds)) return "—";
  return odds >= 10 ? odds.toFixed(0) : odds.toFixed(2);
}

export function OddsQuoteButtons({
  label = "3-3",
  backOdds,
  backAmount = 0,
  layOdds,
  layAmount = 0,
  href,
  size = "md",
}: {
  label?: string;
  backOdds?: number | null;
  backAmount?: number;
  layOdds?: number | null;
  layAmount?: number;
  href?: string;
  size?: "sm" | "md";
}) {
  const inner = (
    <div className={`quote-pair quote-${size}`}>
      <span className="quote-btn quote-back" title="Back">
        <strong>{formatOdd(backOdds)}</strong>
        <em>{formatLiq(backAmount)}</em>
      </span>
      <span className="quote-btn quote-lay" title="Lay">
        <strong>{formatOdd(layOdds)}</strong>
        <em>{formatLiq(layAmount)}</em>
      </span>
    </div>
  );

  if (href) {
    return (
      <a
        className="quote-block"
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </a>
    );
  }

  return <div className="quote-block">{inner}</div>;
}
