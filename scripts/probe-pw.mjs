import { chromium } from "playwright-core";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://www.sofascore.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
const live = await page.evaluate(async () => {
  const r = await fetch("/api/v1/sport/football/events/live", { headers: { "X-Requested-With": "XMLHttpRequest" } });
  return { status: r.status, json: await r.json() };
});
console.log("live", live.status, (live.json.events||[]).length);
const ev = (live.json.events||[]).find(Boolean);
if (ev) {
  const id = ev.id;
  const data = await page.evaluate(async (id) => {
    const h = { "X-Requested-With": "XMLHttpRequest" };
    const [g, s] = await Promise.all([
      fetch("/api/v1/event/" + id + "/graph", { headers: h }).then(async r => ({ status: r.status, json: await r.json() })),
      fetch("/api/v1/event/" + id + "/statistics", { headers: h }).then(async r => ({ status: r.status, json: await r.json() })),
    ]);
    return { id, name: evName(id), g, s };
    function evName(){return ""}
  }, id);
  // simpler
  const detail = await page.evaluate(async (eventId) => {
    const h = { "X-Requested-With": "XMLHttpRequest" };
    const g = await fetch("/api/v1/event/" + eventId + "/graph", { headers: h });
    const s = await fetch("/api/v1/event/" + eventId + "/statistics", { headers: h });
    return {
      graphStatus: g.status,
      statsStatus: s.status,
      graph: g.ok ? await g.json() : null,
      stats: s.ok ? await s.json() : null,
    };
  }, id);
  console.log(ev.homeTeam.name, "vs", ev.awayTeam.name, detail.graphStatus, detail.statsStatus, detail.graph?.graphPoints?.length);
}
await browser.close();
