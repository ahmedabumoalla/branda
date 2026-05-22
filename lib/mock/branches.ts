export type CafeBranch = {
  id: string;
  name: string;
  address: string;
  city: string;
  distanceKm?: number;
  phone?: string;
  workingHours: string;
  mapUrl?: string;
  lat?: number;
  lng?: number;
  active: boolean;
};

export const BRANCHES_KEY = "branda_qatrah_branches";

export function buildGoogleMapsUrl(lat?: number, lng?: number, fallback?: string) {
  if (lat && lng) return `https://www.google.com/maps?q=${lat},${lng}`;
  return fallback || "https://www.google.com/maps";
}

export const mockBranches: CafeBranch[] = [
  {
    id: "1",
    name: "فرع التحلية",
    address: "شارع التحلية، جدة",
    city: "جدة",
    distanceKm: 2.4,
    phone: "0550000001",
    workingHours: "8 صباحًا - 12 منتصف الليل",
    lat: 21.5433,
    lng: 39.1728,
    mapUrl: "https://www.google.com/maps?q=21.5433,39.1728",
    active: true,
  },
  {
    id: "2",
    name: "فرع الواجهة",
    address: "واجهة جدة البحرية",
    city: "جدة",
    distanceKm: 5.8,
    phone: "0550000002",
    workingHours: "9 صباحًا - 1 بعد منتصف الليل",
    lat: 21.6341,
    lng: 39.1044,
    mapUrl: "https://www.google.com/maps?q=21.6341,39.1044",
    active: true,
  },
];