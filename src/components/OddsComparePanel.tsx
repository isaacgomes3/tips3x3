"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Goal } from "lucide-react";
import type {
  OddsComparePayload,
  OddsCompareRow,
  SelectionCompare,
} from "@/lib/odds-compare/build";

type Offer = {
  odds: number;
  source: string;
  kind: "casa" | "bolsa";
};

function formatOdd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n >= 10 ? n.toFixed(1) : n.toFixed(2);
}

function formatKick(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date(iso))
      .replace(".", "");
  } catch {
    return iso;
  }
}

function competitionPath(row: OddsCompareRow) {
  const parts = [row.sportTitle, row.competition].filter(Boolean) as string[];
  if (!parts.length) return "FUTEBOL";
  return parts
    .map((p) => p.toUpperCase())
    .join(" / ");
}

/** Odd principal = só casa (nunca Bolsa). */
function bookOffer(sel: SelectionCompare): Offer | null {
  if (sel.bestBook?.odds == null || !Number.isFinite(sel.bestBook.odds)) {
    return null;
  }
  return {
    odds: sel.bestBook.odds,
    source: sel.bestBook.bookmaker,
    kind: "casa",
  };
}

function surebetReturn(offers: Array<Offer | null>): number | null {
  if (offers.length < 2 || offers.some((o) => !o)) return null;
  const implied = offers.reduce((sum, o) => sum + 1 / (o as Offer).odds, 0);
  if (!(implied > 0) || implied >= 0.999) return null;
  return Math.round((1 / implied - 1) * 10000) / 100;
}

function stakeSplit(total: number, offers: Offer[]) {
  const implied = offers.reduce((s, o) => s + 1 / o.odds, 0);
  return offers.map((o) => ({
    ...o,
    stake: Math.round(((total * (1 / o.odds)) / implied) * 100) / 100,
    payout: Math.round(((total * (1 / o.odds)) / implied) * o.odds * 100) / 100,
  }));
}

function colLabel(sel: SelectionCompare["selection"]) {
  if (sel === "home") return "CASA";
  if (sel === "draw") return "X";
  return "FORA";
}

function CompareCard({
  row,
  calcOpen,
  onToggleCalc,
}: {
  row: OddsCompareRow;
  calcOpen: boolean;
  onToggleCalc: () => void;
}) {
  // Colunas e surebet usam só casas BR — Bolsa fica na linha de comparação
  const offers = row.selections.map(bookOffer);
  const sb = surebetReturn(offers);
  const edge = row.bestEdgeVsBack;
  const [bank, setBank] = useState(100);

  const splits = useMemo(() => {
    const valid = offers.filter((o): o is Offer => Boolean(o));
    if (valid.length < 3 || sb == null) return null;
    return stakeSplit(bank, valid);
  }, [offers, bank, sb]);

  const footerLabel =
    sb != null
      ? `${sb.toFixed(2).replace(".", ",")}% RETORNO CERTO`
      : edge != null && edge > 0
        ? `+${edge.toFixed(2)} EDGE VS BOLSA`
        : edge != null
          ? `${edge.toFixed(2)} VS BOLSA`
          : "SEM EDGE";

  const footerTone =
    sb != null ? "is-sure" : edge != null && edge > 0 ? "is-edge" : "is-flat";

  return (
    <article className={`oc-sure ${row.matched ? "is-matched" : ""}`}>
      <header className="oc-sure-head">
        <div className="oc-sure-path">
          <Goal className="oc-sure-ball" aria-hidden size={14} />
          <span>{competitionPath(row)}</span>
        </div>
        <time className="oc-sure-time" dateTime={row.start}>
          {formatKick(row.start)}
        </time>
      </header>

      <div className="oc-sure-body">
        <div className="oc-sure-teams">
          <strong>{row.home}</strong>
          <strong>{row.away}</strong>
          <em>Resultado Final</em>
        </div>

        <div className="oc-sure-odds">
          {row.selections.map((sel, i) => {
            const offer = offers[i];
            const bolsaBack = sel.bolsa.back;
            const bolsaLay = sel.bolsa.lay;
            const edgeBack = sel.edgeVsBack;
            return (
              <div key={sel.selection} className="oc-sure-col">
                <span className="oc-sure-col-label">{colLabel(sel.selection)}</span>
                <div className="oc-sure-odd-box">
                  {formatOdd(offer?.odds)}
                </div>
                <span className="oc-sure-bookie">
                  {offer?.source ?? "—"}
                </span>
                {(bolsaBack != null || bolsaLay != null) && (
                  <span className="oc-sure-more">
                    Bolsa {formatOdd(bolsaBack)}
                    {bolsaLay != null ? ` / ${formatOdd(bolsaLay)}` : ""}
                    {edgeBack != null
                      ? ` · ${edgeBack > 0 ? "+" : ""}${edgeBack.toFixed(2)}`
                      : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={`oc-sure-foot ${footerTone}`}>
        <div className="oc-sure-return">{footerLabel}</div>
        <button
          type="button"
          className="oc-sure-calc"
          onClick={onToggleCalc}
        >
          CALCULAR
          <Calculator size={14} aria-hidden />
        </button>
      </div>

      {calcOpen && (
        <div className="oc-sure-calc-panel">
          <label>
            Banca total (R$)
            <input
              type="number"
              min={1}
              step={1}
              value={bank}
              onChange={(e) => setBank(Number(e.target.value) || 0)}
            />
          </label>
          {splits ? (
            <ul>
              {splits.map((s) => (
                <li key={`${s.source}-${s.odds}`}>
                  <strong>{s.source}</strong>
                  <span>@{formatOdd(s.odds)}</span>
                  <span>R$ {s.stake.toFixed(2)}</span>
                  <em>→ {s.payout.toFixed(2)}</em>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Sem surebet nas 3 pontas. Use a melhor casa vs back/lay da Bolsa
              manualmente.
            </p>
          )}
          <a
            className="oc-sure-bolsa-link"
            href={row.mexchangeUrl}
            target="_blank"
            rel="noreferrer"
          >
            Abrir na Bolsa →
          </a>
        </div>
      )}
    </article>
  );
}

export function OddsComparePanel() {
  const [data, setData] = useState<OddsComparePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const onlyMatched = true;
  const [onlySure, setOnlySure] = useState(true);
  const [query, setQuery] = useState("");
  const [calcId, setCalcId] = useState<string | null>(null);
  const [extStatus, setExtStatus] = useState<{
    count: number;
    bet365: number;
    betnacional: number;
    updatedAt: number;
    extInstalled: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, extRes] = await Promise.all([
        fetch("/api/odds-compare?limit=40&regions=eu&sports=8"),
        fetch("/api/ext/odds", { credentials: "include" }),
      ]);
      const json = (await res.json()) as OddsComparePayload & { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);

      if (extRes.ok) {
        const extJson = (await extRes.json()) as {
          snapshot?: {
            count: number;
            updatedAt: number;
            byBookmaker?: { bet365?: unknown[]; betnacional?: unknown[] };
          };
        };
        const snap = extJson.snapshot;
        setExtStatus({
          count: snap?.count ?? 0,
          bet365: snap?.byBookmaker?.bet365?.length ?? 0,
          betnacional: snap?.byBookmaker?.betnacional?.length ?? 0,
          updatedAt: snap?.updatedAt ?? 0,
          extInstalled:
            typeof document !== "undefined" &&
            document.documentElement.dataset.tips3x3OddsExt === "1",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar comparação");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 45_000);
    return () => clearInterval(t);
  }, [load]);

  const rows = useMemo(() => {
    let list: OddsCompareRow[] = data?.rows ?? [];
    if (onlyMatched) list = list.filter((r) => r.matched);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.home.toLowerCase().includes(q) ||
          r.away.toLowerCase().includes(q) ||
          (r.competition ?? "").toLowerCase().includes(q),
      );
    }
    if (onlySure) {
      list = list.filter((r) => {
        const offers = r.selections.map(bookOffer);
        return surebetReturn(offers) != null;
      });
    }
    return [...list].sort((a, b) => {
      const sa = surebetReturn(a.selections.map(bookOffer)) ?? -1;
      const sbPct = surebetReturn(b.selections.map(bookOffer)) ?? -1;
      if (sbPct !== sa) return sbPct - sa;
      return (b.bestEdgeVsBack ?? -99) - (a.bestEdgeVsBack ?? -99);
    });
  }, [data, onlyMatched, onlySure, query]);

  return (
    <div className="oc-panel">
      <div className="oc-toolbar">
        <div className="oc-toolbar-text">
          <h3>Comparar odds</h3>
          <p>
            Só surebets 1X2 entre Bet365 e Betnacional (Odds-API.io): soma das
            3 pontas &lt; 1 = retorno certo. Bolsa fica só como referência.
          </p>
        </div>
        <div className="oc-toolbar-actions">
          <input
            className="oc-search"
            type="search"
            placeholder="Filtrar time…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className={`pill ${onlySure ? "active" : ""}`}
            onClick={() => setOnlySure((v) => !v)}
          >
            {onlySure ? "Só surebets" : "Todos matched"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "…" : "Atualizar"}
          </button>
        </div>
      </div>

      {data && (
        <div className="oc-meta">
          {data.provider && (
            <span>
              Fonte:{" "}
              <strong>
                {data.provider === "extension"
                  ? "Extensão (Bet365/Betnacional)"
                  : data.provider === "mixed"
                    ? "Extensão + API"
                    : data.provider === "odds-api.io"
                      ? "Odds-API.io (fallback)"
                      : "The Odds API"}
              </strong>
            </span>
          )}
          <span>
            Match: <strong>{data.matchedCount}</strong>
          </span>
          <span>
            Extensão:{" "}
            <strong>
              {extStatus
                ? `${Math.max(extStatus.count, data.extOddsCount ?? 0)} (365:${extStatus.bet365} · nac:${extStatus.betnacional})`
                : `${data.extOddsCount ?? 0}`}
            </strong>
            {extStatus?.extInstalled ? " · instalada" : " · não detectada"}
          </span>
          {data.bookmakers?.length > 0 && (
            <span title={data.bookmakers.join(", ")}>
              Casas: <strong>{data.bookmakers.join(" · ")}</strong>
            </span>
          )}
        </div>
      )}

      {!data?.configured && data?.message && (
        <div className="oc-setup banner-info">
          <strong>Odds-API.io · Bet365 + Betnacional</strong>
          <p>{data.message}</p>
          <p className="oc-setup-alt">
            Confirme no dashboard da Odds-API.io as 2 casas selecionadas:
            Bet365 e Betnacional (free = máx. 2).
          </p>
        </div>
      )}

      {error && <div className="banner-error">{error}</div>}
      {loading && !data && (
        <div className="empty-state">Carregando comparação…</div>
      )}

      {!loading && data?.configured && rows.length === 0 && (
        <div className="empty-state">
          <strong>Nenhuma surebet agora</strong>
          <p>
            Não há 1X2 entre Bet365/Betnacional com retorno certo. Clique em
            “Todos matched” para ver edges vs Bolsa, ou Atualizar em instantes.
          </p>
        </div>
      )}

      <div className="oc-list">
        {rows.map((row) => (
          <CompareCard
            key={row.eventId}
            row={row}
            calcOpen={calcId === row.eventId}
            onToggleCalc={() =>
              setCalcId((id) => (id === row.eventId ? null : row.eventId))
            }
          />
        ))}
      </div>
    </div>
  );
}
