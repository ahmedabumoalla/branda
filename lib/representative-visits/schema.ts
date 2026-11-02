import { z } from "zod";

export const VISIT_SERVICES = { menu: "منيو", loyalty: "ولاء", accounting: "نظام محاسبي", other: "خدمة أخرى" } as const;
const digits = (value: string) => value.replace(/[٠-٩۰-۹]/g, char => String("٠١٢٣٤٥٦٧٨٩".includes(char) ? "٠١٢٣٤٥٦٧٨٩".indexOf(char) : "۰۱۲۳۴۵۶۷۸۹".indexOf(char)));
const phone = z.string().trim().max(30).transform(value => digits(value).replace(/[\s()-]/g, "")).refine(value => !value || /^\+?\d{8,15}$/.test(value), "أدخل رقم جوال صحيح أو اتركه فارغًا");
export function isGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    return (url.hostname === "maps.app.goo.gl" && url.pathname.length > 1)
      || (url.hostname === "goo.gl" && url.pathname.startsWith("/maps/"))
      || (["google.com", "www.google.com", "google.com.sa", "www.google.com.sa", "maps.google.com", "maps.google.com.sa"].includes(url.hostname)
        && (url.pathname === "/maps" || url.pathname.startsWith("/maps/") || url.hostname.startsWith("maps.")));
  } catch { return false; }
}
export const visitSchema = z.object({
  requestId: z.string().uuid(),
  brandName: z.string().trim().min(2, "اكتب اسم العلامة").max(150),
  representativeName: z.string().trim().min(2, "اكتب اسم المندوب").max(120),
  managerPhone: phone,
  ownerPhone: phone,
  interest: z.enum(["interested", "not_interested"], { error: "حدد اهتمام العلامة" }),
  services: z.array(z.enum(["menu", "loyalty", "accounting", "other"])).max(4).transform(value => [...new Set(value)]),
  otherService: z.string().trim().max(500),
  locationMode: z.enum(["gps", "link"]),
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
  mapsUrl: z.string().trim().max(2048),
  website: z.string().max(0),
}).superRefine((value, ctx) => {
  if (value.interest === "interested" && !value.services.length) ctx.addIssue({ code: "custom", path: ["services"], message: "اختر خدمة واحدة على الأقل" });
  if (value.interest === "interested" && value.services.includes("other") && !value.otherService) ctx.addIssue({ code: "custom", path: ["otherService"], message: "اكتب الخدمة الأخرى" });
  if (value.locationMode === "gps" && (value.latitude === null || value.longitude === null)) ctx.addIssue({ code: "custom", path: ["location"], message: "حدد موقع الفرع أو استخدم رابط قوقل ماب" });
  if (value.locationMode === "link" && !isGoogleMapsUrl(value.mapsUrl)) ctx.addIssue({ code: "custom", path: ["mapsUrl"], message: "أدخل رابط قوقل ماب صحيح يبدأ بـ https" });
}).transform(value => ({ ...value,
  services: value.interest === "interested" ? value.services : [],
  otherService: value.interest === "interested" && value.services.includes("other") ? value.otherService : "",
  latitude: value.locationMode === "gps" ? value.latitude : null,
  longitude: value.locationMode === "gps" ? value.longitude : null,
  mapsUrl: value.locationMode === "link" ? value.mapsUrl : "",
}));
export type VisitInput = z.output<typeof visitSchema>;
