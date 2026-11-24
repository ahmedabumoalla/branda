import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

// Shared parts of حارس السرعة layers 2 and 3. They run on GitHub, outside the platform, and only read public pages

export const AGENT = "Mozilla/5.0 (compatible; BrandaSpeedGuard/1.0)";
export const config = JSON.parse(readFileSync(path.join(process.cwd(), "speed-guard.config.json"), "utf8"));

/** Brand pages to measure on this run. The sample rotates every ten minutes, so over a day every catalogue brand is covered */
export async function brandPaths(count, offsetSeed = Math.floor(Date.now() / 600000)) {
  if (!config.watch.catalogPath || !count) return [];
  const response = await fetch(new URL(config.watch.catalogPath, config.site), { headers: { "user-agent": AGENT } });
  if (!response.ok) return [];
  const body = await response.json();
  const slugs = (Array.isArray(body.menus) ? body.menus : []).map(menu => /^\/menu\/([^/?#]+)/.exec(String(menu.href || ""))?.[1]).filter(Boolean);
  if (!slugs.length) return [];
  const picked = Array.from({ length: Math.min(count, slugs.length) }, (_, i) => slugs[(offsetSeed * count + i) % slugs.length]);
  return picked.flatMap(slug => [`/menu/${slug}`, `/loyalty/${slug}`]);
}

/** The page type a path belongs to, so failures on rotating brand pages still count in a row */
export const pageType = value => {
  for (const pattern of config.watch.typePatterns || []) {
    const match = new RegExp(pattern).exec(value);
    if (match) return `${match[0].replace(/[^/]+$/, "")}*`;
  }
  return value.replace(/[?#].*$/, "");
};

/** WhatsApp alert through the notifications number. Skipped when the GitHub secrets are not set. Never logs the phone or the token */
export async function sendWhatsApp(message) {
  const { SPEED_GUARD_WA_API_URL: apiUrl, SPEED_GUARD_WA_INSTANCE: instance, SPEED_GUARD_WA_TOKEN: token, SPEED_GUARD_WA_TO: to } = process.env;
  if (!apiUrl || !instance || !token || !to) { console.log("[speed-guard] WhatsApp settings are not set, alert left to the GitHub email"); return false; }
  const phone = String(to).replace(/\D/g, "");
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/waInstance${instance}/sendMessage/${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: `${phone}@c.us`, linkPreview: false, message }),
      signal: AbortSignal.timeout(20000),
    });
    console.log(`[speed-guard] WhatsApp alert ${response.ok ? "sent" : `refused with ${response.status}`}`);
    return response.ok;
  } catch (error) {
    console.log(`[speed-guard] WhatsApp alert failed: ${error instanceof Error ? error.name : "error"}`);
    return false;
  }
}

export function summary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
}

export const riyadhTime = (date = new Date()) => date.toLocaleTimeString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });
