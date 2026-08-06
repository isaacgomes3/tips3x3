"use client";

import type { ReactNode } from "react";
import {
  Check,
  ChessKnight,
  CircleDollarSign,
  ClipboardList,
  Download,
  Eye,
  Globe2,
  GraduationCap,
  Laptop,
  Lightbulb,
  List,
  Percent,
  Play,
  Radio,
  RefreshCw,
  Shield,
  Tag,
  Trophy,
  Bot,
  CalendarDays,
  ChevronRight,
} from "lucide-react";
import type { TabKey } from "@/lib/central/types";

type HubProps = {
  todayPct: number;
  onSync: () => void;
  onOpenCalendar: () => void;
  onOpenModule: (tab: TabKey) => void;
};

function HubTile({
  label,
  icon,
  onClick,
  soon,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  soon?: boolean;
}) {
  return (
    <button
      type="button"
      className={`hub-tile ${soon ? "is-soon" : ""}`}
      onClick={soon ? undefined : onClick}
      disabled={soon}
    >
      {soon && <span className="hub-soon">EM BREVE!</span>}
      <span className="hub-tile-ico" aria-hidden>
        {icon}
      </span>
      <span className="hub-tile-label">{label}</span>
    </button>
  );
}

function formatDayBadge(d = new Date()) {
  const day = d.getDate().toString().padStart(2, "0");
  const mon = d
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "")
    .toUpperCase();
  return { day, mon };
}

export function CentralHub({
  todayPct,
  onSync,
  onOpenCalendar,
  onOpenModule,
}: HubProps) {
  const { day, mon } = formatDayBadge();
  const pctLabel = `${todayPct.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;

  return (
    <div className="central-hub">
      <div className="central-hub-bg" aria-hidden />

      <div className="central-hub-grid">
        <section className="hub-col hub-col-left">
          <h3 className="hub-section-title">Tudo ao seu alcance</h3>
          <div className="hub-hero-card">
            <div className="hub-hero-media">
              <img
                src="/central/Gemini_Generated_Image_lunw8mlunw8mlunw.png"
                alt=""
              />
              <div className="hub-hero-overlay">
                <Laptop className="hub-hero-icon" />
                <strong>PAINEL DE CONTROLE</strong>
              </div>
              <div className="hub-hero-dots" aria-hidden>
                <span className="is-on" />
                <span />
                <span />
              </div>
            </div>
          </div>

          <h3 className="hub-section-title">Movimentações</h3>
          <button type="button" className="hub-sync-btn" onClick={onSync}>
            <ClipboardList className="hub-sync-ico" />
            SINCRONIZAR DADOS
          </button>
          <button
            type="button"
            className="hub-row-btn"
            onClick={() => onOpenModule("entries")}
          >
            <List className="hub-row-ico" />
            MINHAS APOSTAS
          </button>
          <button
            type="button"
            className="hub-row-btn"
            onClick={() => onOpenModule("stake")}
          >
            <CircleDollarSign className="hub-row-ico" />
            DEPÓSITO/SAQUE
          </button>
        </section>

        <section className="hub-col hub-col-mid">
          <h3 className="hub-section-title">Resultado diário</h3>
          <div className="hub-daily">
            <div className="hub-date-badge">
              <span className="hub-date-day">{day}</span>
              <span className="hub-date-mon">{mon}</span>
            </div>
            <div className="hub-daily-pct">
              <strong>{pctLabel}</strong>
              <span>% Banca</span>
            </div>
            <button
              type="button"
              className="hub-daily-next"
              onClick={onOpenCalendar}
              aria-label="Abrir calendário"
            >
              <ChevronRight />
            </button>
            <button
              type="button"
              className="hub-calendar-btn"
              onClick={onOpenCalendar}
            >
              <CalendarDays />
              <span>CALENDÁRIO</span>
            </button>
          </div>

          <h3 className="hub-section-title">Relatórios</h3>
          <div className="hub-tile-grid">
            <HubTile label="MÉTODOS" icon={<Check />} soon />
            <HubTile label="ESPORTES" icon={<Globe2 />} soon />
            <HubTile label="MERCADOS" icon={<Lightbulb />} soon />
            <HubTile label="ESTRATÉGIAS" icon={<ChessKnight />} soon />
            <HubTile label="LOCAIS" icon={<Globe2 />} soon />
            <HubTile label="LIGAS" icon={<Trophy />} soon />
            <HubTile label="CONSULTORIAS" icon={<Laptop />} soon />
            <HubTile label="LIVE X PRÉ-LIVE" icon={<Radio />} soon />
            <HubTile
              label="CRIATIVOS"
              icon={<Download />}
              onClick={() => onOpenModule("criativos")}
            />
            <HubTile label="CLUBES" icon={<Shield />} soon />
            <HubTile label="BOTS" icon={<Bot />} soon />
            <HubTile
              label="ODDS"
              icon={<Percent />}
              onClick={() => onOpenModule("statistics")}
            />
          </div>
        </section>

        <section className="hub-col hub-col-right">
          <h3 className="hub-section-title">Configurações</h3>
          <div className="hub-tile-grid hub-tile-grid-settings">
            <HubTile label="MÉTODOS" icon={<Check />} soon />
            <HubTile label="ESTRATÉGIAS" icon={<ChessKnight />} soon />
            <HubTile label="CONSULTORIAS" icon={<GraduationCap />} soon />
            <HubTile
              label="STAKES/UNIDADES"
              icon={<Percent />}
              onClick={() => onOpenModule("stake")}
            />
            <HubTile label="TAGS" icon={<Tag />} soon />
            <HubTile
              label="GERAL"
              icon={<Eye />}
              onClick={() => onOpenModule("telegram")}
            />
            <HubTile label="TUTORIAL" icon={<Play />} soon />
            <HubTile
              label="INTEGRAÇÃO"
              icon={<RefreshCw />}
              onClick={() => onOpenModule("telegram")}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
