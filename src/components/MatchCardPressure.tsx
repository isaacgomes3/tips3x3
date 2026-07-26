"use client";

import { useEffect, useRef, useState } from "react";
import { PressureSparkline } from "@/components/PressureSparkline";
import type { SofaGraphPoint } from "@/lib/sofascore/types";

type CacheEntry = {
  at: number;
  points: SofaGraphPoint[] | null;
};

const CACHE_TTL_MS = 50_000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<SofaGraphPoint[] | null>>();

function cacheKey(home: string, away: string, start?: string) {
  return `${home}|${away}|${start ?? ""}`.toLowerCase();
}

async function fetchPressurePoints(
  home: string,
  away: string,
  start?: string,
): Promise<SofaGraphPoint[] | null> {
  const key = cacheKey(home, away, start);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.points;

  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async () => {
    try {
      const qs = new URLSearchParams({ home, away });
      if (start) qs.set("start", start);
      const res = await fetch(`/api/match-intel?${qs}`);
      const json = (await res.json()) as
        | { found: true; intel: { pressure: { points: SofaGraphPoint[] } } }
        | { found: false }
        | { error: string };
      const points =
        "found" in json && json.found ? json.intel.pressure.points : null;
      // Falhas / sem dados: TTL curto para não “travar” o sparkline
      const ttl = points && points.length > 0 ? CACHE_TTL_MS : 12_000;
      cache.set(key, { at: Date.now() - (CACHE_TTL_MS - ttl), points });
      return points;
    } catch {
      cache.set(key, { at: Date.now() - (CACHE_TTL_MS - 8_000), points: null });
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

/**
 * Sparkline de pressão no card — carrega sob demanda quando visível (só live).
 */
export function MatchCardPressure({
  home,
  away,
  start,
  enabled,
}: {
  home: string;
  away: string;
  start?: string;
  enabled: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [points, setPoints] = useState<SofaGraphPoint[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    // Carrega imediatamente; IO só reforça se o card entrar na viewport
    setVisible(true);
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "160px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !visible) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const next = await fetchPressurePoints(home, away, start);
      if (!cancelled) {
        setPoints(next);
        setLoading(false);
      }
    };

    void load();
    const id = window.setInterval(load, CACHE_TTL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, visible, home, away, start]);

  if (!enabled) {
    return <div className="match-card-pressure is-empty" aria-hidden />;
  }

  return (
    <div ref={ref} className="match-card-pressure" aria-hidden={!points?.length}>
      {points && points.length > 0 ? (
        <PressureSparkline points={points} compact />
      ) : (
        <div className={`pressure-placeholder ${loading ? "is-loading" : ""}`} />
      )}
    </div>
  );
}
