const { gotScraping } = require("got-scraping");

(async () => {
  const url = "https://api.sofascore.com/api/v1/sport/football/events/live";
  try {
    const res = await gotScraping({
      url,
      headerGeneratorOptions: {
        browsers: [{ name: "chrome", minVersion: 120 }],
        devices: ["desktop"],
        locales: ["en-US", "pt-BR"],
        operatingSystems: ["windows"],
      },
      headers: {
        Referer: "https://www.sofascore.com/",
        Origin: "https://www.sofascore.com",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
      },
    });
    console.log("status", res.statusCode, "len", res.body.length);
    const j = JSON.parse(res.body);
    console.log("events", (j.events || []).length);
    const ev = (j.events || [])[0];
    if (ev) console.log(ev.id, ev.homeTeam?.name, "vs", ev.awayTeam?.name);
  } catch (e) {
    console.error("ERR", e.message, e.response?.statusCode);
  }
})();
