"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { recalcBankrolls, COMMISSION_RATE } from "@/lib/central/bankroll";
import { getSupabase, hasSupabaseConfig } from "@/lib/central/supabase";
import type { Entry } from "@/lib/central/types";

const STAKE_LAY3X3_KEY = "tips3x3-stake-lay3x3-pct";
const STAKE_OVER_KEY = "tips3x3-stake-over-pct";
const DAILY_META_KEY = "tips3x3-daily-meta-pct";

export const DEFAULT_LAY3X3_STAKE_PCT = 20;
export const DEFAULT_OVER_STAKE_PCT = 5;
export const DEFAULT_DAILY_META_PCT = 5;

function readPct(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
  } catch {
    return fallback;
  }
}

function writePct(key: string, value: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function dayProfit(entries: Entry[]) {
  let profit = 0;
  for (const e of entries) {
    if (e.cashout_odd && e.cashout_odd > 1) {
      let p = e.stake * (1 / (e.odd - 1) - 1 / (e.cashout_odd - 1));
      if (p > 0) p *= 1 - COMMISSION_RATE;
      profit += p;
    } else if (e.result === "green") {
      profit += (e.stake / (e.odd - 1)) * (1 - COMMISSION_RATE);
    } else if (e.result === "red") {
      profit -= e.stake;
    }
  }
  return profit;
}

export function useBankrollData() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [initialBankroll, setInitialBankroll] = useState(1000);
  const [stakePercentage, setStakePercentage] = useState(2);
  const [lay3x3StakePct, setLay3x3StakePct] = useState(DEFAULT_LAY3X3_STAKE_PCT);
  const [overStakePct, setOverStakePct] = useState(DEFAULT_OVER_STAKE_PCT);
  const [dailyMetaPct, setDailyMetaPct] = useState(DEFAULT_DAILY_META_PCT);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLay3x3StakePct(readPct(STAKE_LAY3X3_KEY, DEFAULT_LAY3X3_STAKE_PCT));
    setOverStakePct(readPct(STAKE_OVER_KEY, DEFAULT_OVER_STAKE_PCT));
    setDailyMetaPct(readPct(DAILY_META_KEY, DEFAULT_DAILY_META_PCT));
  }, []);

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setConfigured(false);
      setLoading(false);
      return;
    }
    try {
      const supabase = getSupabase();
      const [settingsRes, entriesRes] = await Promise.all([
        supabase.from("settings").select("*").limit(1).maybeSingle(),
        supabase.from("entries").select("*").order("created_at", { ascending: true }),
      ]);
      if (settingsRes.error) throw settingsRes.error;
      if (entriesRes.error) throw entriesRes.error;

      const initial = Number(settingsRes.data?.initial_bankroll ?? 1000);
      if (settingsRes.data) {
        setInitialBankroll(initial);
        setStakePercentage(Number(settingsRes.data.stake_percentage ?? 2));
      }
      if (entriesRes.data) {
        setEntries(recalcBankrolls(entriesRes.data as Entry[], initial));
      }
      setConfigured(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar banca");
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolved = useMemo(
    () => entries.filter((e) => e.result === "green" || e.result === "red"),
    [entries],
  );

  const currentBankroll = useMemo(() => {
    if (resolved.length > 0) return resolved[resolved.length - 1].bankroll_after;
    return initialBankroll;
  }, [resolved, initialBankroll]);

  const todayEntries = useMemo(
    () => resolved.filter((e) => isToday(e.created_at)),
    [resolved],
  );

  const pendingEntries = useMemo(
    () => entries.filter((e) => e.result === "pending"),
    [entries],
  );

  const todayProfit = useMemo(() => dayProfit(todayEntries), [todayEntries]);

  const todayRoiPct = useMemo(() => {
    const base = currentBankroll - todayProfit;
    return base > 0 ? (todayProfit / base) * 100 : 0;
  }, [currentBankroll, todayProfit]);

  const todayBankrollChangePct = useMemo(() => {
    const start =
      todayEntries.length > 0
        ? todayEntries[0].bankroll_after - todayEntries[0].profit
        : currentBankroll - todayProfit;
    return start > 0 ? (todayProfit / start) * 100 : 0;
  }, [todayEntries, currentBankroll, todayProfit]);

  const winRate = useMemo(() => {
    if (!resolved.length) return { pct: 0, wins: 0, total: 0 };
    const wins = resolved.filter((e) => e.result === "green").length;
    return { pct: (wins / resolved.length) * 100, wins, total: resolved.length };
  }, [resolved]);

  const stats = useMemo(() => {
    const profits = resolved.map((e) => e.profit);
    const maxGreen = profits.length ? Math.max(...profits.filter((p) => p > 0), 0) : 0;
    const maxRed = profits.length ? Math.min(...profits.filter((p) => p < 0), 0) : 0;

    let streak = 0;
    for (let i = resolved.length - 1; i >= 0; i--) {
      if (resolved[i].result === "green") streak++;
      else break;
    }

    const dayMap = new Map<string, number>();
    for (const e of resolved) {
      const key = new Date(e.created_at).toLocaleDateString("pt-BR");
      dayMap.set(key, (dayMap.get(key) ?? 0) + e.profit);
    }
    const positiveDays = [...dayMap.values()].filter((p) => p > 0).length;
    const positiveDayPct = dayMap.size > 0 ? (positiveDays / dayMap.size) * 100 : 0;

    return {
      maxGreen,
      maxRed,
      streak,
      operations: resolved.length,
      positiveDayPct,
      todayOps: todayEntries.length,
      pending: pendingEntries.length,
    };
  }, [resolved, todayEntries, pendingEntries]);

  const evolution = useMemo(() => {
    const points: number[] = [initialBankroll];
    for (const e of resolved) {
      points.push(e.bankroll_after);
    }
    if (points.length < 6) {
      const last = points[points.length - 1] ?? initialBankroll;
      while (points.length < 6) points.push(last);
    }
    return points.slice(-6);
  }, [resolved, initialBankroll]);

  const committed = useMemo(() => {
    const lay3x3 = currentBankroll * (lay3x3StakePct / 100);
    const over = currentBankroll * (overStakePct / 100);
    const pendingStake = pendingEntries.reduce((s, e) => s + e.stake, 0);
    const allocated = lay3x3 + over + pendingStake;
    const available = Math.max(0, currentBankroll - allocated);
    return { lay3x3, over, pendingStake, allocated, available };
  }, [currentBankroll, lay3x3StakePct, overStakePct, pendingEntries]);

  const riskTier = useMemo((): "baixo" | "moderado" | "alto" => {
    const open = pendingEntries.length;
    if (open >= 4) return "alto";
    if (open >= 2) return "moderado";
    return "baixo";
  }, [pendingEntries]);

  const updateLay3x3StakePct = useCallback((pct: number) => {
    setLay3x3StakePct(pct);
    writePct(STAKE_LAY3X3_KEY, pct);
  }, []);

  const updateOverStakePct = useCallback((pct: number) => {
    setOverStakePct(pct);
    writePct(STAKE_OVER_KEY, pct);
  }, []);

  return {
    loading,
    configured,
    error,
    entries,
    initialBankroll,
    currentBankroll,
    stakePercentage,
    lay3x3StakePct,
    overStakePct,
    dailyMetaPct,
    todayProfit,
    todayRoiPct,
    todayBankrollChangePct,
    winRate,
    stats,
    evolution,
    committed,
    riskTier,
    pendingEntries,
    reload: load,
    updateLay3x3StakePct,
    updateOverStakePct,
  };
}
