import { chromium, type Browser, type Page } from "playwright-core";

const SOFASCORE_ORIGIN = "https://www.sofascore.com";

let browserPromise: Promise<Browser> | null = null;
let pagePromise: Promise<Page> | null = null;
let warming: Promise<void> | null = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const common = {
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
      };
      try {
        return await chromium.launch(common);
      } catch {
        // playwright-core sem browsers baixados: usa Chrome/Edge do sistema
        try {
          return await chromium.launch({ ...common, channel: "chrome" });
        } catch {
          return await chromium.launch({ ...common, channel: "msedge" });
        }
      }
    })();
  }
  return browserPromise;
}

async function getPage() {
  if (!pagePromise) {
    pagePromise = (async () => {
      const browser = await getBrowser();
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        extraHTTPHeaders: {
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      });
      await page.goto(`${SOFASCORE_ORIGIN}/`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      return page;
    })();
  }
  return pagePromise;
}

async function ensureWarm() {
  const page = await getPage();
  if (!warming) {
    warming = Promise.resolve();
  }
  return page;
}

/** Serializa fetches — a mesma Page não aguenta evaluate concorrente. */
let fetchChain: Promise<unknown> = Promise.resolve();

export async function sofascoreFetchJson<T>(path: string): Promise<T> {
  const run = async () => {
    const page = await ensureWarm();
    const url = path.startsWith("http")
      ? path
      : `${SOFASCORE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;

    const result = await page.evaluate(async (target) => {
      const res = await fetch(target, {
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text.slice(0, 200) };
      }
      return { ok: res.ok, status: res.status, json };
    }, url);

    if (!result.ok) {
      throw new Error(`Sofascore ${result.status} ${path}`);
    }
    return result.json as T;
  };

  const next = fetchChain.then(run, run);
  fetchChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function closeSofascoreBrowser() {
  pagePromise = null;
  warming = null;
  if (browserPromise) {
    const b = await browserPromise;
    browserPromise = null;
    await b.close().catch(() => undefined);
  }
}
