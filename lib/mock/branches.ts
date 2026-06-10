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
  geofenceRadiusM?: number;
  welcomeMessage?: string;
  active: boolean;
};

export const BRANCHES_KEY = "branda_qatrah_branches";

export function buildGoogleMapsUrl(lat?: number, lng?: number, fallback?: string) {
  if (lat && lng) return `https://www.google.com/maps?q=${lat},${lng}`;
  return fallback || "https://www.google.com/maps";
}

export function buildMapboxMapUrl(lat?: number, lng?: number, fallback?: string) {
  if (lat && lng) {
    return `https://www.mapbox.com/maps?coordinates=${lng},${lat}`;
  }
  return fallback || "https://www.mapbox.com/maps";
}

export const DEFAULT_BRANCH_GEOFENCE_RADIUS_M = 50;

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
    geofenceRadiusM: DEFAULT_BRANCH_GEOFENCE_RADIUS_M,
    welcomeMessage: "أهلًا بك في فرع التحلية، سعداء بزيارتك",
    mapUrl: "https://www.mapbox.com/maps?coordinates=39.1728,21.5433",
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
    geofenceRadiusM: DEFAULT_BRANCH_GEOFENCE_RADIUS_M,
    welcomeMessage: "أهلًا بك في فرع الواجهة، استمتع بتجربتك معنا",
    mapUrl: "https://www.mapbox.com/maps?coordinates=39.1044,21.6341",
    active: true,
  },
];
