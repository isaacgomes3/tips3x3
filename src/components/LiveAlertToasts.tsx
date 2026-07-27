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
  alertsArmed,
  onArmAlerts,
}: {
  toasts: LiveToast[];
  onDismiss: (id: string) => void;
  alertsArmed?: boolean;
  onArmAlerts?: () => void;
}) {
  return (
    <>
      {!alertsArmed && onArmAlerts ? (
        <button
          type="button"
          className="live-alert-arm"
          onClick={() => onArmAlerts()}
        >
          Ativar alertas ENTRAR (som + notificação)
        </button>
      ) : null}

      {toasts.length > 0 ? (
        <div
          className="live-alert-stack"
          role="region"
          aria-label="Alertas ao vivo"
          aria-live="assertive"
        >
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
      ) : null}
    </>
  );
}
