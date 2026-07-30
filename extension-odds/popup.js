function fmtTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

function setMsg(text, kind) {
  const el = document.getElementById("msg");
  el.textContent = text || "";
  el.className = kind === "ok" ? "is-ok" : kind === "err" ? "is-err" : "";
}

function refresh() {
  chrome.runtime.sendMessage({ type: "TIPS3X3_STATUS" }, (res) => {
    if (chrome.runtime.lastError) {
      setMsg(chrome.runtime.lastError.message, "err");
      return;
    }
    if (!res?.ok) {
      setMsg("Background offline — recarregue a extensão", "err");
      return;
    }
    document.getElementById("enabled").textContent = res.enabled
      ? "Ativa"
      : "Desligada";
    document.getElementById("enabled").className = res.enabled ? "ok" : "bad";
    document.getElementById("session").textContent = res.hasSession
      ? "OK"
      : "Ausente";
    document.getElementById("session").className = res.hasSession
      ? "ok"
      : "bad";
    document.getElementById("api").textContent = res.apiBase || "—";
    document.getElementById("last").textContent = res.lastPushAt
      ? `${fmtTime(res.lastPushAt)} · ${res.lastPushBookmaker || "?"} · ${res.lastPushCount || 0}`
      : "—";
    document.getElementById("server").textContent =
      res.lastServerTotal != null ? String(res.lastServerTotal) : "—";
  });
}

document.getElementById("refresh").addEventListener("click", () => {
  setMsg("");
  refresh();
});

document.getElementById("test").addEventListener("click", () => {
  setMsg("Testando API…");
  chrome.runtime.sendMessage({ type: "TIPS3X3_TEST" }, (res) => {
    if (chrome.runtime.lastError) {
      setMsg(chrome.runtime.lastError.message, "err");
      refresh();
      return;
    }
    if (!res?.ok) setMsg(res?.error || "Falha no teste", "err");
    else setMsg(`API OK · ${res.count ?? 0} odds no servidor`, "ok");
    refresh();
  });
});

document.getElementById("capture").addEventListener("click", () => {
  setMsg("Capturando abas Bet365/Betnacional…");
  chrome.runtime.sendMessage({ type: "TIPS3X3_CAPTURE_TABS" }, (res) => {
    if (chrome.runtime.lastError) {
      setMsg(chrome.runtime.lastError.message, "err");
      refresh();
      return;
    }
    if (!res?.ok) {
      setMsg(res?.error || "Falha na captura", "err");
      refresh();
      return;
    }
    const lines = (res.results || []).map((r) => {
      const host = (r.url || "").replace(/^https?:\/\//, "").split("/")[0];
      const bm = r.bookmaker || "?";
      const detail = r.error
        ? r.error
        : r.hint || `lidas ${r.found || 0}` + (r.pushed != null ? ` · env ${r.pushed}` : "");
      return `${bm} @ ${host}: ${detail}`;
    });
    setMsg(
      `Total lidas ${res.found || 0} · servidor ${res.server || 0}\n${lines.join("\n")}`,
      res.found > 0 ? "ok" : "err",
    );
    refresh();
  });
});

refresh();
