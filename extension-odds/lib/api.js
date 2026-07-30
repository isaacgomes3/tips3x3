const DEFAULT_API = "https://tips3x3.com";

export async function getSettings() {
  const data = await chrome.storage.sync.get({
    apiBase: DEFAULT_API,
    sessionToken: "",
    enabled: true,
  });
  return {
    apiBase: String(data.apiBase || DEFAULT_API).replace(/\/$/, ""),
    sessionToken: String(data.sessionToken || ""),
    enabled: data.enabled !== false,
  };
}

export async function resolveSessionToken() {
  const { apiBase, sessionToken } = await getSettings();
  if (sessionToken) return { apiBase, token: sessionToken };

  try {
    const all = await chrome.cookies.getAll({ name: "tips3x3_session" });
    const hit =
      all.find((c) => /tips3x3\.com$/i.test(c.domain.replace(/^\./, ""))) ||
      all.find((c) => /localhost|127\.0\.0\.1/i.test(c.domain)) ||
      all[0];
    if (hit?.value) return { apiBase, token: hit.value };
  } catch {
    /* ignore */
  }

  const origins = [
    apiBase,
    "https://tips3x3.com",
    "https://www.tips3x3.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];
  for (const url of [...new Set(origins)]) {
    try {
      const cookie = await chrome.cookies.get({
        url,
        name: "tips3x3_session",
      });
      if (cookie?.value) return { apiBase, token: cookie.value };
    } catch {
      /* ignore */
    }
  }
  return { apiBase, token: "" };
}

async function findPanelTab() {
  const { apiBase } = await getSettings();
  const patterns = [
    `${apiBase}/*`,
    "https://tips3x3.com/*",
    "https://www.tips3x3.com/*",
    "http://localhost:3000/*",
    "http://127.0.0.1:3000/*",
  ];
  for (const url of [...new Set(patterns)]) {
    try {
      const tabs = await chrome.tabs.query({ url });
      const tab = tabs.find((t) => t.id != null && /\/(app|login)?/.test(t.url || ""));
      if (tab?.id != null) return tab;
      if (tabs[0]?.id != null) return tabs[0];
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Preferência: fetch via aba do painel (cookie HttpOnly funciona). */
export async function panelFetch(path, opts = {}) {
  const tab = await findPanelTab();
  if (!tab?.id) {
    throw new Error(
      "Abra https://tips3x3.com/app logado e tente de novo (a extensão usa essa aba).",
    );
  }

  let res;
  try {
    res = await chrome.tabs.sendMessage(tab.id, {
      type: "TIPS3X3_PANEL_FETCH",
      path,
      method: opts.method || "GET",
      body: opts.body,
    });
  } catch {
    throw new Error(
      "Bridge do painel offline. Recarregue https://tips3x3.com/app e a extensão.",
    );
  }

  if (!res?.ok) {
    throw new Error(res?.error || "Falha no fetch via painel");
  }
  return res.data;
}

export async function apiFetch(path, opts = {}) {
  // 1) Via aba Tips3x3 (mais confiável)
  try {
    return await panelFetch(path, {
      method: opts.method,
      body: opts.bodyJson,
    });
  } catch (panelErr) {
    // 2) Fallback Bearer com cookie lido pela API chrome.cookies
    const { apiBase, token } = await resolveSessionToken();
    if (!token) throw panelErr;

    const res = await fetch(`${apiBase}${path}`, {
      method: opts.method || "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: opts.bodyJson ? JSON.stringify(opts.bodyJson) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        `${json.error || `HTTP ${res.status}`} (painel: ${panelErr instanceof Error ? panelErr.message : panelErr})`,
      );
    }
    return json;
  }
}

export async function pushOdds(bookmaker, events) {
  if (!events?.length) return { upserted: 0, total: 0 };
  return apiFetch("/api/ext/odds", {
    method: "POST",
    bodyJson: { bookmaker, events },
  });
}

export async function fetchTargets() {
  return apiFetch("/api/ext/odds?targets=1", { method: "GET" });
}

export async function fetchSnapshot() {
  return apiFetch("/api/ext/odds", { method: "GET" });
}
