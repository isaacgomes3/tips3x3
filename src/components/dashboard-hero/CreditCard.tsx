"use client";

import { motion } from "framer-motion";
import { Check, Lock, type LucideIcon } from "lucide-react";

export type CreditCardTone = "green" | "blue" | "purple";

export type CreditCardProps = {
  icon: LucideIcon;
  tier: string;
  description: string;
  benefits: string[];
  markets?: string[];
  marketsIntro?: string;
  extraBenefits?: string[];
  tone: CreditCardTone;
  delay?: number;
  onActivate?: () => void;
  /** Faixa já liberada pelo saldo atual do cliente (ou master). */
  unlocked?: boolean;
  /** Badge exibido no topo do card (ex: "PREMIUM", "MAIS VENDIDO"). */
  featuredBadge?: string;
};

export default function CreditCard({
  icon: Icon,
  tier,
  description,
  benefits,
  markets,
  marketsIntro,
  extraBenefits,
  tone,
  delay = 0,
  onActivate,
  unlocked,
  featuredBadge,
}: CreditCardProps) {
  return (
    <motion.article
      className={`cc-card cc-tone-${tone} ${unlocked ? "is-unlocked" : ""} ${featuredBadge ? "is-featured" : ""}`}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: "easeOut" }}
      whileHover={{ y: -6 }}
    >
      {unlocked ? (
        <span className="cc-badge-active">
          <Check size={13} aria-hidden />
          Ativo
        </span>
      ) : featuredBadge ? (
        <span className="cc-badge-featured">{featuredBadge}</span>
      ) : null}
      <span className="cc-icon">
        <Icon size={24} aria-hidden />
      </span>
      <h3 className="cc-title">{tier}</h3>
      <p className="cc-desc">{description}</p>

      <ul className="cc-benefits">
        {benefits.map((b) => (
          <li key={b}>
            <Check size={15} aria-hidden />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {markets ? (
        <div className="cc-markets">
          <span className="cc-markets-intro">
            {marketsIntro ?? "Mercados disponíveis"}
          </span>
          <div className="cc-markets-list">
            {markets.map((m) => (
              <span key={m} className="cc-market-pill">
                {m}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {extraBenefits ? (
        <ul className="cc-benefits cc-benefits-extra">
          {extraBenefits.map((b) => (
            <li key={b}>
              <Check size={15} aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        className={`cc-cta ${unlocked ? "is-unlocked" : ""}`}
        onClick={onActivate}
      >
        <span className="cc-cta-shine" aria-hidden />
        {unlocked ? (
          <>
            <Check size={16} aria-hidden />
            Automação ativa
          </>
        ) : (
          <>
            <Lock size={15} aria-hidden />
            Adicionar crédito
          </>
        )}
      </button>
    </motion.article>
  );
}
