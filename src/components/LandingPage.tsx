"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, Medal, Star } from "lucide-react";
import { isNativeApp } from "@/lib/native-alerts";
import CreditCard from "@/components/dashboard-hero/CreditCard";

const STATS = [
  { value: 120000, prefix: "+", suffix: "", label: "Análises realizadas" },
  { value: 98, prefix: "", suffix: "%", label: "Precisão dos filtros" },
  { value: 24, prefix: "", suffix: "/7", label: "Atualizações" },
  { value: 50, prefix: "+", suffix: "", label: "Ligas monitoradas" },
];

function formatStat(n: number) {
  if (n >= 1000) return n.toLocaleString("pt-BR");
  return String(n);
}

function useCountUp(target: number, active: boolean, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return value;
}

function StatCard({
  value, prefix, suffix, label, active,
}: {
  value: number; prefix: string; suffix: string; label: string; active: boolean;
}) {
  const n = useCountUp(value, active);
  return (
    <div className="lp-stat">
      <strong>{prefix}{formatStat(n)}{suffix}</strong>
      <span>{label}</span>
    </div>
  );
}

export function LandingPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [statsActive, setStatsActive] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNativeApp()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) { setStatsActive(true); io.disconnect(); } },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    const onResize = () => { if (window.innerWidth > 1020) setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  return (
    <div className="lp-page">
      <div className="lp-grid-bg" aria-hidden />

      <header className="lp-topbar">
        <Link href="/" className="lp-logo">
          <Image src="/logo-tips3x3.png" alt="tips3x3" width={160} height={40} priority />
        </Link>
        {menuOpen ? (
          <button type="button" className="lp-nav-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />
        ) : null}
        <nav id="lp-nav" className={`lp-nav ${menuOpen ? "is-open" : ""}`}>
          <a href="#planos" onClick={() => setMenuOpen(false)}>Planos</a>
          <Link href="/login" className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => setMenuOpen(false)}>
            Login
          </Link>
        </nav>
        <button
          type="button" className="lp-menu-btn"
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen} aria-controls="lp-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </header>

      {/* Hero */}
      <section className="lp-hero is-stadium">
        <div className="lp-hero-photo" aria-hidden>
          <Image src="/assets/hero-stadium.jpg" alt="" fill sizes="100vw" priority />
        </div>

        <div className="lp-hero-stage">
          <p className="lp-kicker">EXCHANGE · FUTEBOL · AUTOMAÇÃO</p>
          <Image
            className="lp-hero-wordmark"
            src="/logo-tips3x3.png" alt="tips3x3"
            width={858} height={251} priority
          />
          <h1>
            ENTRAMOS EM CAMPO
            <br />
            <span>PRA VOCÊ</span>
          </h1>
          <p className="lp-hero-sub">
            Operação automatizada, melhores filtros e estatísticas do mercado,
            gestão de banca automática e resultados surpreendentes.
          </p>
          <div className="lp-hero-cta">
            <Link href="/login" className="lp-btn lp-btn-primary">COMEÇAR AGORA</Link>
            <a href="#planos" className="lp-btn lp-btn-outline">VER PLANOS</a>
          </div>
        </div>

        <div className="lp-stats" ref={statsRef}>
          {STATS.map((s) => (
            <StatCard key={s.label} {...s} active={statsActive} />
          ))}
        </div>
      </section>

      {/* Planos — sem login */}
      <section className="lp-section lp-plans-section" id="planos">
        <div className="lp-section-head">
          <h2>Automação Profissional</h2>
          <p>Adicione crédito e desbloqueie os mercados da sua faixa.</p>
        </div>
        <div className="cc-grid">
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
            unlocked={false}
            onActivate={() => { window.location.href = "/login?next=%2Fapp%3Fview%3Dwallet"; }}
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
            unlocked={false}
            onActivate={() => { window.location.href = "/login?next=%2Fapp%3Fview%3Dwallet"; }}
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
            unlocked={false}
            featuredBadge="PREMIUM"
            onActivate={() => { window.location.href = "/login?next=%2Fapp%3Fview%3Dwallet"; }}
          />
        </div>
      </section>
    </div>
  );
}
