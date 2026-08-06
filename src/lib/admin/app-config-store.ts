/**
 * Defaults de operação definidos pelo master.
 * O painel usa estes valores quando o usuário ainda não escolheu os seus.
 */

import fs from "fs";
import path from "path";

export type AppConfig = {
  /** Alvo de lucro em pontos % (0,5 = 0,5%). */
  targetProfitPct: number;
  /** % da banca no Lay 3x3. */
  lay3x3StakePct: number;
  /** % da banca em Eventos raros (hold). Legado — ver eventosRarosStakeFixed. */
  eventosRarosStakePct: number;
  /** Stake fixa Eventos raros (responsabilidade R$) — igual ao Lucro certo. */
  eventosRarosStakeFixed: number;
  /** % da banca Lay Over 3.5 (lay→back). */
  overStakePct: number;
  /** % da banca Lay Over 4.5 — filtro independente do Over 3.5. */
  over45StakePct: number;
  /** % da banca Lay QOV zebra — filtro independente do Lay 3x3. */
  qovStakePct: number;
  lay3x3Enabled: boolean;
  eventosRarosEnabled: boolean;
  over35Enabled: boolean;
  over45Enabled: boolean;
  layOverLimitPressureEnabled?: boolean;
  qovEnabled?: boolean;
  /** Master liga/desliga o filtro Lucro certo globalmente (some com a faixa de crédito). */
  lucroCertoEnabled?: boolean;
  /** % do lucro líquido (já descontada a comissão da bolsa) que fica para a tips3x3. */
  walletFeePct: number;
  /** % de comissão da bolsa/exchange sobre o lucro bruto, descontada antes da taxa da tips3x3. */
  walletExchangeCommissionPct: number;
  /** Depósito mínimo de crédito (BRL). */
  walletMinDeposit: number;
  /** Cobra taxa nas operações Lucro certo. */
  walletChargeLucroCerto: boolean;
  /** Sem crédito, o cliente para de receber sinais. */
  walletBlockWhenEmpty: boolean;
  updatedAt: string;
  updatedBy: string;
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  targetProfitPct: 0.5,
  lay3x3StakePct: 20,
  eventosRarosStakePct: 99,
  eventosRarosStakeFixed: 500,
  overStakePct: 10,
  over45StakePct: 10,
  qovStakePct: 20,
  lay3x3Enabled: true,
  eventosRarosEnabled: false,
  over35Enabled: true,
  over45Enabled: true,
  layOverLimitPressureEnabled: true,
  qovEnabled: true,
  lucroCertoEnabled: true,
  walletFeePct: 50,
  walletExchangeCommissionPct: 2.5,
  walletMinDeposit: 10,
  walletChargeLucroCerto: true,
  // Fica desligado até o master avisar os clientes — evita pausar todo mundo.
  walletBlockWhenEmpty: false,
  updatedAt: new Date(0).toISOString(),
  updatedBy: "",
};

function resolveStorePath() {
  if (process.env.APP_CONFIG_PATH) return process.env.APP_CONFIG_PATH;
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "app-config.json",
  );
}

function clampPct(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

function normalize(raw: Partial<AppConfig> | null): AppConfig {
  if (!raw) return { ...DEFAULT_APP_CONFIG };
  return {
    targetProfitPct: clampPct(
      raw.targetProfitPct,
      DEFAULT_APP_CONFIG.targetProfitPct,
      0.1,
      100,
    ),
    lay3x3StakePct: clampPct(
      raw.lay3x3StakePct,
      DEFAULT_APP_CONFIG.lay3x3StakePct,
      1,
      100,
    ),
    eventosRarosStakePct: clampPct(
      raw.eventosRarosStakePct,
      DEFAULT_APP_CONFIG.eventosRarosStakePct,
      1,
      100,
    ),
    eventosRarosStakeFixed: clampPct(
      raw.eventosRarosStakeFixed,
      DEFAULT_APP_CONFIG.eventosRarosStakeFixed,
      1,
      1_000_000,
    ),
    overStakePct: clampPct(
      raw.overStakePct,
      DEFAULT_APP_CONFIG.overStakePct,
      1,
      100,
    ),
    over45StakePct: clampPct(
      raw.over45StakePct,
      DEFAULT_APP_CONFIG.over45StakePct,
      1,
      100,
    ),
    qovStakePct: clampPct(
      raw.qovStakePct,
      DEFAULT_APP_CONFIG.qovStakePct,
      1,
      100,
    ),
    lay3x3Enabled: raw.lay3x3Enabled !== false,
    eventosRarosEnabled: Boolean(raw.eventosRarosEnabled),
    over35Enabled: raw.over35Enabled !== false,
    over45Enabled: raw.over45Enabled !== false,
    layOverLimitPressureEnabled: raw.layOverLimitPressureEnabled !== false,
    qovEnabled: raw.qovEnabled !== false,
    lucroCertoEnabled: raw.lucroCertoEnabled !== false,
    walletFeePct: clampPct(
      raw.walletFeePct,
      DEFAULT_APP_CONFIG.walletFeePct,
      0,
      100,
    ),
    walletExchangeCommissionPct: clampPct(
      raw.walletExchangeCommissionPct,
      DEFAULT_APP_CONFIG.walletExchangeCommissionPct,
      0,
      100,
    ),
    walletMinDeposit: clampPct(
      raw.walletMinDeposit,
      DEFAULT_APP_CONFIG.walletMinDeposit,
      1,
      100_000,
    ),
    walletChargeLucroCerto: raw.walletChargeLucroCerto !== false,
    walletBlockWhenEmpty: raw.walletBlockWhenEmpty === true,
    updatedAt: raw.updatedAt || DEFAULT_APP_CONFIG.updatedAt,
    updatedBy: raw.updatedBy || "",
  };
}

export function getAppConfig(): AppConfig {
  const STORE_PATH = resolveStorePath();
  try {
    if (!fs.existsSync(STORE_PATH)) return { ...DEFAULT_APP_CONFIG };
    const raw = JSON.parse(
      fs.readFileSync(STORE_PATH, "utf8"),
    ) as Partial<AppConfig>;
    return normalize(raw);
  } catch (err) {
    console.error("[app-config-store] read failed", resolveStorePath(), err);
    return { ...DEFAULT_APP_CONFIG };
  }
}

export function saveAppConfig(
  input: Partial<AppConfig>,
  updatedBy: string,
): { ok: true; config: AppConfig } | { ok: false; error: string } {
  const merged = normalize({ ...getAppConfig(), ...input });
  const config: AppConfig = {
    ...merged,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || "",
  };

  const STORE_PATH = resolveStorePath();
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    const tmp = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), "utf8");
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    console.error("[app-config-store] write failed", err);
    return { ok: false, error: "Falha ao gravar configurações." };
  }
  return { ok: true, config };
}
