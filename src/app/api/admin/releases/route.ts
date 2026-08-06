import { NextResponse } from "next/server";
import { requireMaster } from "@/lib/auth/require-master";
import {
  formatBytes,
  getReleases,
  saveReleaseFile,
  seedReleasesFromWorkspace,
  type ReleaseKind,
} from "@/lib/admin/releases-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function serialize() {
  const releases = getReleases();
  return {
    ok: true as const,
    apk: releases.apk
      ? {
          ...releases.apk,
          sizeLabel: formatBytes(releases.apk.size),
          downloadUrl: "/api/admin/releases/download?kind=apk",
        }
      : null,
    extension: releases.extension
      ? {
          ...releases.extension,
          sizeLabel: formatBytes(releases.extension.size),
          downloadUrl: "/api/admin/releases/download?kind=extension",
        }
      : null,
  };
}

export async function GET() {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  seedReleasesFromWorkspace("sistema");
  return NextResponse.json(serialize());
}

export async function POST(request: Request) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  try {
    const form = await request.formData();
    const kindRaw = String(form.get("kind") || "").trim();
    const kind = kindRaw as ReleaseKind;
    if (kind !== "apk" && kind !== "extension") {
      return NextResponse.json(
        { error: "kind deve ser apk ou extension." },
        { status: 400 },
      );
    }

    const version = String(form.get("version") || "").trim();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Envie o ficheiro no campo file." },
        { status: 400 },
      );
    }

    const name = file.name.toLowerCase();
    if (kind === "apk" && !name.endsWith(".apk")) {
      return NextResponse.json(
        { error: "O APK precisa de extensão .apk." },
        { status: 400 },
      );
    }
    if (kind === "extension" && !name.endsWith(".zip")) {
      return NextResponse.json(
        { error: "A extensão precisa de ser um .zip." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = saveReleaseFile({
      kind,
      version:
        version ||
        (kind === "extension"
          ? name.replace(/^bolsa-manual-?/i, "").replace(/\.zip$/i, "")
          : name.replace(/\.apk$/i, "")) ||
        "latest",
      buffer,
      updatedBy: gate.session.email,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ...serialize(),
      uploaded: result.artifact,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: `Falha no upload: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 500 },
    );
  }
}
