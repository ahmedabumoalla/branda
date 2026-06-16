export type BarndaksaQrKind = "loyalty-card" | "experience-reward" | "invoice" | "reservation";

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

function normalizePlainCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function extractCodeFromUrl(rawValue: string) {
  const value = rawValue.trim();

  try {
    const url = new URL(value);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const loyaltyIndex = pathParts.findIndex((part) => part.toLowerCase() === "loyalty-card");
    if (loyaltyIndex >= 0 && pathParts[loyaltyIndex + 1]) {
      return normalizePlainCode(decodeURIComponent(pathParts[loyaltyIndex + 1]));
    }

    const queryKeys = ["cardCode", "card_code", "loyaltyCard", "loyalty_card", "card", "code"];
    for (const key of queryKeys) {
      const param = url.searchParams.get(key);
      if (param?.trim()) return normalizePlainCode(param);
    }
  } catch {
    // Not a full URL, continue with regex fallback.
  }

  const match = value.match(/loyalty-card\/([^/?#]+)/i);
  if (match?.[1]) return normalizePlainCode(decodeURIComponent(match[1]));

  return null;
}

export function createBarndaksaQrPayload(kind: BarndaksaQrKind, value: string) {
  const normalized = normalizePlainCode(value);
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
    return normalizePlainCode(payload.value);
  } catch {
    return null;
  }
}

export function normalizeLoyaltyCardScanValue(rawValue: string) {
  const secureValue = parseBarndaksaQrPayload(rawValue, "loyalty-card");
  if (secureValue) return secureValue;

  const urlValue = extractCodeFromUrl(rawValue);
  if (urlValue) return urlValue;

  return normalizePlainCode(rawValue);
}
