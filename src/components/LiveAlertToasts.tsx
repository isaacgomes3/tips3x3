"use client";

import type { LiveToast } from "@/hooks/useLiveAlerts";

const KIND_LABEL: Record<LiveToast["kind"], string> = {
  goal: "GOL",
  ft: "FIM",
  enter: "ENTRAR",
};

export function LiveAlertToasts({
  toasts,
  onDismiss,
}: {
  toasts: LiveToast[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;

  return (
    <div className="live-alert-stack" role="region" aria-label="Alertas ao vivo">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`live-alert-toast live-alert-${t.kind}`}
          role="alert"
        >
          <div className="live-alert-toast-main">
            <span className="live-alert-kind">{KIND_LABEL[t.kind]}</span>
            <strong>{t.title}</strong>
            <p>{t.body}</p>
          </div>
          <button
            type="button"
            className="live-alert-dismiss"
            aria-label="Fechar alerta"
            onClick={() => onDismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
