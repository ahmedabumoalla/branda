import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type { SubscriptionInvoice } from "@/lib/platform/subscription-invoices";
import { buildSubscriptionInvoiceHtml, type SubscriptionInvoiceAssets } from "./subscription-invoice-html";
let cachedAssets:Promise<SubscriptionInvoiceAssets>|undefined;
export async function createSubscriptionInvoicePdf(invoice:SubscriptionInvoice,preview=false){
  cachedAssets??=Promise.all(['cairo.ttf','logo.png','stamp.png','riyal.png'].map(file=>readFile(path.join(process.cwd(),'assets/subscription-invoices',file),'base64'))).then(([font,logo,stamp,riyal])=>({font,logo,stamp,riyal})).catch(error=>{cachedAssets=undefined;throw error;});
  const html=buildSubscriptionInvoiceHtml(invoice,await cachedAssets,preview);
  const local=process.env.FINANCE_RECEIPT_CHROMIUM_PATH;
  const browser=await puppeteer.launch({executablePath:local||await chromium.executablePath(),args:local?[]:chromium.args,headless:'shell',timeout:20000});
  try{const page=await browser.newPage();await page.setJavaScriptEnabled(false);await page.setRequestInterception(true);page.on('request',request=>{if(request.url().startsWith('data:'))void request.continue();else void request.abort();});await page.setContent(html,{waitUntil:'load',timeout:15000});await page.emulateMediaType('print');await page.evaluate(async()=>{await document.fonts.ready;});return await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,waitForFonts:true,timeout:20000});}
  finally{await browser.close();}
}
