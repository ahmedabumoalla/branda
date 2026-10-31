import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "output", "branda-home");
await fs.mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const url = process.env.HOME_TEST_URL || "http://127.0.0.1:3125";
const checks = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('[data-count-to="12480"]')?.textContent === "12,480");
  assert.equal(await page.$$eval("#features article", elements => elements.length), 16);
  assert.equal(await page.$$eval("#faq details", elements => elements.length), 10);
  assert.equal(await page.evaluate(() => document.body.textContent.includes("تمارا")), false);
  const motion = await page.evaluate(() => {
    const stage = document.querySelector('[class*="dashboardScene"]');
    const box = stage.getBoundingClientRect();
    return {
      point: { x: box.left + box.width * .75, y: box.top + box.height * .25 },
      pending: document.querySelectorAll('[data-home-reveal="pending"]').length,
      loops: document.getAnimations().filter(a => a.effect.getTiming().iterations === Infinity).map(a => ({ name: a.animationName, duration: a.effect.getTiming().duration })),
    };
  });
  assert(motion.pending > 20, "Offscreen sections must wait for scroll reveal");
  assert(motion.loops.some(a => a.name?.includes("liveBlink") && a.duration === 1600));
  assert(motion.loops.some(a => a.name?.includes("wordSwap") && a.duration === 12000));
  await page.mouse.move(motion.point.x, motion.point.y);
  await pause(250);
  assert(await page.$eval('[class*="browserMock"]', el => el.style.transform.includes("rotateY")), "Dashboard must respond to pointer movement");
  await page.mouse.move(5, 5);
  await pause(800);
  assert.equal(await page.$eval('[class*="browserMock"]', el => el.style.transform), "");
  await page.screenshot({ path: path.join(output, "desktop-hero.png") });
  await page.$eval("#features", el => el.scrollIntoView());
  await pause(1200);
  assert.equal(await page.$eval("#features article", el => el.dataset.homeReveal), "entered");
  await page.hover("#features article");
  await pause(400);
  assert(await page.$eval("#features article", el => getComputedStyle(el).transform !== "none"));
  assert(await page.$eval("#features article", el => Boolean(el.style.getPropertyValue("--mx"))));
  await page.screenshot({ path: path.join(output, "desktop-features.png") });
  const coverage = await page.evaluate(() => [...document.querySelectorAll('[class*="partnerTrack"],[class*="industryTrack"],[class*="trustTrack"]')].map(track => {
    const animation = track.getAnimations()[0];
    const parent = track.parentElement.getBoundingClientRect();
    return [0, .5, .99].map(fraction => {
      animation.pause();
      animation.currentTime = animation.effect.getTiming().duration * fraction;
      const box = track.getBoundingClientRect();
      return box.left <= parent.left + 1 && box.right >= parent.right - 1;
    });
  }));
  assert(coverage.flat().every(Boolean), "Moving strips must cover the viewport throughout each loop");
  checks.push("16 features, 10 FAQ entries, Tamara removed, counters, pointer tilt/reset, scroll reveal/stagger, hover glow and continuous marquee coverage");

  for (const width of [768, 390, 320]) {
    await page.setViewport({ width, height: 844, isMobile: width < 500, hasTouch: width < 500 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Arabic overflow at ${width}`);
  }
  await page.click('button[aria-controls="home-mobile-nav"]');
  assert.equal(await page.$eval('button[aria-controls="home-mobile-nav"]', el => el.getAttribute("aria-expanded")), "true");
  await page.keyboard.press("Escape");
  assert.equal(await page.$eval('button[aria-controls="home-mobile-nav"]', el => el.getAttribute("aria-expanded")), "false");
  await page.click('button[aria-label="Switch to English"]');
  assert(await page.evaluate(() => document.querySelector("main").parentElement.dir === "ltr" && document.documentElement.scrollWidth <= innerWidth));
  await page.click('button[aria-label="التبديل إلى العربية"]');
  await page.evaluate(() => [...document.querySelectorAll("#pricing a")].find(a => a.textContent.includes("اختر المتقدمة")).click());
  await pause(1100);
  const form = await page.evaluate(async () => {
    const form = document.querySelector("#contact form");
    const selected = form.textContent.includes("الباقة المختارة: المتقدمة");
    form.elements.fullName.value = "اختبار الواجهة";
    form.elements.business.value = "نشاط تجريبي";
    form.elements.type.value = "مقهى";
    form.elements.phone.value = "123";
    form.requestSubmit();
    await new Promise(resolve => setTimeout(resolve, 50));
    const invalid = form.textContent.includes("أدخل رقم جوال سعودي");
    let captured = "";
    const original = window.open;
    window.open = value => { captured = value; return null; };
    try { form.elements.phone.value = "٠٥٠١٢٣٤٥٦٧"; form.requestSubmit(); }
    finally { window.open = original; }
    const url = new URL(captured);
    return { selected, invalid, whatsapp: url.hostname === "wa.me", phone: url.searchParams.get("text").includes("0501234567"), plan: url.searchParams.get("text").includes("المتقدمة") };
  });
  assert(Object.values(form).every(Boolean));
  await page.evaluate(() => { const details = document.querySelectorAll("#faq details"); details[0].querySelector("summary").click(); details[1].querySelector("summary").click(); });
  assert(await page.evaluate(() => !document.querySelectorAll("#faq details")[0].open && document.querySelectorAll("#faq details")[1].open));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluate(() => scrollTo(0, 0));
  await pause(300);
  await page.screenshot({ path: path.join(output, "mobile-hero.png") });
  checks.push("Arabic/English responsive 320/390/768/1440, menu/Escape, exclusive FAQ, plan selection and Saudi phone validation; WhatsApp intercepted, no sends");

  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await pause(100);
  const reduced = await page.evaluate(() => ({ pending: document.querySelectorAll('[data-home-reveal="pending"]').length, infinite: document.getAnimations().filter(a => a.effect.getTiming().iterations === Infinity).length }));
  assert.equal(reduced.pending, 0);
  assert.equal(reduced.infinite, 0);
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].filter(a => !document.getElementById(a.getAttribute("href").slice(1))).map(a => a.getAttribute("href")));
  assert.deepEqual(links, []);
  await page.evaluate(() => { for (const image of document.images) image.loading = "eager"; });
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
  assert.deepEqual(errors, []);
  checks.push("Live reduced-motion preference clears reveals/loops, all image assets loaded, no broken anchors or browser runtime errors");
  await fs.writeFile(path.join(output, "browser-qa.json"), JSON.stringify({ at: new Date().toISOString(), url, checks, motion, coverage, errors, noOutgoingMessages: true }, null, 2));
  console.log(JSON.stringify({ result: "PASS", checks }, null, 2));
} finally { await browser.close(); }
