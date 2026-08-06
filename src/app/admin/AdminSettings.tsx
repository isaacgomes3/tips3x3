"use client";

import { FormEvent, useState } from "react";
import type { AppConfig } from "@/app/admin/types";

export default function AdminSettings({
  config,
  onChanged,
}: {
  config: AppConfig;
  onChanged: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<AppConfig>(config);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetProfitPct: Number(draft.targetProfitPct),
          lay3x3StakePct: Number(draft.lay3x3StakePct),
          eventosRarosStakeFixed: Number(draft.eventosRarosStakeFixed),
          overStakePct: Number(draft.overStakePct),
          over45StakePct: Number(draft.over45StakePct),
          qovStakePct: Number(draft.qovStakePct),
          lay3x3Enabled: draft.lay3x3Enabled,
          eventosRarosEnabled: draft.eventosRarosEnabled,
          over35Enabled: draft.over35Enabled,
          over45Enabled: draft.over45Enabled,
          layOverLimitPressureEnabled: draft.layOverLimitPressureEnabled,
          qovEnabled: draft.qovEnabled,
          walletFeePct: Number(draft.walletFeePct),
          walletExchangeCommissionPct: Number(draft.walletExchangeCommissionPct),
          walletMinDeposit: Number(draft.walletMinDeposit),
          walletChargeLucroCerto: draft.walletChargeLucroCerto,
          walletBlockWhenEmpty: draft.walletBlockWhenEmpty,
        }),
      });
      const json = (await res.json()) as { error?: string; config?: AppConfig };
      if (!res.ok) {
        setMsg({ text: json.error || "Falha ao salvar.", ok: false });
        return;
      }
      if (json.config) setDraft(json.config);
      setMsg({ text: "Configurações salvas.", ok: true });
      await onChanged();
    } catch {
      setMsg({ text: "Falha de rede ao salvar.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-grid">
      <section className="config-card">
        <h3>Defaults de operação</h3>
        <p className="config-lead">
          Valores aplicados a quem ainda não escolheu os próprios ajustes no
          painel. Quem já configurou mantém a preferência local.
        </p>

        {msg ? (
          <p className={`users-admin-msg ${msg.ok ? "is-up" : "is-down"}`}>
            {msg.text}
          </p>
        ) : null}

        <form className="admin-form" onSubmit={save}>
          <label className="config-field">
            <span>Alvo de lucro no green (%)</span>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="100"
              value={draft.targetProfitPct}
              onChange={(e) =>
                setDraft({ ...draft, targetProfitPct: Number(e.target.value) })
              }
            />
          </label>

          <label className="config-field">
            <span>Stake Lay 3x3 (% da banca)</span>
            <input
              type="number"
              step="1"
              min="1"
              max="100"
              value={draft.lay3x3StakePct}
              onChange={(e) =>
                setDraft({ ...draft, lay3x3StakePct: Number(e.target.value) })
              }
            />
          </label>

          <label className="config-field">
            <span>Stake Eventos raros (R$ fixo)</span>
            <input
              type="number"
              step="1"
              min="1"
              value={draft.eventosRarosStakeFixed}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  eventosRarosStakeFixed: Number(e.target.value),
                })
              }
            />
          </label>

          <label className="config-field">
            <span>Stake Lay Over 3.5 (% da banca)</span>
            <input
              type="number"
              step="1"
              min="1"
              max="100"
              value={draft.overStakePct}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  overStakePct: Number(e.target.value),
                })
              }
            />
          </label>

          <label className="config-field">
            <span>Stake Lay Over 4.5 (% da banca)</span>
            <input
              type="number"
              step="1"
              min="1"
              max="100"
              value={draft.over45StakePct}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  over45StakePct: Number(e.target.value),
                })
              }
            />
          </label>

          <label className="config-field">
            <span>Stake Lay QOV zebra (% da banca)</span>
            <input
              type="number"
              step="1"
              min="1"
              max="100"
              value={draft.qovStakePct}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  qovStakePct: Number(e.target.value),
                })
              }
            />
          </label>

          <Toggle
            label="Estratégia Lay 3x3 habilitada"
            checked={draft.lay3x3Enabled}
            onChange={(v) => setDraft({ ...draft, lay3x3Enabled: v })}
          />
          <Toggle
            label="Estratégia Eventos raros habilitada"
            checked={draft.eventosRarosEnabled}
            onChange={(v) => setDraft({ ...draft, eventosRarosEnabled: v })}
          />
          <Toggle
            label="Estratégia Lay Over 3.5 habilitada"
            checked={draft.over35Enabled}
            onChange={(v) => setDraft({ ...draft, over35Enabled: v })}
          />
          <Toggle
            label="Estratégia Lay Over 4.5 habilitada"
            checked={draft.over45Enabled}
            onChange={(v) => setDraft({ ...draft, over45Enabled: v })}
          />
          <Toggle
            label="Estratégia Lay Over Limite com Pressão habilitada"
            checked={draft.layOverLimitPressureEnabled !== false}
            onChange={(v) =>
              setDraft({ ...draft, layOverLimitPressureEnabled: v })
            }
          />
          <Toggle
            label="Estratégia Lay QOV zebra habilitada"
            checked={draft.qovEnabled !== false}
            onChange={(v) => setDraft({ ...draft, qovEnabled: v })}
          />

          <button type="submit" className="btn-primary" disabled={busy}>
            Salvar configurações
          </button>
        </form>

        <h3 style={{ marginTop: "1.4rem" }}>Carteira de crédito</h3>
        <p className="config-lead">
          A taxa é debitada do crédito do cliente quando o Lay é correspondido
          na Bolsa. Operação que não casa não gera cobrança. Primeiro desconta
          a comissão da bolsa/exchange sobre o lucro bruto, depois a taxa da
          tips3x3 incide sobre o lucro líquido restante.
        </p>

        <form className="admin-form" onSubmit={save}>
          <label className="config-field">
            <span>Comissão da bolsa/exchange (%)</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={draft.walletExchangeCommissionPct}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  walletExchangeCommissionPct: Number(e.target.value),
                })
              }
            />
          </label>

          <label className="config-field">
            <span>Taxa sobre o lucro líquido (%)</span>
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={draft.walletFeePct}
              onChange={(e) =>
                setDraft({ ...draft, walletFeePct: Number(e.target.value) })
              }
            />
          </label>

          <label className="config-field">
            <span>Depósito mínimo (R$)</span>
            <input
              type="number"
              step="1"
              min="1"
              value={draft.walletMinDeposit}
              onChange={(e) =>
                setDraft({ ...draft, walletMinDeposit: Number(e.target.value) })
              }
            />
          </label>

          <Toggle
            label="Cobrar taxa nas operações Lucro certo"
            checked={draft.walletChargeLucroCerto}
            onChange={(v) => setDraft({ ...draft, walletChargeLucroCerto: v })}
          />
          <Toggle
            label="Pausar sinais quando o crédito zerar"
            checked={draft.walletBlockWhenEmpty}
            onChange={(v) => setDraft({ ...draft, walletBlockWhenEmpty: v })}
          />

          <button type="submit" className="btn-primary" disabled={busy}>
            Salvar carteira
          </button>
        </form>

        {config.updatedBy ? (
          <p className="config-hint">
            Última alteração por {config.updatedBy} em{" "}
            {new Date(config.updatedAt).toLocaleString("pt-BR")}.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="admin-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
