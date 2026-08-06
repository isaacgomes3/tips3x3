"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Activity, ArrowLeft } from "lucide-react";
import { getSupabase, getSupabaseEnv, hasSupabaseConfig } from "@/lib/central/supabase";
import { recalcBankrolls, COMMISSION_RATE } from "@/lib/central/bankroll";
import TopCards from "@/components/central/TopCards";
import EntryForm from "@/components/central/EntryForm";
import EntriesHistory from "@/components/central/EntriesHistory";
import StakeManager from "@/components/central/StakeManager";
import TelegramSettings from "@/components/central/TelegramSettings";
import CreativesPanel from "@/components/central/CreativesPanel";
import TabNav from "@/components/central/TabNav";
import { CentralHub } from "@/components/central/CentralHub";
import { CalendarModal } from "@/components/central/CalendarModal";
import type { Entry, DayEvolution, TabKey } from "@/lib/central/types";

type Screen = "hub" | "module";

export function CentralGestao() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [initialBankroll, setInitialBankroll] = useState(800);
  const [stakePercentage, setStakePercentage] = useState(2);
  const [activeTab, setActiveTab] = useState<TabKey>("statistics");
  const [screen, setScreen] = useState<Screen>("hub");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  const resolvedEntries = entries.filter(
    (e) => e.result === "green" || e.result === "red",
  );
  const currentBankroll =
    resolvedEntries.length > 0
      ? resolvedEntries[resolvedEntries.length - 1].bankroll_after
      : initialBankroll;

  const loadData = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setBootError(
        "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (mesmo projeto do central3x3).",
      );
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

      if (settingsRes.data) {
        setInitialBankroll(Number(settingsRes.data.initial_bankroll));
        setStakePercentage(Number(settingsRes.data.stake_percentage));
        setSettingsId(settingsRes.data.id);
        setTelegramBotToken(settingsRes.data.telegram_bot_token || "");
        setTelegramChatId(settingsRes.data.telegram_chat_id || "");
      }

      if (entriesRes.data) {
        const initial = Number(settingsRes.data?.initial_bankroll ?? 800);
        setEntries(recalcBankrolls(entriesRes.data as Entry[], initial));
      }
      setBootError(null);
    } catch (err) {
      setBootError(
        err instanceof Error ? err.message : "Falha ao carregar a central no Supabase.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function telegramFetch(path: string, body: Record<string, unknown>) {
    const { url, anonKey } = getSupabaseEnv();
    const res = await fetch(`${url}/functions/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || `Falha em ${path}`);
    }
  }

  async function handleAddEntry(
    homeTeam: string,
    awayTeam: string,
    odd: number,
    stake: number,
  ) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("entries")
      .insert({
        home_team: homeTeam,
        away_team: awayTeam,
        odd,
        stake,
        result: "pending",
        profit: 0,
        bankroll_after: currentBankroll,
      })
      .select()
      .maybeSingle();

    if (!error && data) {
      setEntries((prev) => [...prev, data as Entry]);
      if (telegramBotToken && telegramChatId) {
        telegramFetch("telegram-notify", {
          type: "new",
          home_team: homeTeam,
          away_team: awayTeam,
          odd,
          stake,
        }).catch(() => {});
      }
    }
  }

  async function persistBankrolls(recalced: Entry[]) {
    const supabase = getSupabase();
    for (const e of recalced) {
      if (e.result === "green" || e.result === "red") {
        await supabase
          .from("entries")
          .update({ profit: e.profit, bankroll_after: e.bankroll_after })
          .eq("id", e.id);
      }
    }
  }

  async function handleResolveEntry(id: string, result: "green" | "red" | "cancelled") {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return;

    const updated = [...entries];
    updated[idx] = { ...updated[idx], result };
    const recalced = recalcBankrolls(updated, initialBankroll);
    setEntries(recalced);

    const supabase = getSupabase();
    await supabase.from("entries").update({ result }).eq("id", id);
    await persistBankrolls(recalced);

    if ((result === "green" || result === "red") && telegramBotToken && telegramChatId) {
      const resolved = recalced[idx];
      telegramFetch("telegram-notify", {
        type: "resolve",
        home_team: resolved.home_team,
        away_team: resolved.away_team,
        odd: resolved.odd,
        stake: resolved.stake,
        result,
        profit: resolved.profit,
        bankroll_after: resolved.bankroll_after,
      }).catch(() => {});
    }
  }

  async function handleCashoutEntry(id: string, cashoutOdd: number) {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return;

    const updated = [...entries];
    updated[idx] = { ...updated[idx], result: "green", cashout_odd: cashoutOdd };
    const recalced = recalcBankrolls(updated, initialBankroll);
    setEntries(recalced);

    const supabase = getSupabase();
    await supabase
      .from("entries")
      .update({ result: "green", cashout_odd: cashoutOdd })
      .eq("id", id);
    await persistBankrolls(recalced);

    if (telegramBotToken && telegramChatId) {
      const resolved = recalced[idx];
      telegramFetch("telegram-notify", {
        type: "resolve",
        home_team: resolved.home_team,
        away_team: resolved.away_team,
        odd: resolved.odd,
        stake: resolved.stake,
        result: "green",
        profit: resolved.profit,
        bankroll_after: resolved.bankroll_after,
        cashout_odd: cashoutOdd,
      }).catch(() => {});
    }
  }

  async function handleDeleteEntry(id: string) {
    const supabase = getSupabase();
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) return;

    const filtered = entries.filter((e) => e.id !== id);
    const recalced = recalcBankrolls(filtered, initialBankroll);
    setEntries(recalced);
    await persistBankrolls(recalced);
  }

  async function handleStakePercentageChange(value: number) {
    setStakePercentage(value);
    if (settingsId) {
      await getSupabase()
        .from("settings")
        .update({ stake_percentage: value, updated_at: new Date().toISOString() })
        .eq("id", settingsId);
    }
  }

  async function handleInitialBankrollChange(value: number) {
    setInitialBankroll(value);
    if (settingsId) {
      await getSupabase()
        .from("settings")
        .update({ initial_bankroll: value, updated_at: new Date().toISOString() })
        .eq("id", settingsId);
    }
    if (entries.length > 0) {
      const recalced = recalcBankrolls(entries, value);
      setEntries(recalced);
      await persistBankrolls(recalced);
    }
  }

  async function handleTelegramSave(botToken: string, chatId: string) {
    if (!settingsId) return;
    const { error } = await getSupabase()
      .from("settings")
      .update({
        telegram_bot_token: botToken,
        telegram_chat_id: chatId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settingsId);
    if (error) throw error;
    setTelegramBotToken(botToken);
    setTelegramChatId(chatId);
  }

  async function handleTestConnection() {
    await telegramFetch("telegram-notify", { type: "test" });
  }

  async function handleSendDailyReport(reportDate: string) {
    await telegramFetch("telegram-daily-report", { reportDate });
  }

  async function handleResendEntryNotification(entry: Entry) {
    const isPending = entry.result === "pending";
    const isCashout = entry.cashout_odd && entry.cashout_odd > 1;
    const body: Record<string, unknown> = isPending
      ? {
          type: "new",
          home_team: entry.home_team,
          away_team: entry.away_team,
          odd: entry.odd,
          stake: entry.stake,
        }
      : {
          type: "resolve",
          home_team: entry.home_team,
          away_team: entry.away_team,
          odd: entry.odd,
          stake: entry.stake,
          result: entry.result,
          profit: entry.profit,
          bankroll_after: entry.bankroll_after,
          ...(isCashout ? { cashout_odd: entry.cashout_odd } : {}),
        };
    await telegramFetch("telegram-notify", body);
  }

  async function handleSendCustomMessage(text: string) {
    await telegramFetch("telegram-notify", { type: "custom", text });
  }

  const todayPct = useMemo(() => {
    const now = new Date();
    const todays = resolvedEntries.filter((e) => {
      const d = new Date(e.created_at);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    });
    if (!todays.length) return 0;
    let profit = 0;
    for (const e of todays) {
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
    const base = currentBankroll - profit;
    return base > 0 ? (profit / base) * 100 : 0;
  }, [resolvedEntries, currentBankroll]);

  function openModule(tab: TabKey) {
    setActiveTab(tab);
    setScreen("module");
  }

  function computeEvolution(): DayEvolution[] {
    const resolved = entries.filter((e) => e.result === "green" || e.result === "red");
    if (resolved.length === 0) return [];

    const dayMap = new Map<string, Entry[]>();
    for (const entry of resolved) {
      const date = new Date(entry.created_at).toLocaleDateString("pt-BR");
      const existing = dayMap.get(date) || [];
      existing.push(entry);
      dayMap.set(date, existing);
    }

    const result: DayEvolution[] = [];
    let dayNum = 1;
    let prevEnd = initialBankroll;

    for (const [date, dayEntries] of dayMap) {
      const start = prevEnd;
      const end = dayEntries[dayEntries.length - 1].bankroll_after;
      const profit = end - start;
      const percentage = start > 0 ? (profit / start) * 100 : 0;
      result.push({ day: dayNum, date, start, end, profit, percentage });
      prevEnd = end;
      dayNum++;
    }

    return result;
  }

  if (loading) {
    return (
      <div className="central-gestao central-gestao-state">
        <Activity className="w-5 h-5 animate-pulse text-gold-400" />
        <span>Carregando central de gestão…</span>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="central-gestao">
        <div className="banner-warn">
          <strong>Central indisponível.</strong> {bootError}
        </div>
        <p className="central-hint">
          Use as mesmas credenciais do projeto{" "}
          <a
            href="https://github.com/isaacgomes3/central3x3"
            target="_blank"
            rel="noreferrer"
          >
            central3x3
          </a>{" "}
          (tabelas <code>entries</code> e <code>settings</code>).
        </p>
      </div>
    );
  }

  return (
    <div className="central-gestao">
      {screen === "hub" ? (
        <CentralHub
          todayPct={todayPct}
          onSync={() => {
            setLoading(true);
            void loadData();
          }}
          onOpenCalendar={() => setCalendarOpen(true)}
          onOpenModule={openModule}
        />
      ) : (
        <div className="space-y-6">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setScreen("hub")}
          >
            <ArrowLeft className="inline w-4 h-4 mr-1" />
            Voltar ao painel
          </button>

          <div className="central-intro">
            <img
              src="/central/Gemini_Generated_Image_esfy2mesfy2mesfy_(1).png"
              alt="CASH 3x3"
              className="central-logo"
            />
            <div>
              <h2 className="central-title">CASH 3x3 · Gestão</h2>
              <p className="central-sub">Banca, entradas, stake, criativos e Telegram</p>
            </div>
          </div>

          <TopCards
            initialBankroll={initialBankroll}
            currentBankroll={currentBankroll}
            onInitialBankrollChange={handleInitialBankrollChange}
          />

          <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === "statistics" && (
            <div className="space-y-6 fade-in">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setCalendarOpen(true)}
              >
                Abrir calendário
              </button>
            </div>
          )}

          {activeTab === "entries" && (
            <div className="space-y-6 fade-in">
              <EntryForm
                currentBankroll={currentBankroll}
                stakePercentage={stakePercentage}
                onAddEntry={handleAddEntry}
              />
              <EntriesHistory
                entries={entries}
                onResolve={handleResolveEntry}
                onCashout={handleCashoutEntry}
                onDelete={handleDeleteEntry}
              />
            </div>
          )}

          {activeTab === "stake" && (
            <StakeManager
              currentBankroll={currentBankroll}
              stakePercentage={stakePercentage}
              onStakePercentageChange={handleStakePercentageChange}
            />
          )}

          {activeTab === "criativos" && (
            <CreativesPanel
              entries={entries}
              evolution={computeEvolution()}
              initialBankroll={initialBankroll}
              currentBankroll={currentBankroll}
            />
          )}

          {activeTab === "telegram" && (
            <TelegramSettings
              botToken={telegramBotToken}
              chatId={telegramChatId}
              entries={entries}
              onSave={handleTelegramSave}
              onTestConnection={handleTestConnection}
              onSendReport={handleSendDailyReport}
              onResendEntry={handleResendEntryNotification}
              onSendCustomMessage={handleSendCustomMessage}
            />
          )}
        </div>
      )}

      <CalendarModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        entries={entries}
        initialBankroll={initialBankroll}
        onSelectDay={() => {
          setCalendarOpen(false);
          openModule("entries");
        }}
      />
    </div>
  );
}
