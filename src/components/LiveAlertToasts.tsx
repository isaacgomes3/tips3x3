"use client";

import { useEffect, useState } from "react";
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
  const [showScreenOffHint, setShowScreenOffHint] = useState(false);

  useEffect(() => {
    if (!alertsArmed || !showScreenOffHint) return;
    const id = window.setTimeout(() => setShowScreenOffHint(false), 10_000);
    return () => window.clearTimeout(id);
  }, [alertsArmed, showScreenOffHint]);

  return (
    <>
      <div className="live-alert-controls">
        {!alertsArmed && onArmAlerts ? (
          <button
            type="button"
            className="live-alert-arm"
            onClick={() => {
              setShowScreenOffHint(true);
              onArmAlerts();
            }}
          >
            Ativar alertas ENTRAR (som + notificação)
          </button>
        ) : null}
        {alertsArmed && showScreenOffHint ? (
          <p className="live-alert-armed-hint">
            Alertas ativos. Com a tela desligada o navegador/app congela e{" "}
            <strong>não notifica</strong> — mantenha o painel aberto.
          </p>
        ) : null}
      </div>

      {toasts.length > 0 ? (
        <div
          className="live-alert-stack"
          role="region"
          aria-label="Alertas ao vivo"
          aria-live="assertive"
        >
          {toasts.map((t) => {
            const strategyClass =
              t.kind === "enter" &&
              (t.strategy === "eventos-raros" || t.strategy === "lucro-certo")
                ? "live-alert-enter-gold"
                : t.kind === "enter" &&
                    (t.strategy === "lay-3x3" ||
                      t.strategy === "over-3.5" ||
                      t.strategy === "over-4.5")
                  ? "live-alert-enter-green"
                  : "";
            const kindLabel =
              t.kind === "enter" && t.strategy === "lucro-certo"
                ? "LUCRO"
                : t.kind === "enter" && t.strategy === "eventos-raros"
                  ? "RAROS"
                  : t.kind === "enter" && t.strategy === "over-3.5"
                    ? "OVER 3.5"
                    : t.kind === "enter" && t.strategy === "over-4.5"
                      ? "OVER 4.5"
                      : t.kind === "enter" && t.strategy === "lay-3x3"
                        ? "LAY 3x3"
                        : KIND_LABEL[t.kind];
            return (
            <div
              key={t.id}
              className={`live-alert-toast live-alert-${t.kind} ${strategyClass}`.trim()}
              role="alert"
            >
              <div className="live-alert-toast-main">
                <span className="live-alert-kind">{kindLabel}</span>
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
            );
          })}
        </div>
      ) : null}
    </>
  );
}
