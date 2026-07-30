import {
  fetchSnapshot,
  fetchTargets,
  getSettings,
  pushOdds,
  resolveSessionToken,
} from "./lib/api.js";

const ALARM = "tips3x3-odds-poll";

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void refreshBadge();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "TIPS3X3_PANEL_ALIVE") {
    void (async () => {
      if (msg.apiBase) {
        await chrome.storage.sync.set({ apiBase: String(msg.apiBase) });
      }
      await chrome.storage.local.set({ panelAliveAt: Date.now(), lastError: "" });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg?.type === "TIPS3X3_PUSH_ODDS") {
    void (async () => {
      try {
        const settings = await getSettings();
        if (!settings.enabled) {
          sendResponse({ ok: false, error: "Extensão desligada nas opções" });
          return;
        }
        const result = await pushOdds(msg.bookmaker, msg.events || []);
        await chrome.storage.local.set({
          lastPushAt: Date.now(),
          lastPushBookmaker: msg.bookmaker,
          lastPushCount: result.upserted ?? 0,
          lastServerTotal: result.total ?? 0,
          lastError: "",
        });
        await refreshBadge();
        sendResponse({ ok: true, result });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        await chrome.storage.local.set({ lastError: error });
        await refreshBadge();
        sendResponse({ ok: false, error });
      }
    })();
    return true;
  }

  if (msg?.type === "TIPS3X3_GET_TARGETS") {
    void (async () => {
      try {
        const data = await fetchTargets();
        sendResponse({
          ok: true,
          targets: data.targets || [],
          snapshot: data.snapshot,
        });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        await chrome.storage.local.set({ lastError: error });
        sendResponse({ ok: false, error, targets: [] });
      }
    })();
    return true;
  }

  if (msg?.type === "TIPS3X3_CAPTURE_TABS") {
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({});
        const targets = tabs.filter((t) => {
          const u = t.url || "";
          return /bet365\.(bet\.br|com\.br|com)/i.test(u) || /betnacional/i.test(u);
        });
        if (!targets.length) {
          sendResponse({
            ok: false,
            error:
              "Nenhuma aba Bet365/Betnacional aberta. Abra o futebol nessas casas e tente de novo.",
          });
          return;
        }
        const results = [];
        for (const tab of targets) {
          if (tab.id == null) continue;
          try {
            const r = await chrome.tabs.sendMessage(tab.id, {
              type: "TIPS3X3_FORCE_SCRAPE",
            });
            results.push({
              id: tab.id,
              url: tab.url,
              ok: Boolean(r?.ok),
              found: r?.found ?? 0,
              error: r?.error,
              bookmaker: r?.bookmaker,
            });
          } catch {
            results.push({
              id: tab.id,
              url: tab.url,
              ok: false,
              found: 0,
              error: "Recarregue a aba da casa (F5) e tente de novo",
            });
          }
        }
        const found = results.reduce((s, r) => s + (r.found || 0), 0);
        // lê total no servidor
        let server = 0;
        try {
          const snap = await fetchSnapshot();
          server = snap.events?.length ?? snap.snapshot?.count ?? 0;
          await chrome.storage.local.set({
            lastServerTotal: server,
            lastError: found ? "" : "Abas abertas, mas 0 odds lidas do DOM",
          });
        } catch {
          /* ignore */
        }
        sendResponse({ ok: true, found, server, results });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return true;
  }

  if (msg?.type === "TIPS3X3_TEST") {
    void (async () => {
      try {
        const data = await fetchSnapshot();
        const count = data.events?.length ?? data.snapshot?.count ?? 0;
        await chrome.storage.local.set({
          lastError: "",
          lastServerTotal: count,
          panelAliveAt: Date.now(),
        });
        await refreshBadge();
        sendResponse({
          ok: true,
          snapshot: data.snapshot,
          count,
        });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        await chrome.storage.local.set({ lastError: error });
        await refreshBadge();
        sendResponse({ ok: false, error });
      }
    })();
    return true;
  }

  if (msg?.type === "TIPS3X3_STATUS") {
    void (async () => {
      const settings = await getSettings();
      const auth = await resolveSessionToken();
      const local = await chrome.storage.local.get([
        "lastPushAt",
        "lastPushBookmaker",
        "lastPushCount",
        "lastServerTotal",
        "lastError",
        "panelAliveAt",
      ]);
      sendResponse({
        ok: true,
        enabled: settings.enabled,
        apiBase: settings.apiBase,
        hasSession: Boolean(auth.token),
        ...local,
      });
    })();
    return true;
  }

  return false;
});

async function refreshBadge() {
  const local = await chrome.storage.local.get(["lastError", "lastPushCount"]);
  if (local.lastError) {
    await chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
    await chrome.action.setBadgeText({ text: "!" });
    return;
  }
  const n = Number(local.lastPushCount) || 0;
  await chrome.action.setBadgeBackgroundColor({ color: "#1fbf6b" });
  await chrome.action.setBadgeText({ text: n > 0 ? String(Math.min(n, 99)) : "" });
}

void refreshBadge();
