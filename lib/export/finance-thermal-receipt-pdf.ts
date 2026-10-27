import "server-only";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

/** Isolated, network-disabled document renderer; never visits an application or customer URL. */
export async function renderFinanceThermalReceiptPdf(html: string) {
  const localExecutable = process.env.FINANCE_RECEIPT_CHROMIUM_PATH;
  const browser = await puppeteer.launch({
    executablePath: localExecutable || await chromium.executablePath(),
    args: localExecutable ? [] : chromium.args,
    headless: "shell", timeout: 20000,
    defaultViewport: { width: 288, height: 900 },
  });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (request.url().startsWith("data:")) void request.continue();
      else void request.abort();
    });
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    await page.emulateMediaType("print");
    await page.evaluate(async () => { await document.fonts.ready; });
    const height = await page.evaluate(() => document.querySelector("article")!.getBoundingClientRect().height);
    // Continuous thermal roll for ordinary orders; long orders paginate without clipping.
    return await page.pdf({ width: "80mm", height: `${Math.min(1200, Math.max(60, Math.ceil(height * 25.4 / 96) + 5))}mm`, margin: { top: "2mm", right: "2mm", bottom: "2mm", left: "2mm" }, printBackground: true, waitForFonts: true, timeout: 20000 });
  } finally { await browser.close(); }
}
