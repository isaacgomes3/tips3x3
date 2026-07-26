import { chromium, type Browser, type LaunchOptions, type Page } from "playwright-core";
import fs from "fs";
import os from "os";
import path from "path";

const SOFASCORE_ORIGIN = "https://www.sofascore.com";

let browserPromise: Promise<Browser> | null = null;
let pagePromise: Promise<Page> | null = null;

function playwrightCacheDirs() {
  const home = process.env.HOME || os.homedir();
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(home, ".cache", "ms-playwright");
  return base;
}

function resolveChromiumExecutable(): string | undefined {
  const base = playwrightCacheDirs();
  if (!fs.existsSync(base)) return undefined;
  const dirs = fs.readdirSync(base);
  const headless = dirs
    .filter((d) => d.startsWith("chromium_headless_shell-"))
    .sort()
    .reverse()[0];
  const full = dirs
    .filter((d) => d.startsWith("chromium-") && !d.includes("headless"))
    .sort()
    .reverse()[0];

  const candidates = [
    headless
      ? path.join(
          base,
          headless,
          "chrome-headless-shell-linux64",
          "chrome-headless-shell",
        )
      : null,
    full ? path.join(base, full, "chrome-linux64", "chrome") : null,
    full ? path.join(base, full, "chrome-win64", "chrome.exe") : null,
  ].filter(Boolean) as string[];

  return candidates.find((p) => fs.existsSync(p));
}

function launchArgs(): string[] {
  return [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ];
}

async function launchBrowser(): Promise<Browser> {
  const common: LaunchOptions = {
    headless: true,
    args: launchArgs(),
  };

  const executablePath = resolveChromiumExecutable();
  const attempts: LaunchOptions[] = [
    ...(executablePath ? [{ ...common, executablePath }] : []),
    common,
    { ...common, channel: "chrome" as const },
    { ...common, channel: "chromium" as const },
  ];

  let lastError: unknown;
  for (const opts of attempts) {
    try {
      return await chromium.launch(opts);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Falha ao iniciar Chromium para Sofascore");
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

async function getPage() {
  if (!pagePromise) {
    pagePromise = (async () => {
      try {
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
      } catch (e) {
        pagePromise = null;
        throw e;
      }
    })();
  }
  return pagePromise;
}

/** Serializa fetches — a mesma Page não aguenta evaluate concorrente. */
let fetchChain: Promise<unknown> = Promise.resolve();

export async function sofascoreFetchJson<T>(path: string): Promise<T> {
  const run = async () => {
    const page = await getPage();
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
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    if (b) await b.close().catch(() => undefined);
  }
}
