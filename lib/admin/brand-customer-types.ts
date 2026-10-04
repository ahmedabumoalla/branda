export type BrandCustomerSegment = "all" | "shared" | "frequent" | "rewarded" | "expired";
export type BrandCustomerFilters = {
  search?: string;
  brandId?: string;
  segment?: BrandCustomerSegment;
  sort?: "recent" | "stamps" | "rewards";
  page?: number;
};

export type BrandCustomerBrand = { id: string; name: string; slug: string };

/** One customer's membership of one brand. Shared brands match normalized phone or auth account. */
export type BrandCustomer = {
  id: string;
  cardId: string | null;
  name: string;
  phone: string;
  email: string;
  brand: BrandCustomerBrand;
  sharedBrands: BrandCustomerBrand[];
  identityMatch: "phone" | "account" | "profile";
  status: "active" | "blocked" | "suspended";
  cardSuffix: string | null;
  joinedAt: string;
  cardIssuedAt: string | null;
  lastActivityAt: string | null;
  stamps: number;
  stampsInCycle: number;
  stampTarget: number;
  stampTransactions: number;
  scans: number;
  rewardsEarned: number;
  rewardsRedeemed: number;
  rewardsExpired: number;
  rewardsAvailable: number;
  isFrequent: boolean;
  firstDownloadAt: string | null;
  lastDownloadAt: string | null;
  downloadCount: number;
  firstInstalledAt: string | null;
  installedDeviceCount: number;
  walletProviders: Array<"apple" | "google">;
};

export type BrandCustomersPage = {
  customers: BrandCustomer[];
  brands: Array<BrandCustomerBrand & { customers: number; stamps: number; rewardsRedeemed: number }>;
  summary: {
    memberships: number;
    uniqueCustomers: number;
    sharedCustomers: number;
    frequentCustomers: number;
    stamps: number;
    scans: number;
    rewardsEarned: number;
    rewardsRedeemed: number;
    rewardsExpired: number;
  };
  total: number;
  page: number;
  pageSize: number;
  recordingStartedAt: string;
  walletRecordingStartedAt: string;
  frequentThreshold: number;
};

export type BrandCustomerEvent = {
  id: string;
  occurredAt: string;
  kind: "joined" | "card_issued" | "download" | "save_link" | "installed" | "unregistered" | "scan" | "stamp" | "redeem" | "void" | "reward_earned" | "reward_expired";
  outcome: "success" | "denied" | "failed" | "duplicate";
  origin: "live" | "historical";
  actorName: string | null;
  stampsDelta: number;
  stampsAfter: number | null;
  rewardsDelta: number;
  rewardName: string | null;
  rewardExpiresAt: string | null;
  reasonCode: string | null;
  provider: "apple" | "google" | null;
};

export type BrandCustomerDetail = {
  customer: BrandCustomer;
  memberships: BrandCustomer[];
  events: BrandCustomerEvent[];
  total: number;
  page: number;
  pageSize: number;
};

export type BrandCustomerResult<T> = { ok: true; data: T } | { ok: false; message: string };
