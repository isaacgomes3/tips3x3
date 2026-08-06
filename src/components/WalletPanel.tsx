"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Deposit, WalletEntry } from "@/lib/wallet/wallet-types";

type TrialInfo = {
  used: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  active: boolean;
};

type WalletPayload = {
  ok: boolean;
  wallet: {
    balance: number;
    deposited: number;
    fees: number;
    profitBase: number;
    blocked: boolean;
    isMaster?: boolean;
  };
  entries: WalletEntry[];
  deposits: Deposit[];
  trial?: TrialInfo;
  config: {
    feePct: number;
    commissionPct: number;
    minDeposit: number;
    blockWhenEmpty: boolean;
    pixReady: boolean;
    autoConfirm: boolean;
  };
  error?: string;
};

type DepositPayload = {
  ok?: boolean;
  deposit?: Deposit;
  pixCopyPaste?: string | null;
  qrCodeBase64?: string | null;
  error?: string;
  code?: string;
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const KIND_LABEL: Record<WalletEntry["kind"], string> = {
  deposito: "Depósito",
  taxa: "Taxa sobre lucro",
  ajuste: "Ajuste",
  estorno: "Estorno",
};

const STATUS_LABEL: Record<Deposit["status"], string> = {
  pendente: "Aguardando pagamento",
  gateway_pago: "Pago · em confirmação",
  creditado: "Creditado",
  recusado: "Recusado",
  expirado: "Expirado",
};

export default function WalletPanel({
  focus,
}: {
  /** Abre a tela já no cartão de depósito. */
  focus?: "deposito";
}) {
  const [data, setData] = useState<WalletPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [cpf, setCpf] = useState("");
  const [creating, setCreating] = useState(false);
  const [charge, setCharge] = useState<DepositPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [activatingTrial, setActivatingTrial] = useState(false);
  const [trialMsg, setTrialMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef<number | null>(null);
  const depositRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (focus !== "deposito") return;
    depositRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/wallet", { cache: "no-store" });
        const json = (await res.json()) as WalletPayload;
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || "Não foi possível carregar a carteira.");
          return;
        }
        setError(null);
        setData(json);
      } catch {
        if (!cancelled) setError("Falha de rede ao carregar a carteira.");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /** Poll da cobrança até o gateway confirmar (webhook é a fonte). */
  useEffect(() => {
    const depositId = charge?.deposit?.id;
    const status = charge?.deposit?.status;
    if (!depositId || status === "creditado" || status === "expirado") {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/wallet/deposit?id=${encodeURIComponent(depositId)}`,
            { cache: "no-store" },
          );
          const json = (await res.json()) as DepositPayload;
          if (!res.ok || !json.deposit) return;
          setCharge((prev) => ({ ...prev, ...json }));
          if (json.deposit.status === "creditado") refresh();
        } catch {
          /* mantém o poll no próximo ciclo */
        }
      })();
    }, 4000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [charge?.deposit?.id, charge?.deposit?.status, refresh]);

  const createDeposit = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(String(amount).replace(",", ".")),
          cpf: cpf.replace(/\D/g, ""),
        }),
      });
      const json = (await res.json()) as DepositPayload;
      if (!res.ok) {
        setError(json.error || "Não foi possível gerar o PIX.");
        return;
      }
      setCharge(json);
      setCopied(false);
      refresh();
    } catch {
      setError("Falha de rede ao gerar o PIX.");
    } finally {
      setCreating(false);
    }
  };

  const copyPix = async () => {
    const code = charge?.pixCopyPaste;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Copie o código manualmente.");
    }
  };

  const wallet = data?.wallet;
  const config = data?.config;
  const trial = data?.trial;
  const min = config?.minDeposit ?? 10;
  const chargeDeposit = charge?.deposit;

  const trialRemainingMs = trial?.active && trial.expiresAt
    ? Date.parse(trial.expiresAt) - now
    : 0;
  const trialCountdown =
    trialRemainingMs > 0
      ? (() => {
          const totalSec = Math.floor(trialRemainingMs / 1000);
          const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
          const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
          const s = String(totalSec % 60).padStart(2, "0");
          return `${h}:${m}:${s}`;
        })()
      : null;

  const activateTrial = async () => {
    setActivatingTrial(true);
    setTrialMsg(null);
    try {
      const res = await fetch("/api/wallet/trial", { method: "POST" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setTrialMsg(json.error || "Não foi possível ativar o teste grátis.");
        return;
      }
      setTrialMsg("Teste grátis de 48h ativado! Todos os filtros liberados.");
      refresh();
    } catch {
      setTrialMsg("Falha de rede ao ativar o teste grátis.");
    } finally {
      setActivatingTrial(false);
    }
  };

  return (
    <div className="panel-block config-panel is-wallet">
      <section className="config-card">
        <h3>Carteira de crédito</h3>

        <div className="admin-kpis">
          <div className={`admin-kpi ${wallet && wallet.balance > 0 ? "is-ok" : "is-down"}`}>
            <span>Crédito disponível</span>
            <strong>{wallet ? brl(wallet.balance) : "—"}</strong>
          </div>
          <div className="admin-kpi">
            <span>Depositado</span>
            <strong>{wallet ? brl(wallet.deposited) : "—"}</strong>
          </div>
          <div className="admin-kpi">
            <span>Taxas pagas</span>
            <strong>{wallet ? brl(wallet.fees) : "—"}</strong>
          </div>
          <div className="admin-kpi">
            <span>Lucro gerado</span>
            <strong>{wallet ? brl(wallet.profitBase) : "—"}</strong>
          </div>
        </div>

        {wallet?.blocked ? (
          <p className="users-admin-msg is-down">
            Crédito esgotado — os sinais automáticos estão pausados. Faça um
            depósito para voltar a operar.
          </p>
        ) : null}
        {error ? <p className="users-admin-msg is-down">{error}</p> : null}
      </section>

      {!wallet?.isMaster ? (
        <section className="config-card">
          <h3>Teste grátis 48h</h3>
          {trial?.active ? (
            <>
              <p className="config-lead">
                Todos os filtros estão liberados durante o teste grátis.
              </p>
              <div className="admin-kpis">
                <div className="admin-kpi is-ok">
                  <span>Tempo restante</span>
                  <strong>{trialCountdown ?? "00:00:00"}</strong>
                </div>
              </div>
            </>
          ) : trial?.used ? (
            <p className="config-hint">
              Teste grátis já utilizado. Faça um depósito para liberar os
              filtros pela sua faixa de crédito.
            </p>
          ) : (
            <>
              <p className="config-lead">
                Libere todos os filtros por 48h, uma única vez, para testar a
                automação sem restrição de faixa de crédito.
              </p>
              <button
                type="button"
                className="btn-primary"
                disabled={activatingTrial}
                onClick={() => void activateTrial()}
              >
                {activatingTrial ? "Ativando…" : "Ativar teste grátis de 48h"}
              </button>
            </>
          )}
          {trialMsg ? (
            <p
              className={`users-admin-msg ${trial?.active ? "is-up" : "is-down"}`}
            >
              {trialMsg}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="config-card" ref={depositRef}>
        <h3>Depositar por PIX</h3>
        <p className="config-lead">
          Mínimo {brl(min)}. O PIX é gerado na hora e o crédito entra{" "}
          {config?.autoConfirm
            ? "automaticamente após o pagamento"
            : "após a confirmação da Tips3x3"}
          .
        </p>

        {config && !config.pixReady ? (
          <p className="users-admin-msg is-down">
            PIX automático indisponível agora. Fale com o suporte.
          </p>
        ) : null}

        <div className="config-row">
          <label className="config-field">
            <span>Valor (R$)</span>
            <input
              type="number"
              min={min}
              step="1"
              value={amount || String(min)}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="config-field">
            <span>CPF do pagador</span>
            <input
              type="text"
              value={cpf}
              onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="somente números"
              inputMode="numeric"
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={creating || !config?.pixReady}
            onClick={() => void createDeposit()}
          >
            {creating ? "Gerando…" : "Gerar PIX"}
          </button>
        </div>

        {chargeDeposit ? (
          <div className="wallet-charge">
            <div className="wallet-charge-info">
              <strong>{brl(chargeDeposit.amount)}</strong>
              <span
                className={`admin-badge ${
                  chargeDeposit.status === "creditado"
                    ? "is-up"
                    : chargeDeposit.status === "pendente" ||
                        chargeDeposit.status === "gateway_pago"
                      ? ""
                      : "is-down"
                }`}
              >
                {STATUS_LABEL[chargeDeposit.status]}
              </span>
              {charge?.pixCopyPaste ? (
                <button type="button" className="btn-secondary" onClick={() => void copyPix()}>
                  {copied ? "Copiado!" : "Copiar código PIX"}
                </button>
              ) : null}
            </div>
            {charge?.qrCodeBase64 ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                className="wallet-qr"
                src={charge.qrCodeBase64}
                alt="QR Code do PIX"
                width={220}
                height={220}
              />
            ) : null}
            {charge?.pixCopyPaste ? (
              <textarea className="wallet-emv" readOnly value={charge.pixCopyPaste} rows={3} />
            ) : null}
            {chargeDeposit.status === "creditado" ? (
              <p className="config-hint">Crédito liberado. Bom trabalho.</p>
            ) : chargeDeposit.status === "expirado" ? (
              <p className="config-hint">Cobrança expirada — gere um novo PIX.</p>
            ) : (
              <p className="config-hint">
                Pague no app do banco. A confirmação chega em segundos.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section className="config-card wallet-wide">
        <h3>Extrato</h3>
        {!data?.entries?.length ? (
          <p className="config-hint">Nenhum lançamento ainda.</p>
        ) : (
          <ul className="admin-list">
            {data.entries.map((e) => (
              <li key={e.id}>
                <div>
                  <strong>{KIND_LABEL[e.kind]}</strong>
                  <span>
                    {dateTime(e.at)}
                    {e.note ? ` · ${e.note}` : ""}
                  </span>
                </div>
                <span className={`admin-badge ${e.amount >= 0 ? "is-up" : "is-down"}`}>
                  {e.amount >= 0 ? "+" : "−"}
                  {brl(Math.abs(e.amount)).replace("R$", "R$ ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data?.deposits?.length ? (
        <section className="config-card wallet-wide">
          <h3>Depósitos</h3>
          <ul className="admin-list">
            {data.deposits.map((d) => (
              <li key={d.id}>
                <div>
                  <strong>{brl(d.amount)}</strong>
                  <span>
                    {dateTime(d.createdAt)} · {d.externalId}
                  </span>
                </div>
                <span
                  className={`admin-badge ${
                    d.status === "creditado"
                      ? "is-up"
                      : d.status === "recusado" || d.status === "expirado"
                        ? "is-down"
                        : ""
                  }`}
                >
                  {STATUS_LABEL[d.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
