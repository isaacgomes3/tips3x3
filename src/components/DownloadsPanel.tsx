"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone, Puzzle } from "lucide-react";

type ArtifactInfo = {
  version: string;
  sizeLabel: string;
  updatedAt: string;
  downloadUrl: string;
};

type ReleasesData = {
  ok: boolean;
  balance: number;
  isMaster: boolean;
  apk: ArtifactInfo | null;
  extension: ArtifactInfo | null;
};

function shortWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function DownloadsPanel() {
  const [data, setData] = useState<ReleasesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/releases")
      .then((r) => r.json())
      .then((json: ReleasesData & { error?: string }) => {
        if (!json.ok) {
          setError(json.error || "Não foi possível carregar os downloads.");
        } else {
          setData(json);
        }
      })
      .catch(() => setError("Falha de rede."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="config-hint">Carregando downloads…</p>;
  if (error)
    return (
      <div className="dl-locked">
        <span className="dl-lock-icon">🔒</span>
        <p>{error}</p>
        <p className="dl-lock-hint">
          Ative um plano para desbloquear o acesso ao APK e à extensão.
        </p>
      </div>
    );

  return (
    <div className="dl-root">
      <div className="dl-header">
        <h2>Downloads</h2>
        <p className="dl-subtitle">
          Versões mais recentes disponíveis para o seu plano
        </p>
      </div>

      <div className="dl-grid">
        <DownloadCard
          icon={<Smartphone size={28} />}
          title="App Android (APK)"
          artifact={data?.apk ?? null}
          emptyHint="APK ainda não publicado pelo administrador."
        />
        <DownloadCard
          icon={<Puzzle size={28} />}
          title="Extensão Chrome (ZIP)"
          artifact={data?.extension ?? null}
          emptyHint="Extensão ainda não publicada pelo administrador."
        />
      </div>

      <div className="dl-instructions">
        <h3>Como instalar</h3>
        <div className="dl-steps-grid">
          <div className="dl-step-card">
            <span className="dl-step-num">1</span>
            <div>
              <strong>APK Android</strong>
              <p>
                Baixe o arquivo APK, habilite "Fontes desconhecidas" nas
                configurações do seu Android e instale normalmente.
              </p>
            </div>
          </div>
          <div className="dl-step-card">
            <span className="dl-step-num">2</span>
            <div>
              <strong>Extensão Chrome</strong>
              <p>
                Extraia o ZIP baixado, acesse{" "}
                <code>chrome://extensions</code>, ative o "Modo desenvolvedor"
                e clique em "Carregar sem compactação".
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DownloadCard({
  icon,
  title,
  artifact,
  emptyHint,
}: {
  icon: React.ReactNode;
  title: string;
  artifact: ArtifactInfo | null;
  emptyHint: string;
}) {
  return (
    <div className="dl-card">
      <div className="dl-card-head">
        <span className="dl-card-icon">{icon}</span>
        <div>
          <h3>{title}</h3>
          {artifact && (
            <span className="dl-version-badge">v{artifact.version}</span>
          )}
        </div>
      </div>

      {artifact ? (
        <>
          <div className="dl-card-meta">
            <div className="dl-meta-item">
              <span>Versão</span>
              <strong>{artifact.version}</strong>
            </div>
            <div className="dl-meta-item">
              <span>Tamanho</span>
              <strong>{artifact.sizeLabel}</strong>
            </div>
            <div className="dl-meta-item">
              <span>Atualizado</span>
              <strong>{shortWhen(artifact.updatedAt)}</strong>
            </div>
          </div>
          <a
            href={artifact.downloadUrl}
            className="dl-download-btn"
            download
          >
            <Download size={16} />
            Baixar versão atual
          </a>
        </>
      ) : (
        <p className="config-hint">{emptyHint}</p>
      )}
    </div>
  );
}
