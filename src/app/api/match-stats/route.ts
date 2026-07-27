import { NextResponse } from "next/server";
import {
  getInplayByEventId,
  inplayToStatRows,
} from "@/lib/betbra/client";
import { getFotmobMatchIntel } from "@/lib/fotmob/intel";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

type CacheEntry = { at: number; body: unknown };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 12_000;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId")?.trim();
    const home = searchParams.get("home")?.trim();
    const away = searchParams.get("away")?.trim();
    const start = searchParams.get("start")?.trim() || undefined;

    if (!eventId && (!home || !away)) {
      return NextResponse.json(
        { error: "Informe eventId ou home+away" },
        { status: 400 },
      );
    }

    const key = `stats|${eventId ?? ""}|${home ?? ""}|${away ?? ""}|${start ?? ""}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return NextResponse.json(hit.body);
    }

    const inplay = eventId
      ? await getInplayByEventId(eventId).catch(() => null)
      : null;

    const bolsaRows = inplay ? inplayToStatRows(inplay) : [];
    const homeName = inplay?.score?.home?.name ?? home ?? "";
    const awayName = inplay?.score?.away?.name ?? away ?? "";

    const fotmob =
      homeName && awayName
        ? await getFotmobMatchIntel({
            home: homeName,
            away: awayName,
            start,
          }).catch(() => null)
        : null;

    // Bolsa: placar + HT + timeline. Detalhe (posse/chutes/etc) vem do FotMob.
    // Se Bolsa zerar cartões/escanteios e o FotMob tiver valor, preferimos FotMob.
    const bolsaCore = bolsaRows.filter((r) =>
      /^(Placar|Placar HT)$/i.test(r.name),
    );
    const bolsaExtra = bolsaRows.filter(
      (r) => !/^(Placar|Placar HT)$/i.test(r.name),
    );

    const fotmobByName = new Map(
      (fotmob?.extras ?? []).map((r) => [r.name.toLowerCase(), r]),
    );

    const merged: Array<{ name: string; home: string; away: string }> = [
      ...bolsaCore,
    ];

    if (fotmob?.xg.home != null || fotmob?.xg.away != null) {
      merged.push({
        name: "Expected Goals (xG)",
        home: fotmob?.xg.home?.toFixed(2) ?? "—",
        away: fotmob?.xg.away?.toFixed(2) ?? "—",
      });
    }

    for (const row of bolsaExtra) {
      const fm = fotmobByName.get(row.name.toLowerCase());
      const bolsaEmpty =
        (Number(row.home) || 0) === 0 && (Number(row.away) || 0) === 0;
      if (fm && bolsaEmpty) {
        merged.push(fm);
        fotmobByName.delete(row.name.toLowerCase());
      } else {
        merged.push(row);
        fotmobByName.delete(row.name.toLowerCase());
      }
    }

    for (const row of fotmobByName.values()) {
      if (/^expected goals/i.test(row.name)) continue;
      merged.push(row);
    }

    const scoreLabel =
      inplay?.score?.home?.score != null && inplay?.score?.away?.score != null
        ? `${inplay.score.home.score}-${inplay.score.away.score}`
        : fotmob?.scoreLabel;

    const body = {
      found: Boolean(inplay || fotmob),
      source: inplay ? (fotmob ? "bolsa+fotmob" : "bolsa") : fotmob ? "fotmob" : null,
      eventId: eventId ?? null,
      home: homeName || home,
      away: awayName || away,
      scoreLabel: scoreLabel ?? null,
      minute: inplay?.timeElapsed ?? inplay?.elapsedRegularTime ?? null,
      status: inplay?.status ?? fotmob?.status ?? null,
      matchStatus: inplay?.inPlayMatchStatus ?? null,
      stats: merged,
      timeline: (inplay?.updateDetails ?? []).map((u) => ({
        team: u.team,
        teamName: u.teamName,
        type: u.type ?? u.updateType,
        minute: u.matchTime ?? u.elapsedRegularTime,
        at: u.updateTime,
      })),
      pressure: fotmob?.pressure ?? null,
      fotmob: fotmob?.rich ?? null,
      url: fotmob?.sofascoreUrl ?? null,
      message:
        inplay || fotmob
          ? undefined
          : "Sem estatísticas live na Bolsa nem no FotMob para este jogo.",
    };

    cache.set(key, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
