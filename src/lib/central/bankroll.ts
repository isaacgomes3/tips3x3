import type { Entry } from "@/lib/central/types";

export const COMMISSION_RATE = 0.065;

export function recalcBankrolls(
  entries: Entry[],
  initialBankroll: number,
): Entry[] {
  let running = initialBankroll;
  return entries.map((e) => {
    if (e.result === "pending" || e.result === "cancelled") {
      return { ...e, profit: 0, bankroll_after: running };
    }
    let profit: number;
    if (e.cashout_odd && e.cashout_odd > 1) {
      profit = e.stake * (1 / (e.odd - 1) - 1 / (e.cashout_odd - 1));
    } else {
      profit = e.result === "green" ? e.stake / (e.odd - 1) : -e.stake;
    }
    if (profit > 0) {
      profit = profit * (1 - COMMISSION_RATE);
    }
    running += profit;
    return { ...e, profit, bankroll_after: running };
  });
}
