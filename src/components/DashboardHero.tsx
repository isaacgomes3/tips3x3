"use client";

import { Crown, Medal, Star } from "lucide-react";
import CreditCard from "@/components/dashboard-hero/CreditCard";
import FeatureSection from "@/components/dashboard-hero/FeatureSection";
import type { CreditTier } from "@/lib/wallet/credit-tier";

const TIER_ORDER: Exclude<CreditTier, "none">[] = ["10", "50", "250"];

/** Faixas são cumulativas: quem tem 250+ já tem 50+ e 10+ liberados. */
function isTierUnlocked(currentTier: CreditTier, cardTier: "10" | "50" | "250") {
  if (currentTier === "none") return false;
  return TIER_ORDER.indexOf(currentTier) >= TIER_ORDER.indexOf(cardTier);
}

export default function DashboardHero({
  onActivate,
  currentTier = "none",
}: {
  onActivate?: (tier: "10" | "50" | "250") => void;
  /** Faixa real do cliente (saldo da carteira) — master conta como 250+. */
  currentTier?: CreditTier;
}) {
  return (
    <div className="dh-root">
      <div className="dh-heading">
        <span className="hs-kicker">Automação Profissional</span>
        <h1 className="hs-title">
          Tecnologia, Filtros e{" "}
          <span className="hs-title-accent">Gestão que geram lucro.</span>
        </h1>
      </div>

      <section className="cc-grid">
        <CreditCard
          icon={Star}
          tier="CRÉDITO 10+"
          description="Ideal para iniciar sua automação com gestão inteligente."
          benefits={[
            "Acesso ao painel de estatísticas",
            "Acompanhamento das operações ao vivo",
            "Automação via App e Extensão",
          ]}
          markets={["Under 3.5", "Under 4.5", "Under Limite"]}
          extraBenefits={[
            "Gestão automática de banca",
            "Ajuste automático de stake",
          ]}
          tone="green"
          delay={0}
          unlocked={isTierUnlocked(currentTier, "10")}
          onActivate={() => onActivate?.("10")}
        />
        <CreditCard
          icon={Medal}
          tier="CRÉDITO 50+"
          description="Mais mercados, mais oportunidades e maior poder de automação."
          benefits={["Todos os benefícios do Crédito 10+"]}
          markets={["Lay 3x3", "Lay QOV Zebra"]}
          marketsIntro="Mercados adicionais"
          extraBenefits={[
            "Filtros avançados por mercado",
            "Gestão de banca aprimorada",
          ]}
          tone="blue"
          delay={0.1}
          unlocked={isTierUnlocked(currentTier, "50")}
          onActivate={() => onActivate?.("50")}
        />
        <CreditCard
          icon={Crown}
          tier="CRÉDITO 250+"
          description="Plano completo para máxima performance."
          benefits={["Todos os recursos dos planos anteriores"]}
          markets={[
            "Eventos Raros · Assertividade 100%",
            "Lucro Certo · Entrada 0 Risco",
          ]}
          marketsIntro="Mercados exclusivos"
          extraBenefits={[
            "Gestão profissional de banca",
            "Prioridade nas atualizações",
            "Suporte Premium",
          ]}
          tone="purple"
          delay={0.2}
          unlocked={isTierUnlocked(currentTier, "250")}
          onActivate={() => onActivate?.("250")}
        />
      </section>

      <FeatureSection />
    </div>
  );
}
