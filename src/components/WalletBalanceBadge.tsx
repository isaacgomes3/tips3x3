"use client";

import { useEffect, useState } from "react";

type WalletPayload = {
  wallet?: { balance?: number; blocked?: boolean };
  config?: { feePct?: number };
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Saldo de crédito na barra superior — atalho para a carteira. */
export default function WalletBalanceBadge({ onClick }: { onClick: () => void }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [feePct, setFeePct] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/wallet", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as WalletPayload;
        if (cancelled) return;
        setBalance(Number(json.wallet?.balance ?? 0));
        setBlocked(Boolean(json.wallet?.blocked));
        setFeePct(json.config?.feePct ?? null);
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <button
      type="button"
      className={`term-wallet-badge ${blocked ? "is-empty" : ""}`}
      onClick={onClick}
      title={
        feePct != null
          ? `Crédito para as taxas de ${feePct}% do lucro — clique para abrir a carteira`
          : "Crédito da carteira"
      }
    >
      <span>Crédito</span>
      <strong suppressHydrationWarning>
        {balance == null ? "—" : brl(balance)}
      </strong>
    </button>
  );
}
