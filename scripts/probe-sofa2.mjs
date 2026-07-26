import { gotScraping } from "got-scraping";

const jarHeaders = {
  Referer: "https://www.sofascore.com/",
  Origin: "https://www.sofascore.com",
  Accept: "application/json",
  "X-Requested-With": "XMLHttpRequest",
};

const home = await gotScraping({
  url: "https://www.sofascore.com/",
  headerGeneratorOptions: { browsers: [{ name: "chrome", minVersion: 120 }], devices: ["desktop"], operatingSystems: ["windows"] },
});
console.log("home", home.statusCode, "set-cookie", home.headers["set-cookie"]?.length || 0);

const cookie = (home.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ");
const live = await gotScraping({
  url: "https://www.sofascore.com/api/v1/sport/football/events/live",
  headers: { ...jarHeaders, Cookie: cookie },
  headerGeneratorOptions: { browsers: [{ name: "chrome", minVersion: 120 }], devices: ["desktop"], operatingSystems: ["windows"] },
});
console.log("live", live.statusCode, live.body.slice(0,120));
