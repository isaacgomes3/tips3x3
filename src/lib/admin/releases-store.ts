/**
 * Artefatos de distribuição (APK + extensão) geridos pelo master.
 * Disco: data/releases/ (gitignored).
 */

import fs from "fs";
import path from "path";

export type ReleaseKind = "apk" | "extension";

export type ReleaseArtifact = {
  kind: ReleaseKind;
  version: string;
  /** Nome estável no disco (sempre o "latest"). */
  storedName: string;
  /** Nome sugerido no download. */
  downloadName: string;
  size: number;
  updatedAt: string;
  updatedBy: string;
};

export type ReleasesManifest = {
  apk: ReleaseArtifact | null;
  extension: ReleaseArtifact | null;
};

const STABLE: Record<ReleaseKind, string> = {
  apk: "tips3x3-latest.apk",
  extension: "bolsa-manual-latest.zip",
};

function releasesDir() {
  if (process.env.RELEASES_DIR) return process.env.RELEASES_DIR;
  return path.join(/* turbopackIgnore: true */ process.cwd(), "data", "releases");
}

function manifestPath() {
  return path.join(releasesDir(), "manifest.json");
}

function ensureDir() {
  const dir = releasesDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function emptyManifest(): ReleasesManifest {
  return { apk: null, extension: null };
}

function readManifest(): ReleasesManifest {
  try {
    const raw = fs.readFileSync(manifestPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ReleasesManifest>;
    return {
      apk: parsed.apk && typeof parsed.apk === "object" ? parsed.apk : null,
      extension:
        parsed.extension && typeof parsed.extension === "object"
          ? parsed.extension
          : null,
    };
  } catch {
    return emptyManifest();
  }
}

function writeManifest(manifest: ReleasesManifest) {
  ensureDir();
  const tmp = `${manifestPath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), "utf8");
  fs.renameSync(tmp, manifestPath());
}

function fileStatOrNull(filePath: string) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

/** Reconcilia manifesto com ficheiros no disco. */
export function getReleases(): ReleasesManifest {
  ensureDir();
  const dir = releasesDir();
  const manifest = readManifest();
  let dirty = false;

  for (const kind of ["apk", "extension"] as ReleaseKind[]) {
    const stable = path.join(dir, STABLE[kind]);
    const st = fileStatOrNull(stable);
    if (!st) {
      if (manifest[kind]) {
        manifest[kind] = null;
        dirty = true;
      }
      continue;
    }
    const current = manifest[kind];
    if (
      !current ||
      current.size !== st.size ||
      current.storedName !== STABLE[kind]
    ) {
      manifest[kind] = {
        kind,
        version: current?.version || "desconhecida",
        storedName: STABLE[kind],
        downloadName:
          current?.downloadName ||
          (kind === "apk"
            ? `tips3x3-${current?.version || "latest"}.apk`
            : `bolsa-manual-${current?.version || "latest"}.zip`),
        size: st.size,
        updatedAt: current?.updatedAt || st.mtime.toISOString(),
        updatedBy: current?.updatedBy || "",
      };
      dirty = true;
    }
  }

  if (dirty) writeManifest(manifest);
  return manifest;
}

export function getReleaseFilePath(kind: ReleaseKind): string | null {
  const filePath = path.join(ensureDir(), STABLE[kind]);
  return fileStatOrNull(filePath) ? filePath : null;
}

export function getReleaseArtifact(kind: ReleaseKind): ReleaseArtifact | null {
  return getReleases()[kind];
}

function sanitizeVersion(raw: unknown): string {
  const v = String(raw ?? "")
    .trim()
    .replace(/[^\w.\-+]/g, "")
    .slice(0, 32);
  return v || "latest";
}

function downloadNameFor(kind: ReleaseKind, version: string) {
  return kind === "apk"
    ? `tips3x3-${version}.apk`
    : `bolsa-manual-${version}.zip`;
}

export function saveReleaseFile(opts: {
  kind: ReleaseKind;
  version: string;
  buffer: Buffer;
  updatedBy: string;
}): { ok: true; artifact: ReleaseArtifact } | { ok: false; error: string } {
  const kind = opts.kind;
  if (kind !== "apk" && kind !== "extension") {
    return { ok: false, error: "Tipo inválido (apk | extension)." };
  }
  if (!opts.buffer?.length) {
    return { ok: false, error: "Ficheiro vazio." };
  }
  const maxBytes = kind === "apk" ? 120 * 1024 * 1024 : 40 * 1024 * 1024;
  if (opts.buffer.length > maxBytes) {
    return { ok: false, error: "Ficheiro demasiado grande." };
  }

  const version = sanitizeVersion(opts.version);
  const dir = ensureDir();
  const storedName = STABLE[kind];
  const dest = path.join(dir, storedName);
  const tmp = `${dest}.tmp`;

  try {
    fs.writeFileSync(tmp, opts.buffer);
    fs.renameSync(tmp, dest);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      error: `Falha ao gravar: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const artifact: ReleaseArtifact = {
    kind,
    version,
    storedName,
    downloadName: downloadNameFor(kind, version),
    size: opts.buffer.length,
    updatedAt: new Date().toISOString(),
    updatedBy: String(opts.updatedBy || "").slice(0, 120),
  };

  const manifest = getReleases();
  manifest[kind] = artifact;
  writeManifest(manifest);
  return { ok: true, artifact };
}

/**
 * Se ainda não houver artefacto, tenta publicar a partir de builds locais
 * (útil em dev / após gerar zip ou APK na máquina).
 */
export function seedReleasesFromWorkspace(updatedBy = "sistema"): ReleasesManifest {
  ensureDir();
  const manifest = getReleases();
  const cwd = /* turbopackIgnore: true */ process.cwd();

  if (!manifest.extension) {
    try {
      const zips = fs
        .readdirSync(cwd)
        .filter((n) => /^bolsa-manual-[\w.\-]+\.zip$/i.test(n))
        .map((n) => {
          const full = path.join(cwd, n);
          const st = fs.statSync(full);
          return { n, full, mtime: st.mtimeMs, size: st.size };
        })
        .sort((a, b) => b.mtime - a.mtime);
      const best = zips[0];
      if (best) {
        const m = best.n.match(/bolsa-manual-([\w.\-]+)\.zip$/i);
        const version = m?.[1] || "latest";
        saveReleaseFile({
          kind: "extension",
          version,
          buffer: fs.readFileSync(best.full),
          updatedBy,
        });
      }
    } catch {
      /* ignore */
    }
  }

  if (!manifest.apk) {
    const apkCandidates = [
      path.join(
        cwd,
        "mobile",
        "android",
        "app",
        "build",
        "outputs",
        "apk",
        "debug",
        "app-debug.apk",
      ),
      path.join(
        cwd,
        "mobile",
        "android",
        "app",
        "build",
        "outputs",
        "apk",
        "release",
        "app-release.apk",
      ),
      path.join(cwd, "tips3x3-latest.apk"),
      path.join(cwd, "app-debug.apk"),
    ];
    for (const candidate of apkCandidates) {
      try {
        if (!fs.existsSync(candidate)) continue;
        const versionMatch = candidate.match(/tips3x3-([\w.\-]+)\.apk$/i);
        saveReleaseFile({
          kind: "apk",
          version: versionMatch?.[1] || "1.0",
          buffer: fs.readFileSync(candidate),
          updatedBy,
        });
        break;
      } catch {
        /* try next */
      }
    }
  }

  return getReleases();
}

export function formatBytes(n: number) {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
