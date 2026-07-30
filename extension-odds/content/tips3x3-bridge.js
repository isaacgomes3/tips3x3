/* global chrome */
(function () {
  "use strict";

  try {
    document.documentElement.dataset.tips3x3OddsExt = "1";
    window.postMessage({ source: "tips3x3-odds-ext", type: "READY" }, "*");
  } catch {
    /* ignore */
  }

  const base = location.origin;
  chrome.storage.sync.get({ apiBase: "" }, (data) => {
    if (!data.apiBase || data.apiBase !== base) {
      chrome.storage.sync.set({ apiBase: base });
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "TIPS3X3_PANEL_FETCH") return false;

    void (async () => {
      try {
        const path = String(msg.path || "");
        if (!path.startsWith("/api/")) {
          sendResponse({ ok: false, error: "path inválido" });
          return;
        }
        const res = await fetch(path, {
          method: msg.method || "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
            ...(msg.body ? { "Content-Type": "application/json" } : {}),
          },
          body: msg.body ? JSON.stringify(msg.body) : undefined,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          sendResponse({
            ok: false,
            error: json.error || `HTTP ${res.status}`,
            status: res.status,
          });
          return;
        }
        sendResponse({ ok: true, data: json, status: res.status });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return true;
  });

  async function ping() {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      chrome.runtime.sendMessage({
        type: "TIPS3X3_PANEL_ALIVE",
        apiBase: base,
      });
    } catch {
      /* ignore */
    }
  }

  ping();
  setInterval(ping, 60_000);
})();
