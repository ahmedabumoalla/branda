import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const output = ts.transpileModule(fs.readFileSync(file,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "exports", output)(name => name === "server-only" ? {} : name.startsWith("@/") ? load(name.slice(2)+".ts") : name.startsWith(".") ? load(path.resolve(path.dirname(file),name)+".ts") : require(name), exports);
  return exports;
}
const phone = load("lib/auth/brand-phone.ts");
const { normalizeOwnerPhone } = load("lib/auth/owner-phone.ts");
const { normalizeLoyaltyReadPhone, resolveReadMethod } = load("lib/loyalty/read-identifier.ts");
const { parseCampaignRecipients } = load("components/marketing-campaigns/campaign-form.ts");
const expectedCountries = ["SA","AE","BH","KW","OM","QA","YE","JO","PS","LB","SY","IQ","EG","SD","LY","TN","DZ","MA","MR","SO","DJ","KM"];
assert.deepEqual(phone.ARAB_COUNTRY_CODES,expectedCountries);
assert.deepEqual(phone.ARAB_COUNTRIES.map(c=>c.code),expectedCountries);
let checks=2;
const eq=(actual,expected,label)=>{assert.equal(actual,expected,label);checks++;};
for (const country of phone.ARAB_COUNTRIES) {
  const canonical = country.callingCode+country.example;
  const local = (country.prefix ?? "")+country.example;
  const arabic = local.replace(/\d/g,d=>String.fromCharCode(0x660+Number(d)));
  const persian = local.replace(/\d/g,d=>String.fromCharCode(0x6f0+Number(d)));
  for (const input of [local,country.example,canonical,"+"+canonical,"00"+canonical,arabic,persian,`\u2066+${country.callingCode} (${country.example.slice(0,3)}) ${country.example.slice(3)}\u2069`]) {
    eq(phone.normalizeBrandPhone(input,country.code),canonical,`${country.code} normalize ${input}`);
    eq(normalizeLoyaltyReadPhone(input,country.code),canonical,`${country.code} loyalty`);
    eq(normalizeOwnerPhone(input,country.callingCode),canonical,`${country.code} owner`);
  }
  for (const input of ["+"+canonical,"00"+canonical,canonical]) {
    eq(phone.inferPhoneCountry(input),country.code,`${country.code} detection`);
    eq(phone.normalizeInternationalPhone(input,"SA"),canonical,`${country.code} foreign employee`);
    eq(resolveReadMethod("code",input,country.code),"phone",`${country.code} scanner detection`);
  }
  eq(phone.normalizeInternationalPhone(local,country.code),canonical,`${country.code} local employee`);
  eq(phone.canonicalBrandMobile.test(canonical),true,`${country.code} sender eligibility`);
  eq(parseCampaignRecipients(`${local},+${canonical}`,country.code).phones.length,1,`${country.code} customer deduplication`);
  for (const other of phone.ARAB_COUNTRIES.filter(c=>c.code!==country.code)) {
    eq(phone.normalizeBrandPhone("+"+canonical,other.code),null,`${country.code} customer cannot cross ${other.code}`);
  }
  for (const invalid of ["","+"+canonical+"9999",local+"ext1","+1"+local,"++"+canonical,"123", "00"+local, "9".repeat(65)]) {
    eq(phone.normalizeBrandPhone(invalid,country.code),null,`${country.code} invalid ${invalid}`);
  }
}
eq(phone.normalizeBrandPhone("0511111111","SA"),"966511111111","legacy Saudi");
eq(phone.normalizeBrandPhone("+966 (0)51 111 1111","SA"),"966511111111","legacy international trunk");
eq(phone.normalizeBrandPhone("0591234567","PS"),"970591234567","Palestine local");
eq(phone.normalizeBrandPhone("0591234567","SA"),"966591234567","local country disambiguation");
eq(phone.normalizeBrandPhone("+970551234567","PS"),null,"invalid Palestine prefix");
eq(phone.inferPhoneCountry("20123456"),null,"Tunisian local is not Egyptian international");
eq(phone.normalizeBrandPhone("20123456","TN"),"21620123456","Tunisian local preserved");
console.log(`PASS Arab phones: ${checks} actual normalization, country isolation and country detection checks across all22countries; no network/messages`);
