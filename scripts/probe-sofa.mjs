import { gotScraping } from "got-scraping";

const res = await gotScraping({
  url: "https://api.sofascore.com/api/v1/sport/football/events/live",
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
