"use client";

/**
 * Defaults definidos pelo master em /admin.
 * Só preenchem chaves que o usuário ainda não escolheu — preferência local vence.
 * seed-v2: reapply uma vez as estratégias do admin (usuários travados no default
 * antigo Eventos raros OFF enquanto o admin já tinha ligado).
 * seed-v3: aplica Over 3.5 / 4.5 do admin.
 */

type ServerConfig = {
  targetProfitPct: number;
  lay3x3StakePct: number;
  eventosRarosStakePct: number;
  eventosRarosStakeFixed?: number;
  overStakePct?: number;
  over45StakePct?: number;
  qovStakePct?: number;
  lay3x3Enabled: boolean;
  eventosRarosEnabled: boolean;
  over35Enabled?: boolean;
  over45Enabled?: boolean;
};

const KEYS = {
  profit: "tips3x3-target-profit-pct-v2",
  lay3x3Stake: "tips3x3-stake-lay3x3-pct",
  eventosRarosStakeFixed: "tips3x3-stake-eventos-raros-fixed",
  overStake: "tips3x3-stake-over-pct",
  over45Stake: "tips3x3-stake-over45-pct",
  qovStake: "tips3x3-stake-qov-pct",
  lay3x3Strategy: "tips3x3-strategy-lay-3x3",
  eventosRarosStrategy: "tips3x3-strategy-eventos-raros",
  lucroCertoStrategy: "tips3x3-strategy-lucro-certo",
  over35Strategy: "tips3x3-strategy-over-35",
  over45Strategy: "tips3x3-strategy-over-45",
  seedVersion: "tips3x3-defaults-seed-v2",
  seedOverVersion: "tips3x3-defaults-seed-over-v1",
  seedLucroCertoVersion: "tips3x3-defaults-seed-lucro-certo-v1",
} as const;

function setIfUnset(key: string, value: string): boolean {
  try {
    if (window.localStorage.getItem(key) != null) return false;
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Retorna true se algum default foi aplicado agora. */
export async function seedDefaultsFromServer(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch("/api/admin/config");
    if (!res.ok) return false;
    const json = (await res.json()) as { config?: ServerConfig };
    const config = json.config;
    if (!config) return false;

    let applied = [
      setIfUnset(KEYS.profit, String(config.targetProfitPct)),
      setIfUnset(KEYS.lay3x3Stake, String(config.lay3x3StakePct)),
      setIfUnset(
        KEYS.eventosRarosStakeFixed,
        String(config.eventosRarosStakeFixed ?? 500),
      ),
      setIfUnset(KEYS.overStake, String(config.overStakePct ?? 10)),
      setIfUnset(KEYS.over45Stake, String(config.over45StakePct ?? 10)),
      setIfUnset(KEYS.qovStake, String(config.qovStakePct ?? 20)),
      setIfUnset(KEYS.lay3x3Strategy, config.lay3x3Enabled ? "1" : "0"),
      setIfUnset(
        KEYS.eventosRarosStrategy,
        config.eventosRarosEnabled ? "1" : "0",
      ),
      setIfUnset(
        KEYS.over35Strategy,
        config.over35Enabled !== false ? "1" : "0",
      ),
      setIfUnset(
        KEYS.over45Strategy,
        config.over45Enabled !== false ? "1" : "0",
      ),
    ].some(Boolean);

    // Migração única: quem ficou com Eventos raros OFF pelo default antigo
    // herda o valor atual do admin (uma vez). Também limpa marcas de
    // "já enviei" da sessão — o bug antigo marcava enviado sem a fila OK.
    try {
      if (window.localStorage.getItem(KEYS.seedVersion) !== "1") {
        window.localStorage.setItem(
          KEYS.eventosRarosStrategy,
          config.eventosRarosEnabled ? "1" : "0",
        );
        window.localStorage.setItem(
          KEYS.lay3x3Strategy,
          config.lay3x3Enabled ? "1" : "0",
        );
        window.localStorage.setItem(KEYS.seedVersion, "1");
        const prefix = "tips3x3-ext-entry:";
        for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
          const k = window.sessionStorage.key(i);
          if (k?.startsWith(prefix)) window.sessionStorage.removeItem(k);
        }
        applied = true;
      }
    } catch {
      /* ignore */
    }

    try {
      if (window.localStorage.getItem(KEYS.seedOverVersion) !== "1") {
        window.localStorage.setItem(
          KEYS.over35Strategy,
          config.over35Enabled !== false ? "1" : "0",
        );
        window.localStorage.setItem(
          KEYS.over45Strategy,
          config.over45Enabled !== false ? "1" : "0",
        );
        if (config.overStakePct != null) {
          window.localStorage.setItem(
            KEYS.overStake,
            String(config.overStakePct),
          );
        }
        window.localStorage.setItem(KEYS.seedOverVersion, "1");
        applied = true;
      }
    } catch {
      /* ignore */
    }

    // Lucro certo separado: default ON na 1ª vez (independente de Eventos raros).
    try {
      if (window.localStorage.getItem(KEYS.seedLucroCertoVersion) !== "1") {
        setIfUnset(KEYS.lucroCertoStrategy, "1");
        window.localStorage.setItem(KEYS.seedLucroCertoVersion, "1");
        applied = true;
      }
    } catch {
      /* ignore */
    }

    return applied;
  } catch {
    return false;
  }
}
