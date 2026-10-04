// Apple treats update tags as opaque values. Numeric microseconds retain the
// database's precision without '+' characters that some URL clients decode as spaces.
export function appleUpdateTag(timestamp: string) {
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) throw new Error("wallet_invalid_update_tag");
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(timestamp)?.[1] ?? "";
  return (BigInt(milliseconds) * BigInt(1000) + BigInt(fraction.padEnd(6, "0").slice(3, 6))).toString();
}

export function appleUpdateTimestamp(tag: string) {
  if (/^\d{1,18}$/.test(tag)) {
    const microseconds = BigInt(tag);
    const date = new Date(Number(microseconds / BigInt(1000)));
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) return null;
    return date.toISOString().replace("Z", `${(microseconds % BigInt(1000)).toString().padStart(3, "0")}Z`);
  }
  // Keep old installed passes working, including raw '+' query serialization.
  const legacy = tag.replace(/ (?=\d{2}:\d{2}$)/, "+");
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(legacy) || !Number.isFinite(Date.parse(legacy))) return null;
  return appleUpdateTimestamp(appleUpdateTag(legacy));
}
