import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { error: "O período de teste grátis foi encerrado." },
    { status: 410 },
  );
}

/** Endpoint legado: clientes antigos recebem uma resposta explícita. */
export async function POST() {
  return NextResponse.json(
    { error: "O período de teste grátis foi encerrado." },
    { status: 410 },
  );
}
