"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  Bot,
  Crown,
  Download,
  Gauge,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

export type DashboardShellView =
  | "dashboard"
  | "jogos"
  | "alertas"
  | "estatisticas"
  | "carteira"
  | "config"
  | "afiliados"
  | "downloads";

type NavItem = {
  label: string;
  icon: LucideIcon;
  view: DashboardShellView;
};

/** Um item por aba — sem duplicar rótulos para a mesma view. */
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, view: "dashboard" },
  { label: "Automação", icon: Bot, view: "jogos" },
  { label: "Estatísticas", icon: BarChart3, view: "estatisticas" },
  { label: "Planos", icon: Crown, view: "carteira" },
  { label: "Downloads", icon: Download, view: "downloads" },
  { label: "Afiliados", icon: Users, view: "afiliados" },
];

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const VIEW_TITLES: Partial<Record<DashboardShellView, { title: string; subtitle: string }>> = {
  dashboard: { title: "Dashboard", subtitle: "Visão geral da sua automação" },
  jogos: { title: "Automação", subtitle: "Sinais e mercados monitorados" },
  alertas: { title: "Alertas", subtitle: "Ofertas e operações recentes" },
  estatisticas: { title: "Estatísticas", subtitle: "Desempenho das suas operações" },
  carteira: { title: "Carteira", subtitle: "Créditos e depósitos" },
  afiliados: { title: "Afiliados", subtitle: "Seus indicados e link de indicação" },
  downloads: { title: "Downloads", subtitle: "APK e extensão disponíveis para o seu plano" },
};

/** "isaac.g@mail.com" → { name: "Isaac G.", initials: "IG" } */
function profileFromEmail(email: string | null): {
  name: string;
  initials: string;
} {
  if (!email) return { name: "Membro", initials: "M" };
  const words = email
    .split("@")[0]
    .split(/[._\-+]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  if (words.length === 0) return { name: "Membro", initials: "M" };
  const name =
    words.length === 1
      ? words[0]
      : `${words[0]} ${words[1].charAt(0).toUpperCase()}.`;
  const initials = words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return { name, initials };
}

export default function DashboardShell({
  alertCount = 0,
  onNavigate,
  onBuyCredits,
  onLogout,
  activeView,
  disabled,
  children,
}: {
  alertCount?: number;
  onNavigate: (view: DashboardShellView) => void;
  onBuyCredits: () => void;
  onLogout: () => void;
  /** Aba atual — destaca o item correspondente na navegação lateral. */
  activeView?: string;
  /** APK usa o terminal antigo — o shell vira passthrough (sem sidebar/topbar). */
  disabled?: boolean;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadWallet = async () => {
      try {
        const res = await fetch("/api/wallet", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          wallet?: { balance?: number };
        };
        if (!cancelled) setBalance(Number(json.wallet?.balance ?? 0));
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    };
    void loadWallet();
    const id = window.setInterval(() => void loadWallet(), 60_000);
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: { authenticated?: boolean; email?: string }) => {
        if (!cancelled && data.authenticated && data.email) {
          setEmail(data.email);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [profileOpen]);

  const profile = profileFromEmail(email);

  const go = (view: DashboardShellView) => {
    setDrawerOpen(false);
    onNavigate(view);
  };

  if (disabled) return <>{children}</>;

  const heading = VIEW_TITLES[activeView as DashboardShellView] ?? VIEW_TITLES.dashboard!;

  return (
    <div className="dsh-shell">
      {drawerOpen ? (
        <div
          className="dsh-backdrop"
          aria-hidden
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <aside className={`dsh-sidebar ${drawerOpen ? "is-open" : ""}`}>
        <div className="dsh-brand">
          <img src="/logo-tips3x3.png" alt="Tips3x3" width={128} height={38} />
          <button
            type="button"
            className="dsh-close"
            aria-label="Fechar menu"
            onClick={() => setDrawerOpen(false)}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <nav className="dsh-nav" aria-label="Menu principal">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`dsh-nav-item ${item.view === activeView ? "is-active" : ""}`}
              onClick={() => go(item.view)}
            >
              <item.icon size={17} aria-hidden />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="dsh-support">
          <span className="dsh-support-icon">
            <Headphones size={20} aria-hidden />
          </span>
          <p>
            <strong>Dúvidas ou suporte?</strong>
            <br />
            Fale com nosso time!
          </p>
        </div>

        <button type="button" className="dsh-nav-logout" onClick={onLogout}>
          <LogOut size={16} aria-hidden />
          <span>Sair da conta</span>
        </button>
      </aside>

      <div className="dsh-main">
        <header className="dsh-topbar">
          <div className="dsh-topbar-left">
            <button
              type="button"
              className="dsh-menu-btn"
              aria-label="Abrir menu"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={20} aria-hidden />
            </button>
            <span className="dsh-title-badge">
              <Gauge size={15} aria-hidden />
            </span>
            <div className="dsh-title">
              <h1>{heading.title}</h1>
              <p>{heading.subtitle}</p>
            </div>
          </div>

          <div className="dsh-topbar-right">
            <div className="dsh-credits">
              <span>Créditos disponíveis</span>
              <strong suppressHydrationWarning>
                {balance == null ? "—" : brl(balance)}
              </strong>
            </div>
            <button type="button" className="dsh-buy" onClick={onBuyCredits}>
              <Plus size={15} aria-hidden />
              <span>Comprar créditos</span>
            </button>
            <button
              type="button"
              className="dsh-bell"
              aria-label="Notificações"
              onClick={() => go("alertas")}
            >
              <Bell size={17} aria-hidden />
              {alertCount > 0 ? <span className="dsh-bell-dot" /> : null}
            </button>
            <button
              type="button"
              className="dsh-logout"
              title="Sair da conta"
              onClick={onLogout}
            >
              <LogOut size={16} aria-hidden />
              <span>Sair</span>
            </button>
            <div className="dsh-profile-wrap" ref={profileRef}>
              <button
                type="button"
                className="dsh-profile"
                aria-expanded={profileOpen}
                onClick={() => setProfileOpen((v) => !v)}
              >
                <span className="dsh-avatar">{profile.initials}</span>
                <span className="dsh-profile-info">
                  <strong>{profile.name}</strong>
                  <span>Membro Pro</span>
                </span>
              </button>
              {profileOpen ? (
                <div className="dsh-profile-menu">
                  <button type="button" onClick={onLogout}>
                    Sair da conta
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="dsh-content">{children}</div>
      </div>
    </div>
  );
}
