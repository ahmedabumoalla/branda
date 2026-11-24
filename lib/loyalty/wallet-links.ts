import { z } from "zod";

export const MAX_WALLET_LINKS = 10;
export type WalletLink = { id: string; label: string; url: string };
export type WalletLinksState = { available: boolean; links: WalletLink[] };
const controls = /[\u0000-\u001f\u007f-\u009f]/;

/** Syntax only: never fetch owner-provided addresses. These links become public. */
export function normalizeWalletLinkUrl(input: string): string | null {
  if (controls.test(input) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(input)) return null;
  try { if (controls.test(decodeURIComponent(input))) return null; } catch { return null; }
  const value = input.trim();
  if (value.length > 2048 || /[\\<>"`]/.test(value)) return null;
  if (/^tel:/i.test(value)) {
    const phone = value.slice(4).replace(/[ ()-]/g, "");
    return /^\+?[0-9]{7,15}$/.test(phone) ? `tel:${phone}` : null;
  }
  if (/^mailto:/i.test(value)) {
    const email = value.slice(7);
    return /^[A-Za-z0-9.!#$%&'*+/=_-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,63}$/.test(email)
      ? `mailto:${email}` : null;
  }
  if (!/^https:\/\//i.test(value) || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    // Domain names only: excludes IPv4, IPv6, alternate numeric IPs and local hosts.
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host)
      || /(?:^|\.)(?:localhost|local|internal|lan|home|invalid|test)$/i.test(host)) return null;
    return url.href;
  } catch { return null; }
}

export const walletLinksSchema = z.array(z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "معرّف الرابط غير صالح"),
  label: z.string().refine(value => !controls.test(value), "اسم الرابط غير صالح").transform(value => value.trim())
    .pipe(z.string().min(1, "اكتب اسم الرابط").max(60, "اسم الرابط يجب ألا يتجاوز ٦٠ حرفًا")),
  url: z.string().max(2048, "الرابط طويل جدًا").transform((value, ctx) => {
    const normalized = normalizeWalletLinkUrl(value);
    if (!normalized) { ctx.addIssue({ code: "custom", message: "أدخل رابطًا آمنًا أو رقم اتصال أو بريدًا إلكترونيًا صالحًا" }); return z.NEVER; }
    return normalized;
  }),
}).strict()).max(MAX_WALLET_LINKS, "يمكن إضافة ١٠ روابط كحد أقصى").superRefine((links, ctx) => {
  const ids = new Set<string>(); const urls = new Set<string>();
  links.forEach((link, index) => {
    if (ids.has(link.id) || urls.has(link.url)) ctx.addIssue({ code: "custom", path: [index], message: "هذا الرابط مضاف مسبقًا" });
    ids.add(link.id); urls.add(link.url);
  });
});

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function appleWalletLinkFields(links: WalletLink[] = []) {
  const parsed = walletLinksSchema.safeParse(links);
  if (!parsed.success) return [];
  return parsed.data.map(link => ({ key: `wallet_link_${link.id}`, label: link.label, value: link.url,
    attributedValue: `<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>` }));
}
