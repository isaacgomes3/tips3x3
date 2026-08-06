import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { listWalletSummaries } from "@/lib/wallet/wallet-store";
import { findUser } from "@/lib/auth/users-store";
import { formatBytes, getReleases } from "@/lib/admin/releases-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const user = findUser(auth.session.email);
  const isMaster = user?.role === "master";
  const balance =
    listWalletSummaries().find((w) => w.email === auth.session.email)?.balance ?? 0;
  const hasAccess = isMaster || balance >= 10;

  if (!hasAccess)
    return NextResponse.json(
      { error: "Acesso disponível para usuários com plano ativo." },
      { status: 403 },
    );

  const releases = getReleases();
  return NextResponse.json({
    ok: true,
    balance,
    isMaster,
    apk: releases.apk
      ? {
          version: releases.apk.version,
          sizeLabel: formatBytes(releases.apk.size),
          updatedAt: releases.apk.updatedAt,
          downloadUrl: "/api/releases/download?kind=apk",
        }
      : null,
    extension: releases.extension
      ? {
          version: releases.extension.version,
          sizeLabel: formatBytes(releases.extension.size),
          updatedAt: releases.extension.updatedAt,
          downloadUrl: "/api/releases/download?kind=extension",
        }
      : null,
  });
}
