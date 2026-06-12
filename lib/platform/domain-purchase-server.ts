import {
  createMockOrderId,
  extractTld,
  isLiveDomainPurchaseEnabled,
  isSupportedDirectPurchaseTld,
  isValidDomain,
  normalizeDomain,
  type CafePurchasedDomain,
  type DomainAvailabilityResult,
  type DomainPriceResult,
} from "@/lib/platform/domain-purchase";

type VercelConfig = {
  token: string;
  teamId?: string;
  projectId?: string;
};

function getVercelConfig(): VercelConfig {
  const token = process.env.VERCEL_TOKEN || "";
  return {
    token,
    teamId: process.env.VERCEL_TEAM_ID,
    projectId: process.env.VERCEL_PROJECT_ID,
  };
}

function withTeamQuery(path: string, teamId?: string) {
  if (!teamId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}teamId=${encodeURIComponent(teamId)}`;
}

async function vercelFetch(path: string, init?: RequestInit) {
  const cfg = getVercelConfig();
  if (!cfg.token) throw new Error("VERCEL_TOKEN is missing");
  const url = `https://api.vercel.com${withTeamQuery(path, cfg.teamId)}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof payload.error?.toString === "function"
        ? payload.error.toString()
        : `Vercel API failed (${res.status})`;
    throw new Error(msg);
  }
  return payload;
}

export function validateDomainInput(domainInput: string) {
  const domain = normalizeDomain(domainInput);
  if (!isValidDomain(domain)) {
    throw new Error("صيغة الدومين غير صحيحة.");
  }
  const tld = extractTld(domain);
  return { domain, tld, supportedTld: isSupportedDirectPurchaseTld(tld) };
}

export async function resolveAvailability(domainInput: string): Promise<DomainAvailabilityResult> {
  const { domain, tld, supportedTld } = validateDomainInput(domainInput);
  if (!supportedTld) {
    return {
      domain,
      tld,
      available: false,
      supportedTld: false,
      status: "unavailable",
      message:
        "هذا الامتداد غير مدعوم للشراء المباشر حاليًا، يمكنك ربطه يدويًا من خيار الدومين الخارجي.",
    };
  }

  if (!isLiveDomainPurchaseEnabled()) {
    const unavailableSeeds = ["taken", "google", "apple", "amazon", "vercel", "barndaksa"];
    const firstLabel = domain.split(".")[0] || "";
    const available = !unavailableSeeds.some((seed) => firstLabel.includes(seed));
    return {
      domain,
      tld,
      available,
      supportedTld: true,
      status: available ? "available" : "unavailable",
    };
  }

  const payload = await vercelFetch(`/v1/registrar/domains/${encodeURIComponent(domain)}/availability`);
  const available = Boolean(payload.available);
  return {
    domain,
    tld,
    available,
    supportedTld: true,
    status: available ? "available" : "unavailable",
  };
}

export async function resolvePrice(domainInput: string, years = 1): Promise<DomainPriceResult> {
  const { domain, tld, supportedTld } = validateDomainInput(domainInput);
  if (!supportedTld) {
    return {
      domain,
      tld,
      supportedTld: false,
      years,
      price: 0,
      currency: "SAR",
      status: "failed",
      message:
        "هذا الامتداد غير مدعوم للشراء المباشر حاليًا، يمكنك ربطه يدويًا من خيار الدومين الخارجي.",
    };
  }

  if (!isLiveDomainPurchaseEnabled()) {
    const basePriceMap: Record<string, number> = {
      ".com": 55,
      ".net": 60,
      ".org": 58,
      ".io": 140,
      ".co": 120,
      ".app": 75,
      ".store": 110,
      ".sa": 180,
    };
    const base = basePriceMap[tld] ?? 95;
    return {
      domain,
      tld,
      supportedTld: true,
      years,
      price: base * years,
      currency: "SAR",
      status: "available",
    };
  }

  const payload = await vercelFetch(`/v1/registrar/domains/${encodeURIComponent(domain)}/price?years=${years}`);
  return {
    domain,
    tld,
    supportedTld: true,
    years,
    price: Number(payload.price ?? 0),
    currency: String(payload.currency ?? "USD"),
    status: "available",
  };
}

export async function purchaseDomain(input: {
  cafeSlug: string;
  domain: string;
  years: number;
  autoRenew: boolean;
  price?: number;
  currency?: string;
}): Promise<CafePurchasedDomain> {
  const { domain, tld } = validateDomainInput(input.domain);
  const { createDomainOrderRequest } = await import("@/lib/data/domain-orders");

  if (!isLiveDomainPurchaseEnabled()) {
    return createDomainOrderRequest({
      cafeSlug: input.cafeSlug,
      domain,
      tld,
      years: input.years,
      autoRenew: input.autoRenew,
    });
  }

  const processing = await createDomainOrderRequest({
    cafeSlug: input.cafeSlug,
    domain,
    tld,
    years: input.years,
    autoRenew: input.autoRenew,
  });

  try {
    const payload = await vercelFetch(`/v1/registrar/domains/${encodeURIComponent(domain)}/buy`, {
      method: "POST",
      body: JSON.stringify({
        years: input.years,
        autoRenew: input.autoRenew,
      }),
    });

    return {
      ...processing,
      status: "purchased",
      vercelOrderId: String(payload.orderId ?? payload.id ?? ""),
      vercelDomainId: typeof payload.domainId === "string" ? payload.domainId : undefined,
      paidAt: new Date().toISOString(),
      purchasedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw error;
  }
}

export async function connectDomainToProject(domainInput: string) {
  const { domain } = validateDomainInput(domainInput);
  const cfg = getVercelConfig();
  if (!isLiveDomainPurchaseEnabled()) {
    return { domain, connected: true, projectDomainId: `mock_project_domain_${Date.now()}` };
  }
  if (!cfg.projectId) {
    throw new Error("VERCEL_PROJECT_ID is missing");
  }
  const payload = await vercelFetch(`/v10/projects/${encodeURIComponent(cfg.projectId)}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
  return {
    domain,
    connected: true,
    projectDomainId: String(payload.id ?? payload.name ?? ""),
  };
}

export async function resolveDomainStatus(domainInput: string) {
  const { domain } = validateDomainInput(domainInput);
  if (!isLiveDomainPurchaseEnabled()) {
    return { domain, status: "purchased" as const, connected: false };
  }

  const cfg = getVercelConfig();
  if (!cfg.projectId) {
    throw new Error("VERCEL_PROJECT_ID is missing");
  }

  const payload = await vercelFetch(
    `/v10/projects/${encodeURIComponent(cfg.projectId)}/domains/${encodeURIComponent(domain)}`
  );
  const verified = Boolean(payload.verified ?? payload.apexName);
  return {
    domain,
    status: verified ? ("connected" as const) : ("purchased" as const),
    connected: verified,
  };
}
