import { NextResponse } from "next/server";
import { requireMaster } from "@/lib/auth/require-master";
import { getAppConfig, saveAppConfig } from "@/lib/admin/app-config-store";
import { getSession } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";

/** Leitura liberada a qualquer sessão: o painel usa como default. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, config: getAppConfig() });
}

export async function PUT(request: Request) {
  const gate = await requireMaster();
  if (!gate.ok) return gate.res;

  try {
    const body = (await request.json()) as {
      targetProfitPct?: number;
      lay3x3StakePct?: number;
      eventosRarosStakePct?: number;
      eventosRarosStakeFixed?: number;
      overStakePct?: number;
      over45StakePct?: number;
      qovStakePct?: number;
      lay3x3Enabled?: boolean;
      eventosRarosEnabled?: boolean;
      over35Enabled?: boolean;
      over45Enabled?: boolean;
      layOverLimitPressureEnabled?: boolean;
      qovEnabled?: boolean;
      walletFeePct?: number;
      walletExchangeCommissionPct?: number;
      walletMinDeposit?: number;
      walletChargeLucroCerto?: boolean;
      walletBlockWhenEmpty?: boolean;
    };
    const result = saveAppConfig(body, gate.session.email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, config: result.config });
  } catch {
    return NextResponse.json(
      { error: "Falha ao salvar configurações." },
      { status: 500 },
    );
  }
}
