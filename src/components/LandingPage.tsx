"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isNativeApp } from "@/lib/native-alerts";

const STATS = [
  { value: 120000, prefix: "+", suffix: "", label: "Análises realizadas" },
  { value: 98, prefix: "", suffix: "%", label: "Precisão dos filtros" },
  { value: 24, prefix: "", suffix: "/7", label: "Atualizações" },
  { value: 50, prefix: "+", suffix: "", label: "Ligas monitoradas" },
];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "R$ 39,90",
    period: "/mês",
    badge: null as string | null,
    featured: false,
    perks: [
      "Dashboard completo",
      "Alertas ao vivo",
      "Pressão em tempo real",
      "2 estratégias",
      "Favoritos",
    ],
    cta: "COMEÇAR AGORA",
  },
  {
    id: "pro",
    name: "Pro",
    price: "R$ 69,90",
    period: "/mês",
    badge: "MAIS VENDIDO",
    featured: true,
    perks: [
      "Tudo do Starter",
      "10 estratégias",
      "Exportar dados",
      "Central de banca",
      "Prioridade em alertas",
    ],
    cta: "ATIVAR PRO",
  },
  {
    id: "elite",
    name: "Elite",
    price: "R$ 129,90",
    period: "/mês",
    badge: "PROFISSIONAL",
    featured: false,
    perks: [
      "Tudo do Pro",
      "Estratégias ilimitadas",
      "Acesso à API",
      "Suporte prioritário",
      "Onboarding assistido",
    ],
    cta: "ATIVAR ELITE",
  },
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
          <h2>Planos Premium</h2>
          <p>Acesso imediato após login. Cancele quando quiser.</p>
        </div>
        <div className="lp-plans">
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`lp-card lp-plan${plan.featured ? " is-featured" : ""}${plan.id === "elite" ? " is-elite" : ""}`}
            >
              {plan.badge ? <span className="lp-plan-badge">{plan.badge}</span> : null}
              <h3>{plan.name}</h3>
              <p className="lp-plan-price">
                <strong>{plan.price}</strong>
                <span>{plan.period}</span>
              </p>
              <ul>
                {plan.perks.map((p) => <li key={p}>{p}</li>)}
              </ul>
              <Link
                href="/login"
                className={`lp-btn ${plan.featured ? "lp-btn-primary" : "lp-btn-outline"}`}
              >
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
