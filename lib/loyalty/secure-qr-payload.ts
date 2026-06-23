export type BarndaksaQrKind = "loyalty-card" | "experience-reward" | "invoice" | "reservation" | "event-ticket";

const QR_PREFIX = "BARNDAKSA_QR";
const QR_VERSION = "v1";

type QrPayload = {
  v: typeof QR_VERSION;
  kind: BarndaksaQrKind;
  value: string;
};

function encodeBase64Url(value: string) {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  const binary = Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join("");
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  if (typeof window === "undefined") {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createBarndaksaQrPayload(kind: BarndaksaQrKind, value: string) {
  const normalized = value.trim().toUpperCase();
  const payload: QrPayload = { v: QR_VERSION, kind, value: normalized };
  return `${QR_PREFIX}:${QR_VERSION}:${encodeBase64Url(JSON.stringify(payload))}`;
}

export function parseBarndaksaQrPayload(rawValue: string, expectedKind?: BarndaksaQrKind) {
  const value = rawValue.trim();
  const [prefix, version, encoded] = value.split(":");

  if (prefix !== QR_PREFIX || version !== QR_VERSION || !encoded) {
    return expectedKind ? null : value;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encoded)) as Partial<QrPayload>;
    if (payload.v !== QR_VERSION || !payload.kind || typeof payload.value !== "string") return null;
    if (expectedKind && payload.kind !== expectedKind) return null;
    return payload.value.trim().toUpperCase();
  } catch {
    return null;
  }
}
