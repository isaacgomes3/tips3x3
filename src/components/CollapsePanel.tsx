"use client";

import { useId, type ReactNode } from "react";

export function CollapsePanel({
  title,
  subtitle,
  open,
  onToggle,
  badge,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const panelId = useId();

  return (
    <section className={`collapse-panel ${open ? "is-open" : ""} ${className}`.trim()}>
      <button
        type="button"
        className="collapse-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <div className="collapse-trigger-copy">
          <div className="collapse-title-row">
            <h2>{title}</h2>
            {badge}
          </div>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <span className="collapse-chevron" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      <div
        id={panelId}
        className="collapse-body"
        hidden={!open}
        data-open={open ? "true" : "false"}
      >
        <div className="collapse-body-inner">{children}</div>
      </div>
    </section>
  );
}
