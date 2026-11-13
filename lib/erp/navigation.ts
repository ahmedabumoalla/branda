export function erpHref(href: string, slug?: string) {
  if (!slug || !/^[a-z0-9-]{1,120}$/.test(slug)) return href;
  if (/^\/dashboard\/system(?:\/|\?|#|$)/.test(href)) return href.replace('/dashboard/system', `/finance/${encodeURIComponent(slug)}/system`);
  if (/^\/dashboard\/finance(?:\?|#|$)/.test(href)) return href.replace('/dashboard/finance', `/finance/${encodeURIComponent(slug)}`);
  return href;
}
