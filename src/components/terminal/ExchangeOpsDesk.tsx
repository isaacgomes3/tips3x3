"use client";

import type { ActiveTradeSnapshot } from "@/lib/betbra/auto-lay-bg";
import type { BetBraOfferCard } from "@/lib/betbra/native-lay";

function fmtBrl(n: number) {
  return `R$${Math.abs(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtOdd(n: number) {
  if (!(n > 1.01)) return "—";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtWhen(raw: string | number | undefined) {
  if (raw == null || raw === "") return "—";
  if (typeof raw === "number" && raw > 0) {
    try {
      return new Date(raw).toLocaleString("pt-BR");
    } catch {
      return "—";
    }
  }
  const s = String(raw);
  const t = Date.parse(s);
  if (Number.isFinite(t)) {
    try {
      return new Date(t).toLocaleString("pt-BR");
    } catch {
      return s;
    }
  }
  return s;
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 13.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V19.5a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H4.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 6.1 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H10.5a1.65 1.65 0 0 0 1-1.51V4.5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V10.5a1.65 1.65 0 0 0 1.51 1H19.5a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function phaseLabel(phase: string | undefined, layOpen: boolean) {
  const p = String(phase || "");
  if (p === "awaiting_lay_match" || p === "lay_sent") {
    return layOpen
      ? "Aguardando Lay casar (ancorar)"
      : "Lay no book · aguardando casar";
  }
  if (p === "awaiting_back") return "Lay casado · aguardando Back";
  if (p === "back_sent") return "Back enviado";
  if (layOpen) return "Oferta aberta no book";
  return "Operação";
}

export type ExchangeOpsDeskProps = {
  connected: boolean;
  busy?: boolean;
  balance: number | null;
  balanceError?: string | null;
  reservedLc: number;
  /** Auto Lucro certo ligado — se off, não separa banca. */
  lucroCertoOn?: boolean;
  openExposure: number;
  openOffers: number;
  offers: BetBraOfferCard[];
  activeTrade: ActiveTradeSnapshot | null;
  lastMessage?: string | null;
  onConnect?: () => void;
  onRefresh?: () => void;
  onOpenSettings?: () => void;
};

/** Lay matched/aberto sem Back no mesmo placar = LC/hold em curso. */
function unhedgedLayLiability(offers: BetBraOfferCard[]): number {
  const lay = new Map<string, number>();
  const back = new Set<string>();
  for (const o of offers) {
    const key = `${o.eventId || o.eventName}|${o.runnerName || ""}`;
    const st = String(o.status || "").toLowerCase();
    if (/settled|void|cancel|lapsed|failed|expired/.test(st)) continue;
    if (o.side === "back") {
      back.add(key);
      continue;
    }
    if (o.side !== "lay") continue;
    const liab =
      o.liability > 0
        ? o.liability
        : o.stake > 0 && o.odds > 1.01
          ? o.stake * (o.odds - 1)
          : 0;
    if (liab > 0.01) {
      lay.set(key, Math.max(lay.get(key) ?? 0, liab));
    }
  }
  let total = 0;
  for (const [k, v] of lay) {
    if (!back.has(k)) total += v;
  }
  return Math.round(total * 100) / 100;
}

export function ExchangeOpsDesk({
  connected,
  busy,
  balance,
  balanceError,
  reservedLc,
  lucroCertoOn = true,
  openExposure,
  openOffers,
  offers,
  activeTrade,
  lastMessage,
  onConnect,
  onRefresh,
  onOpenSettings,
}: ExchangeOpsDeskProps) {
  const total = typeof balance === "number" && Number.isFinite(balance) ? balance : null;
  const lcOn = Boolean(lucroCertoOn);
  const reservedCfg = lcOn && reservedLc > 0 ? reservedLc : 0;
  const lcInPlay = lcOn ? unhedgedLayLiability(offers) : 0;
  const inPlay = Math.max(openExposure > 0 ? openExposure : 0, 0);
  // Com LC em curso a reserva já está na op — sobra do saldo livre para 3x3/ER.
  const unusedReserve =
    lcOn && reservedCfg > 0 && lcInPlay <= 0.5 ? reservedCfg : 0;
  const freeRaw =
    total != null ? Math.max(0, total - inPlay - unusedReserve) : null;
  const free = freeRaw != null ? Math.round(freeRaw * 100) / 100 : null;
  const lcWalletLabel = !lcOn
    ? 0
    : lcInPlay > 0.5
      ? lcInPlay
      : reservedCfg;

  const layOpen = offers.some(
    (o) =>
      o.open &&
      o.side === "lay" &&
      (!activeTrade?.eventId || o.eventId === activeTrade.eventId),
  );

  const cards: BetBraOfferCard[] = [...offers].sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (a.side !== b.side) return a.side === "lay" ? -1 : 1;
    return 0;
  });

  return (
    <div className="ops-desk">
      <section className="ops-exchange" aria-label="Bolsa Exchange BetBra">
        <div className="ops-exchange-head">
          <div>
            <span className="ops-exchange-label">Bolsa Exchange</span>
            <span className="ops-exchange-status">
              <i className={connected ? "is-on" : "is-off"} />
              {connected ? "conectada" : "desconectada"}
            </span>
          </div>
          <div className="ops-exchange-actions">
            {onRefresh ? (
              <button
                type="button"
                className="ops-btn"
                disabled={busy}
                onClick={onRefresh}
              >
                {busy ? "Atualizando…" : "Atualizar"}
              </button>
            ) : null}
            {onConnect ? (
              <button
                type="button"
                className="ops-btn is-primary"
                disabled={busy}
                onClick={onConnect}
              >
                {connected ? "Reconectar" : "Conectar BetBra"}
              </button>
            ) : null}
            {onOpenSettings ? (
              <button
                type="button"
                className="ops-btn is-icon"
                title="Configurações"
                aria-label="Configurações"
                onClick={onOpenSettings}
              >
                <GearIcon />
              </button>
            ) : null}
          </div>
        </div>

        <div className="ops-balance-grid">
          <article>
            <span>Saldo real</span>
            <strong>{total != null ? fmtBrl(total) : "—"}</strong>
          </article>
          <article>
            <span>Em jogo</span>
            <strong>{fmtBrl(inPlay)}</strong>
          </article>
          <article>
            <span>
              {!lcOn
                ? "Reserva LC (off)"
                : lcInPlay > 0.5
                  ? "LC em curso (resp.)"
                  : "Reserva Lucro certo"}
            </span>
            <strong>{fmtBrl(lcWalletLabel)}</strong>
          </article>
          <article>
            <span>Banca livre (3x3 / ER)</span>
            <strong className={free != null && free < 1 ? "is-warn" : ""}>
              {free != null ? fmtBrl(free) : "—"}
            </strong>
          </article>
        </div>

        {balanceError ? (
          <p className="ops-hint is-warn">{balanceError}</p>
        ) : (
          <p className="ops-hint">
            {!lcOn
              ? "Lucro certo desligado · banca sem separação de reserva"
              : lcInPlay > 0.5
                ? "LC em curso · saldo restante disponível para 3x3 / Eventos raros"
                : "Reserva LC isolada · demais ops usam saldo − reserva − em jogo"}
            {openOffers > 0 ? ` · ${openOffers} oferta(s) aberta(s)` : ""}
          </p>
        )}

        {free != null && free < 1 && connected && lcOn && lcInPlay <= 0.5 ? (
          <p className="ops-hint is-warn">
            Sem banca livre para novas entradas (exceto Lucro certo na carteira
            reservada).
          </p>
        ) : null}
      </section>

      {activeTrade?.pending && !activeTrade?.matched && !activeTrade?.active ? (
        <section className="ops-phase is-pending" aria-label="Lay aguardando casar">
          <header>
            <strong>Lay no book · aguardando casar</strong>
            <span>
              {activeTrade.eventName || activeTrade.eventId || "Evento"}
            </span>
          </header>
          <p className="ops-hint">
            A entrada só aparece depois do Lay corresponder — com stake, odd e
            responsabilidade exatas do mercado.
          </p>
        </section>
      ) : null}

      {activeTrade?.active && activeTrade.matched !== false ? (
        <section className="ops-phase" aria-label="Entrada confirmada">
          <header>
            <strong>
              {phaseLabel(activeTrade.phase, layOpen)}
            </strong>
            <span>
              {activeTrade.eventName || activeTrade.eventId || "Evento"}
            </span>
          </header>
          <dl>
            <div>
              <dt>Placar</dt>
              <dd>{activeTrade.score || "3-3"}</dd>
            </div>
            <div>
              <dt>Lay casado</dt>
              <dd>
                {fmtOdd(Number(activeTrade.layOdds))} · stake{" "}
                {fmtBrl(Number(activeTrade.layStake || 0))} · resp.{" "}
                {fmtBrl(Number(activeTrade.liability || 0))}
              </dd>
            </div>
            <div>
              <dt>Back alvo</dt>
              <dd>
                {fmtOdd(Number(activeTrade.targetBack))} · stake{" "}
                {fmtBrl(Number(activeTrade.backStake || 0))}
                {Number(activeTrade.profitFrac) > 0
                  ? ` · lucro ${(Number(activeTrade.profitFrac) * 100).toFixed(2).replace(".", ",")}%`
                  : ""}
              </dd>
            </div>
            {(activeTrade.betId || activeTrade.offerId) && (
              <div>
                <dt>Id</dt>
                <dd>{activeTrade.betId || activeTrade.offerId}</dd>
              </div>
            )}
          </dl>
          <p className="ops-hint">
            Valores do size correspondido no mercado · Back calculado em cima
            disso.
          </p>
        </section>
      ) : null}

      <section className="ops-cards" aria-label="Operações na Bolsa">
        <header className="ops-cards-head">
          <h3>Operações</h3>
          <span>
            {cards.length === 0
              ? "Nenhuma oferta / matched recente"
              : `${cards.length} registro(s)`}
          </span>
        </header>

        {cards.length === 0 ? (
          <p className="ops-empty">
            {connected
              ? "Sem operações abertas. Quando o Lay entrar, aparece aqui com Id, odd, stake e resp./lucro."
              : "Conecte a BetBra para ver Lay/Back como na Bolsa."}
          </p>
        ) : (
          cards.map((o) => {
            const isBack = o.side === "back";
            const title = [o.eventName || "Evento", o.marketName || "Placar Exato"]
              .filter(Boolean)
              .join(" - ");
            const selection = o.runnerName || "—";
            const thirdLabel = isBack ? "Lucro" : "Resp.";
            const thirdValue = isBack
              ? o.profit > 0
                ? o.profit
                : Math.max(0, o.stake * Math.max(0, o.odds - 1))
              : o.liability > 0
                ? o.liability
                : Math.max(0, o.stake * Math.max(0, o.odds - 1));
            return (
              <article
                key={`${o.id}-${o.side}-${o.odds}`}
                className={`ops-bet-card ${isBack ? "is-back" : "is-lay"}`}
              >
                <header>
                  <strong>{title}</strong>
                  {o.open || (Number(o.remaining) || 0) >= 0.01 ? (
                    <em>Não correspondida</em>
                  ) : (
                    <em>Correspondida</em>
                  )}
                </header>
                <div className="ops-bet-main">
                  <div className="ops-bet-side">
                    <span>{isBack ? "Aposta a favor" : "Aposta contra"}</span>
                    <strong>{selection}</strong>
                  </div>
                  <div className="ops-bet-cols">
                    <div>
                      <span>Odd</span>
                      <strong>{fmtOdd(o.odds)}</strong>
                    </div>
                    <div>
                      <span>{o.open ? "Pedido" : "Stake casada"}</span>
                      <strong>{fmtBrl(o.stake)}</strong>
                    </div>
                    <div>
                      <span>{thirdLabel}</span>
                      <strong>{fmtBrl(thirdValue)}</strong>
                    </div>
                  </div>
                </div>
                <footer>
                  <span>
                    Bet Id: {o.betId || o.offerId || "—"} | Colocada:{" "}
                    {fmtWhen(o.placedAt)}
                  </span>
                  <span>
                    {o.loginId ? `Login Id: ${o.loginId} | ` : ""}
                    Data do Evento: {fmtWhen(o.eventDate)}
                  </span>
                </footer>
              </article>
            );
          })
        )}
      </section>

      {lastMessage ? (
        <p className="ops-hint">Último Auto Lay: {lastMessage}</p>
      ) : null}
    </div>
  );
}
