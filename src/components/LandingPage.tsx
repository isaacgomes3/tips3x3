"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

const STATS = [
  { value: 120000, prefix: "+", suffix: "", label: "Análises realizadas" },
  { value: 98, prefix: "", suffix: "%", label: "Precisão dos filtros" },
  { value: 24, prefix: "", suffix: "/7", label: "Atualizações" },
  { value: 50, prefix: "+", suffix: "", label: "Ligas monitoradas" },
];

const WHY = [
  {
    title: "IA de Mercado",
    text: "Detecta oportunidades automaticamente com base em odds, liquidez e contexto do jogo.",
  },
  {
    title: "Pressão em Tempo Real",
    text: "Monitora ataques, posse, escanteios, odds e pressão ofensiva segundo a segundo.",
  },
  {
    title: "Alertas Inteligentes",
    text: "Receba somente oportunidades filtradas — sem ruído, só o que importa para operar.",
  },
];

const FEATURES = [
  { icon: "📊", title: "Dashboard Profissional" },
  { icon: "⚡", title: "Alertas Instantâneos" },
  { icon: "📈", title: "Gráficos de Pressão" },
  { icon: "🤖", title: "Inteligência Artificial" },
  { icon: "🎯", title: "Estratégias 3x3" },
  { icon: "📱", title: "Responsivo" },
  { icon: "🌎", title: "Mais de 50 Ligas" },
  { icon: "🚀", title: "Atualização em Tempo Real" },
];

const COMPARE = [
  ["Dashboard", "✔", "✔", "✔"],
  ["Alertas IA", "✔", "✔", "✔"],
  ["Pressão", "✔", "✔", "✔"],
  ["Estratégias", "2", "10", "Ilimitado"],
  ["Favoritos", "✔", "✔", "✔"],
  ["Exportar", "—", "✔", "✔"],
  ["API", "—", "—", "✔"],
];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 39.9,
    cta: "COMEÇAR STARTER",
    featured: false,
    badge: null as string | null,
    perks: [
      "Dashboard completo",
      "Alertas IA",
      "Pressão ao vivo",
      "2 estratégias",
      "Favoritos",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 69.9,
    cta: "ATIVAR PRO",
    featured: true,
    badge: "MAIS VENDIDO",
    perks: [
      "Tudo do Starter",
      "10 estratégias",
      "Exportar dados",
      "Central de banca",
      "Prioridade em alertas",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    price: 129.9,
    cta: "ATIVAR ELITE",
    featured: false,
    badge: "PROFISSIONAL",
    perks: [
      "Tudo do Pro",
      "Estratégias ilimitadas",
      "Acesso à API",
      "Suporte prioritário",
      "Onboarding assistido",
    ],
  },
];

const TESTIMONIALS = [
  {
    quote: "O sistema praticamente faz toda a análise para mim.",
    author: "Operador Exchange",
  },
  {
    quote: "Melhor ferramenta para Exchange que já utilizei.",
    author: "Trader amador",
  },
  {
    quote: "Economiza horas analisando jogos.",
    author: "Assinante Pro",
  },
];

const FAQ = [
  {
    q: "Quanto tempo demora para acessar?",
    a: "Após a confirmação do pagamento, o acesso é liberado em poucos minutos. Você entra pelo login e já usa o painel.",
  },
  {
    q: "Funciona em celular?",
    a: "Sim. O tips3x3 é responsivo e os alertas funcionam no celular para você não perder oportunidades ao vivo.",
  },
  {
    q: "Há fidelidade?",
    a: "Não. Você assina o plano escolhido sem fidelidade longa — pode cancelar quando quiser.",
  },
  {
    q: "Posso cancelar?",
    a: "Sim. Cancele a qualquer momento. Você mantém o acesso até o fim do período já pago.",
  },
];

function money(v: number) {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

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
  value,
  prefix,
  suffix,
  label,
  active,
}: {
  value: number;
  prefix: string;
  suffix: string;
  label: string;
  active: boolean;
}) {
  const n = useCountUp(value, active);
  return (
    <div className="lp-stat">
      <strong>
        {prefix}
        {formatStat(n)}
        {suffix}
      </strong>
      <span>{label}</span>
    </div>
  );
}

function DashboardMock() {
  return (
    <div className="lp-dashboard-mock" aria-hidden>
      <div className="lp-dash-top">
        <span className="lp-live-dot" />
        LIVE · Exchange
        <em>67&apos;</em>
      </div>
      <div className="lp-dash-score">
        <span>HOME</span>
        <strong>1 — 1</strong>
        <span>AWAY</span>
      </div>
      <div className="lp-dash-chart">
        {Array.from({ length: 24 }).map((_, i) => (
          <i
            key={i}
            style={{
              height: `${18 + ((i * 41) % 72)}%`,
              animationDelay: `${i * 0.05}s`,
            }}
          />
        ))}
      </div>
      <div className="lp-dash-row">
        <div>
          <small>LAY 3-3</small>
          <b>42.0</b>
        </div>
        <div>
          <small>PRESSÃO</small>
          <b className="is-neon">ALTA</b>
        </div>
        <div>
          <small>SINAL</small>
          <b className="is-neon">ENTRAR</b>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [statsActive, setStatsActive] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setStatsActive(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 1020) setMenuOpen(false);
    };
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
          <Image
            src="/logo-tips3x3.png"
            alt="tips3x3"
            width={160}
            height={40}
            priority
          />
        </Link>
        {menuOpen ? (
          <button
            type="button"
            className="lp-nav-backdrop"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
        <nav id="lp-nav" className={`lp-nav ${menuOpen ? "is-open" : ""}`}>
          <a href="#porque" onClick={() => setMenuOpen(false)}>
            Por quê
          </a>
          <a href="#demo" onClick={() => setMenuOpen(false)}>
            Demo
          </a>
          <a href="#recursos" onClick={() => setMenuOpen(false)}>
            Recursos
          </a>
          <a href="#planos" onClick={() => setMenuOpen(false)}>
            Planos
          </a>
          <a href="#faq" onClick={() => setMenuOpen(false)}>
            FAQ
          </a>
          <Link
            href="/login"
            className="lp-btn lp-btn-ghost lp-btn-sm"
            onClick={() => setMenuOpen(false)}
          >
            Login
          </Link>
        </nav>
        <button
          type="button"
          className="lp-menu-btn"
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
          aria-controls="lp-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </header>

      {/* 1. Hero */}
      <section className="lp-hero">
        <div className="lp-hero-neon" aria-hidden />
        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-kicker">EXCHANGE · FUTEBOL · IA</p>
            <h1>
              O PODER DO EXCHANGE
              <br />
              <span>NAS SUAS MÃOS.</span>
            </h1>
            <p className="lp-hero-sub">
              Análises em tempo real, filtros inteligentes e estratégias
              profissionais para quem opera o mercado de Exchange Futebol.
            </p>
            <div className="lp-hero-cta">
              <Link href="/login" className="lp-btn lp-btn-primary">
                COMEÇAR AGORA
              </Link>
              <a href="#demo" className="lp-btn lp-btn-outline">
                VER DEMONSTRAÇÃO
              </a>
            </div>
          </div>
          <div className="lp-hero-visual">
            <DashboardMock />
          </div>
        </div>

        <div className="lp-stats" ref={statsRef}>
          {STATS.map((s) => (
            <StatCard key={s.label} {...s} active={statsActive} />
          ))}
        </div>
      </section>

      {/* 2. Por quê */}
      <section className="lp-section" id="porque">
        <div className="lp-section-head">
          <h2>Por que escolher o Tips3x3?</h2>
          <p>Tecnologia de trading aplicada ao Exchange de futebol.</p>
        </div>
        <div className="lp-why-grid">
          {WHY.map((item) => (
            <article key={item.title} className="lp-card lp-why-card">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 3. Demo */}
      <section className="lp-section lp-demo" id="demo">
        <div className="lp-section-head">
          <h2>VEJA O SISTEMA EM FUNCIONAMENTO</h2>
          <p>Painel ao vivo, pressão e sinais — como operar de verdade.</p>
        </div>
        <div className="lp-demo-stage">
          <aside className="lp-demo-tags">
            <span>LIVE</span>
            <span>Tempo real</span>
            <span>IA</span>
            <span>Exchange</span>
            <span>Value</span>
            <span>Lay</span>
            <span>Back</span>
          </aside>
          <div className="lp-demo-frame">
            <div className="lp-demo-video">
              <DashboardMock />
              <button type="button" className="lp-play" aria-label="Play">
                ▶
              </button>
              <div className="lp-demo-caption">
                <span>Funcionalidades Premium · Visão geral</span>
                <span>0:24</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Features */}
      <section className="lp-section" id="recursos">
        <div className="lp-section-head">
          <h2>Tudo o que você precisa para operar</h2>
          <p>Ferramentas pensadas para velocidade e precisão.</p>
        </div>
        <div className="lp-feat-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="lp-card lp-feat-card">
              <span className="lp-feat-icon" aria-hidden>
                {f.icon}
              </span>
              <h3>{f.title}</h3>
            </article>
          ))}
        </div>
      </section>

      {/* 5. Neon band */}
      <section className="lp-neon-band">
        <h2>
          VOCÊ NÃO PRECISA ASSISTIR TODOS OS JOGOS.
          <br />
          <span>
            O Tips3x3 ENCONTRA AS MELHORES OPORTUNIDADES PARA VOCÊ.
          </span>
        </h2>
        <Link href="/login" className="lp-btn lp-btn-dark">
          TESTAR AGORA
        </Link>
      </section>

      {/* 6. Compare */}
      <section className="lp-section" id="comparar">
        <div className="lp-section-head">
          <h2>Compare os planos</h2>
          <p>Escolha o nível certo para o seu volume de operações.</p>
        </div>
        <div className="lp-compare-scroll">
          <div className="lp-compare">
            <div className="lp-compare-row is-head">
              <span>Funcionalidade</span>
              <span>Starter</span>
              <span>Pro</span>
              <span>Elite</span>
            </div>
            {COMPARE.map(([label, a, b, c]) => (
              <div className="lp-compare-row" key={label}>
                <span>{label}</span>
                <span className={a === "✔" ? "is-check" : ""}>{a}</span>
                <span className={b === "✔" ? "is-check" : ""}>{b}</span>
                <span
                  className={c === "✔" || c === "Ilimitado" ? "is-check" : ""}
                >
                  {c}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Plans */}
      <section className="lp-section" id="planos">
        <div className="lp-section-head">
          <h2>Planos Premium</h2>
          <p>Acesso imediato após login. Cancele quando quiser.</p>
        </div>
        <div className="lp-plans">
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`lp-card lp-plan ${plan.featured ? "is-featured" : ""} ${plan.id === "elite" ? "is-elite" : ""}`}
            >
              {plan.badge ? (
                <span className="lp-plan-badge">{plan.badge}</span>
              ) : null}
              <h3>{plan.name}</h3>
              <p className="lp-plan-price">
                <strong>{money(plan.price)}</strong>
                <span>/mês</span>
              </p>
              <ul>
                {plan.perks.map((p) => (
                  <li key={p}>{p}</li>
                ))}
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

      {/* 8. Testimonials */}
      <section className="lp-section" id="depoimentos">
        <div className="lp-section-head">
          <h2>Quem opera, recomenda</h2>
        </div>
        <div className="lp-quotes">
          {TESTIMONIALS.map((t) => (
            <blockquote key={t.quote} className="lp-card lp-quote">
              <div className="lp-stars" aria-label="5 estrelas">
                ★★★★★
              </div>
              <p>&ldquo;{t.quote}&rdquo;</p>
              <cite>{t.author}</cite>
            </blockquote>
          ))}
        </div>
      </section>

      {/* 9. FAQ */}
      <section className="lp-section" id="faq">
        <div className="lp-section-head">
          <h2>Perguntas frequentes</h2>
        </div>
        <div className="lp-faq">
          {FAQ.map((item, i) => {
            const open = faqOpen === i;
            return (
              <div key={item.q} className={`lp-faq-item ${open ? "is-open" : ""}`}>
                <button
                  type="button"
                  onClick={() => setFaqOpen(open ? null : i)}
                  aria-expanded={open}
                >
                  {item.q}
                  <span aria-hidden>{open ? "−" : "+"}</span>
                </button>
                {open ? <p>{item.a}</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Image src="/logo-tips3x3.png" alt="tips3x3" width={140} height={36} />
          <p>Tecnologia e análise profissional para Exchange de Futebol.</p>
        </div>
        <div className="lp-footer-cols">
          <div>
            <strong>Produto</strong>
            <a href="#recursos">Recursos</a>
            <a href="#planos">Planos</a>
            <a href="#demo">Demo</a>
            <Link href="/login">Login</Link>
          </div>
          <div>
            <strong>Social</strong>
            <a href="#" aria-label="Instagram">
              Instagram
            </a>
            <a href="#" aria-label="Telegram">
              Telegram
            </a>
            <a href="#" aria-label="WhatsApp">
              WhatsApp
            </a>
          </div>
          <div>
            <strong>Legal</strong>
            <a href="#">Suporte</a>
            <a href="#">Política</a>
            <a href="#">Termos</a>
          </div>
        </div>
        <p className="lp-footer-copy">
          © {new Date().getFullYear()} tips3x3. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}
