"use client";

import { ExternalLink } from "lucide-react";

export type ActiveAlertItem = {
  id: string;
  severity: "info" | "watch" | "entry" | "abort";
  badge: string;
  eventId: string;
  eventName: string;
  subtitle: string;
  scoreLabel?: string | null;
  minute?: number | null;
  status?: string;
  href: string;
};

function formatLiveMinute(minute: number | null | undefined, status?: string) {
  if (minute == null || !Number.isFinite(minute)) {
    if (status && /HT|intervalo/i.test(status)) return "HT";
    return "—";
  }
  return `${Math.max(0, Math.floor(minute))}′`;
}

export function ActiveAlertsPanel({
  items,
  onOpenEvent,
}: {
  items: ActiveAlertItem[];
  onOpenEvent: (eventId: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="active-alerts-panel" aria-label="Alertas ativos">
      <header className="active-alerts-head">
        <strong>Alertas ativos</strong>
        <span>{items.length}</span>
      </header>
      <ul className="active-alerts-list">
        {items.map((item) => (
          <li key={item.id} className={`active-alert-row is-${item.severity}`}>
            <button
              type="button"
              className="active-alert-main"
              onClick={() => onOpenEvent(item.eventId)}
            >
              {item.scoreLabel ? (
                <span className="active-alert-score">
                  <strong>{item.scoreLabel}</strong>
                  <em>
                    <span className="dot-live" aria-hidden />
                    {formatLiveMinute(item.minute, item.status)}
                  </em>
                </span>
              ) : (
                <span className="active-alert-score is-empty">
                  <strong>—</strong>
                </span>
              )}
              <span className="active-alert-meta">
                <strong>{item.eventName}</strong>
                <small>{item.subtitle}</small>
              </span>
            </button>
            {item.href ? (
              <a
                className={`active-alert-link tag ${
                  item.severity === "entry" ? "tag-entry" : ""
                }`}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                title="Abrir evento na Exchange"
              >
                <span>{item.badge}</span>
                <ExternalLink aria-hidden className="active-alert-link-icon" />
              </a>
            ) : (
              <button
                type="button"
                className={`active-alert-link tag ${
                  item.severity === "entry" ? "tag-entry" : ""
                }`}
                onClick={() => onOpenEvent(item.eventId)}
                title="Abrir evento"
              >
                <span>{item.badge}</span>
                <ExternalLink aria-hidden className="active-alert-link-icon" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
