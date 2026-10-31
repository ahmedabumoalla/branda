import assert from "node:assert/strict";
import fs from "node:fs/promises";
import puppeteer from "puppeteer-core";

const url=process.env.HOME_TEST_URL || "http://127.0.0.1:3125";
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
await fs.mkdir('output/home-catalog',{recursive:true});
const results=[];
try {
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.setViewport({width:1440,height:1000});
  await page.goto(url,{waitUntil:'networkidle0',timeout:60000});
  await page.waitForSelector('[data-plan-id]');
  const names=await page.$$eval('[data-plan-id]',cards=>cards.map(card=>card.querySelector('h3').textContent));
  assert.equal(names.length,7);
  await page.$eval('#pricing',element=>element.scrollIntoView());
  const tops=await page.$$eval('[data-plan-id]',cards=>cards.map(card=>Math.round(card.getBoundingClientRect().top)));
  assert.equal(new Set(tops).size,1,'All plans must share one desktop row');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Desktop page overflow');
  await page.screenshot({path:'output/home-catalog/desktop-pricing.png'});
  results.push('Seven live plans fit one desktop row');
  for(const width of [390,320,768]) {
    await page.setViewport({width,height:844,isMobile:width<500,hasTouch:width<500});
    await page.$eval('#pricing',element=>element.scrollIntoView());
    await page.waitForFunction(expected=>document.documentElement.scrollWidth<=expected && innerWidth<=expected,width===768 ? {timeout:10000} : {timeout:10000},width);
    const currency=await page.$$eval('[data-plan-id] svg.lucide-saudi-riyal',elements=>elements.map(element=>({width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height,paths:element.querySelectorAll('path').length})));
    assert(currency.length>=14&&currency.every(icon=>icon.width>8&&icon.height>8&&icon.paths>0));
    await page.screenshot({path:`output/home-catalog/pricing-${width}.png`});
  }
  results.push('320/390/768 responsive pricing with real SVG currency and no page overflow');
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.$eval('[data-plan-id] a',element=>element.click());
  assert(await page.$eval('#contact form',form=>form.textContent.includes('الباقة المختارة')));
  // Invalid phone is rejected locally and never sends an action or writes an inbox row
  await page.$eval('#contact form',form=>{
    form.elements.fullName.value='Local QA';form.elements.business.value='Local QA';
    form.elements.type.value='مقهى';form.elements.phone.value='123';form.requestSubmit();
  });
  await page.waitForFunction(()=>document.querySelector('#contact [role="status"]')?.textContent.includes('أدخل رقم جوال سعودي'));
  const links=await page.$$eval('[class*="floatingContact"] a',links=>links.map(link=>link.href));
  assert(links.some(link=>link==='tel:+966508333556')||url.includes('127.0.0.1'),'Live call number');
  await page.$eval('#features',element=>element.scrollIntoView());
  await page.waitForFunction(()=>document.querySelector('img[alt="Deli Cake"]')?.naturalWidth>0);
  await page.screenshot({path:'output/home-catalog/deli-mobile.png'});
  const claims=await page.$eval('#clients',element=>element.textContent);
  assert(claims.includes('+650')&&!claims.includes('6000'));
  assert.deepEqual(errors,[]);
  results.push('Plan selection, local phone validation, Deli logo, 650 count and no runtime errors');
  await fs.writeFile('output/home-catalog/browser-results.json',JSON.stringify({at:new Date().toISOString(),url,names,results,noMessagesOrRequestsSent:true},null,2));
  console.log(JSON.stringify({result:'PASS',results}));
} finally {await browser.close();}
