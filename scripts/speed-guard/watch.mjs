import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AGENT, brandPaths, config, pageType, riyadhTime, sendWhatsApp, summary } from "./shared.mjs";

// حارس السرعة, layer 3: every ten minutes on GitHub, request the public pages and the catalogue (which reads the
// database), time the answers, and alert once when a page type is slow or failing several runs in a row, then once
// when it recovers. It only sends GET requests, runs no page scripts, and so records nothing in brand statistics

const { slowMs, timeoutMs, failuresInARow, repeatAlertMinutes } = config.watch;
const stateFile = path.join(process.cwd(), ".speed-guard-state", "state.json");
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { counts: {}, incident: null };

async function measure(value) {
  const started = performance.now();
  try {
    const response = await fetch(new URL(value, config.site), { headers: { "user-agent": AGENT, "cache-control": "no-cache" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    const headersMs = Math.round(performance.now() - started);
    await response.arrayBuffer();
    const totalMs = Math.round(performance.now() - started);
    return { path: value, status: response.status, headersMs, totalMs, bad: response.status >= 400 || totalMs > slowMs };
  } catch (error) {
    return { path: value, status: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "error", headersMs: null, totalMs: Math.round(performance.now() - started), bad: true };
  }
}

const paths = [...config.watch.fixedPaths, ...(await brandPaths(config.watch.sampleBrands))];
const results = [];
for (const value of paths) results.push(await measure(value));

// Count bad runs in a row per page type
const types = new Map();
for (const result of results) { const type = pageType(result.path); types.set(type, (types.get(type) || false) || result.bad); }
for (const [type, bad] of types) state.counts[type] = bad ? (state.counts[type] || 0) + 1 : 0;
const failing = Object.entries(state.counts).filter(([, count]) => count >= failuresInARow).map(([type]) => type);

const now = Date.now();
let alerted = false;
const lineFor = result => `${result.path}  ${result.status}  ${result.totalMs} ms`;
if (failing.length) {
  const worst = results.filter(result => result.bad && failing.includes(pageType(result.path)));
  const due = !state.incident || now - state.incident.lastAlertAt >= repeatAlertMinutes * 60000;
  if (due) {
    const first = !state.incident;
    alerted = true;
    await sendWhatsApp([
      first ? "حارس السرعة: المنصة بطيئة الحين" : "حارس السرعة: البطء مستمر",
      `من ${failuresInARow} فحوصات ورا بعض، الساعة ${riyadhTime()}`,
      ...worst.slice(0, 6).map(lineFor),
      `الحد ${slowMs / 1000} ثواني، وأرسل لك أول ما ترجع طبيعية`,
    ].join("\n"));
    state.incident = { since: state.incident?.since || now, lastAlertAt: now };
  }
} else if (state.incident) {
  const minutes = Math.round((now - state.incident.since) / 60000);
  await sendWhatsApp(`حارس السرعة: المنصة رجعت طبيعية\nاستمر البطء ${minutes} دقيقة تقريبًا، الساعة ${riyadhTime()}`);
  state.incident = null;
}

mkdirSync(path.dirname(stateFile), { recursive: true });
writeFileSync(stateFile, JSON.stringify(state));
summary([
  "### حارس السرعة: المراقبة",
  "| الصفحة | الحالة | بداية الرد | الوقت الكامل |", "|---|---|---|---|",
  ...results.map(result => `| ${result.path} | ${result.status} | ${result.headersMs ?? "-"} ms | ${result.totalMs} ms${result.bad ? " ⚠️" : ""} |`),
  failing.length ? `\nبطء متكرر في: ${failing.join(", ")}` : results.some(result => result.bad) ? "\nفيه بطء في هذا الفحص، والتنبيه يطلع لو تكرر" : "\nكل الصفحات ضمن الحد",
]);
// Fail the run only when an alert went out, so GitHub emails once per alert, not every ten minutes
if (alerted) process.exit(1);
