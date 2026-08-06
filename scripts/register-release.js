#!/usr/bin/env node
/**
 * Registra um APK ou extensão no manifesto de releases.
 * Uso: node scripts/register-release.js --kind apk --version 1.3.8 --file /caminho/app-debug.apk
 */

const fs = require("fs");
const path = require("path");

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--kind") result.kind = args[++i];
    else if (args[i] === "--version") result.version = args[++i];
    else if (args[i] === "--file") result.file = args[++i];
  }
  return result;
}

const { kind, version, file } = parseArgs();

if (!kind || !version || !file) {
  console.error("Uso: node scripts/register-release.js --kind apk|extension --version X.Y.Z --file /path/to/file");
  process.exit(1);
}

if (kind !== "apk" && kind !== "extension") {
  console.error("kind deve ser apk ou extension");
  process.exit(1);
}

const STABLE = {
  apk: "tips3x3-latest.apk",
  extension: "bolsa-manual-latest.zip",
};

const releasesDir = process.env.RELEASES_DIR || path.join(process.cwd(), "data", "releases");
const manifestPath = path.join(releasesDir, "manifest.json");

// Garante diretório
if (!fs.existsSync(releasesDir)) fs.mkdirSync(releasesDir, { recursive: true });

// Copia o arquivo
const srcPath = path.resolve(file);
if (!fs.existsSync(srcPath)) {
  console.error(`Arquivo não encontrado: ${srcPath}`);
  process.exit(1);
}

const destPath = path.join(releasesDir, STABLE[kind]);
const tmpPath = `${destPath}.tmp`;
fs.copyFileSync(srcPath, tmpPath);
fs.renameSync(tmpPath, destPath);

const stat = fs.statSync(destPath);

// Atualiza manifesto
let manifest = { apk: null, extension: null };
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch { /* novo manifesto */ }

const downloadName = kind === "apk"
  ? `tips3x3-${version}.apk`
  : `bolsa-manual-${version}.zip`;

manifest[kind] = {
  kind,
  version,
  storedName: STABLE[kind],
  downloadName,
  size: stat.size,
  updatedAt: new Date().toISOString(),
  updatedBy: "ci",
};

const tmpManifest = `${manifestPath}.tmp`;
fs.writeFileSync(tmpManifest, JSON.stringify(manifest, null, 2), "utf8");
fs.renameSync(tmpManifest, manifestPath);

const sizeLabel = stat.size < 1024 * 1024
  ? `${(stat.size / 1024).toFixed(1)} KB`
  : `${(stat.size / (1024 * 1024)).toFixed(1)} MB`;

console.log(`✓ ${kind} v${version} registrado (${sizeLabel})`);
console.log(`  → ${destPath}`);
console.log(`  → manifesto: ${manifestPath}`);
