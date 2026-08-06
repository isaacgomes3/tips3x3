"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type ArtifactView = {
  kind: "apk" | "extension";
  version: string;
  downloadName: string;
  size: number;
  sizeLabel: string;
  updatedAt: string;
  updatedBy: string;
  downloadUrl: string;
};

type ReleasesResponse = {
  ok?: boolean;
  error?: string;
  apk: ArtifactView | null;
  extension: ArtifactView | null;
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

export default function AdminUpdates() {
  const [data, setData] = useState<ReleasesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"apk" | "extension" | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [apkVersion, setApkVersion] = useState("");
  const [extVersion, setExtVersion] = useState("");
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [extFile, setExtFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/releases", { cache: "no-store" });
      const json = (await res.json()) as ReleasesResponse;
      if (!res.ok) {
        setError(json.error || "Não foi possível carregar as atualizações.");
        return;
      }
      setData(json);
      if (json.apk?.version) setApkVersion(json.apk.version);
      if (json.extension?.version) setExtVersion(json.extension.version);
    } catch {
      setError("Falha de rede ao carregar as atualizações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(kind: "apk" | "extension", e: FormEvent) {
    e.preventDefault();
    const file = kind === "apk" ? apkFile : extFile;
    const version = kind === "apk" ? apkVersion : extVersion;
    if (!file) {
      setMsg({ text: "Escolha um ficheiro antes de publicar.", ok: false });
      return;
    }
    setBusy(kind);
    setMsg(null);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("version", version.trim());
      form.set("file", file);
      const res = await fetch("/api/admin/releases", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as ReleasesResponse & { error?: string };
      if (!res.ok) {
        setMsg({ text: json.error || "Falha no upload.", ok: false });
        return;
      }
      setData(json);
      setMsg({
        text:
          kind === "apk"
            ? `APK ${json.apk?.version || ""} publicado.`
            : `Extensão ${json.extension?.version || ""} publicada.`,
        ok: true,
      });
      if (kind === "apk") setApkFile(null);
      else setExtFile(null);
    } catch {
      setMsg({ text: "Falha de rede no upload.", ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-grid">
      <section className="config-card">
        <h3>Atualizações</h3>
        <p className="config-lead">
          Aqui fica sempre a versão mais atual do APK Android e do ZIP da
          extensão Bolsa Manual. Publique um ficheiro novo para substituir o
          anterior.
        </p>
        {msg ? (
          <p className={`users-admin-msg ${msg.ok ? "is-up" : "is-down"}`}>
            {msg.text}
          </p>
        ) : null}
        {error ? <p className="users-admin-msg is-down">{error}</p> : null}
        {loading && !data ? <p className="config-hint">Carregando…</p> : null}
      </section>

      <ArtifactCard
        title="App Android (APK)"
        emptyHint="Nenhum APK publicado. Gere com npm run mobile:apk e envie o ficheiro."
        artifact={data?.apk ?? null}
        version={apkVersion}
        onVersion={setApkVersion}
        accept=".apk,application/vnd.android.package-archive"
        file={apkFile}
        onFile={setApkFile}
        busy={busy === "apk"}
        onSubmit={(e) => void upload("apk", e)}
      />

      <ArtifactCard
        title="Extensão Chrome (ZIP)"
        emptyHint="Nenhum ZIP publicado. Envie o bolsa-manual-x.y.z.zip mais recente."
        artifact={data?.extension ?? null}
        version={extVersion}
        onVersion={setExtVersion}
        accept=".zip,application/zip"
        file={extFile}
        onFile={setExtFile}
        busy={busy === "extension"}
        onSubmit={(e) => void upload("extension", e)}
      />
    </div>
  );
}

function ArtifactCard({
  title,
  emptyHint,
  artifact,
  version,
  onVersion,
  accept,
  file,
  onFile,
  busy,
  onSubmit,
}: {
  title: string;
  emptyHint: string;
  artifact: ArtifactView | null;
  version: string;
  onVersion: (v: string) => void;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <section className="config-card admin-release-card">
      <div className="admin-release-head">
        <h3>{title}</h3>
        {artifact ? (
          <span className="admin-badge is-up">v{artifact.version}</span>
        ) : (
          <span className="admin-badge">ausente</span>
        )}
      </div>

      {artifact ? (
        <div className="admin-kpis">
          <div className="admin-kpi">
            <span>Versão atual</span>
            <strong>{artifact.version}</strong>
          </div>
          <div className="admin-kpi">
            <span>Tamanho</span>
            <strong>{artifact.sizeLabel}</strong>
          </div>
          <div className="admin-kpi">
            <span>Atualizado</span>
            <strong style={{ fontSize: 14 }}>{shortWhen(artifact.updatedAt)}</strong>
            {artifact.updatedBy ? <small>{artifact.updatedBy}</small> : null}
          </div>
        </div>
      ) : (
        <p className="config-hint">{emptyHint}</p>
      )}

      <div className="admin-release-actions">
        {artifact ? (
          <a className="btn-primary" href={artifact.downloadUrl}>
            Baixar versão atual
          </a>
        ) : null}
      </div>

      <form className="admin-form admin-release-form" onSubmit={onSubmit}>
        <label className="config-field">
          <span>Nova versão</span>
          <input
            type="text"
            placeholder="ex.: 1.11.17"
            value={version}
            onChange={(e) => onVersion(e.target.value)}
          />
        </label>
        <label className="config-field">
          <span>Ficheiro</span>
          <input
            type="file"
            accept={accept}
            onChange={(e) => onFile(e.target.files?.[0] || null)}
          />
          {file ? (
            <small className="config-hint" style={{ display: "block", marginTop: 6 }}>
              {file.name}
            </small>
          ) : null}
        </label>
        <button type="submit" className="btn-primary" disabled={busy || !file}>
          {busy ? "Publicando…" : "Publicar como atual"}
        </button>
      </form>
    </section>
  );
}
