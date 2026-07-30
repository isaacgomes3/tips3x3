const DEFAULT_API = "https://tips3x3.com";

async function load() {
  const data = await chrome.storage.sync.get({
    apiBase: DEFAULT_API,
    sessionToken: "",
    enabled: true,
  });
  document.getElementById("apiBase").value = data.apiBase || DEFAULT_API;
  document.getElementById("sessionToken").value = data.sessionToken || "";
  document.getElementById("enabled").checked = data.enabled !== false;
}

async function save() {
  const apiBase = document.getElementById("apiBase").value.trim().replace(/\/$/, "") || DEFAULT_API;
  const sessionToken = document.getElementById("sessionToken").value.trim();
  const enabled = document.getElementById("enabled").checked;
  await chrome.storage.sync.set({ apiBase, sessionToken, enabled });
  document.getElementById("status").textContent = "Salvo.";
}

document.getElementById("save").addEventListener("click", () => void save());
void load();
