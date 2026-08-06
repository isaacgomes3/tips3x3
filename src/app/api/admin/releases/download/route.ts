import fs from "fs";
import { NextResponse } from "next/server";
import { requireMaster } from "@/lib/auth/require-master";
import {
  getReleaseArtifact,
  getReleaseFilePath,
  type ReleaseKind,
} from "@/lib/admin/releases-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  const url = new URL(request.url);
  const kind = String(url.searchParams.get("kind") || "").trim() as ReleaseKind;
  if (kind !== "apk" && kind !== "extension") {
    return NextResponse.json(
      { error: "kind deve ser apk ou extension." },
      { status: 400 },
    );
  }

  const filePath = getReleaseFilePath(kind);
  const artifact = getReleaseArtifact(kind);
  if (!filePath || !artifact) {
    return NextResponse.json(
      {
        error:
          kind === "apk"
            ? "Ainda não há APK publicado."
            : "Ainda não há extensão publicada.",
      },
      { status: 404 },
    );
  }

  const data = fs.readFileSync(filePath);
  const contentType =
    kind === "apk" ? "application/vnd.android.package-archive" : "application/zip";

  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename="${artifact.downloadName}"`,
      "Cache-Control": "no-store",
    },
  });
}
