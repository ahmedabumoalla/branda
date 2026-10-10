import { z } from "zod";
import { engagementKinds } from "./brand-analytics";
import type { CustomerDevice } from "./customer-intelligence";
export const customerUsageInput = z.object({
    slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), kind: z.enum(engagementKinds), sessionId: z.string().uuid(), seconds: z.number().int().min(0).max(21600),
}).strict();
/** Browsers conceal exact handset models, so never guess them. */
export function customerDevice(userAgent: string): CustomerDevice {
    const ua = userAgent.slice(0, 1024);
    const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "غير معروف";
    const type = /iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "tablet" : /iPhone|iPod|Android|Mobile/.test(ua) ? "mobile" : /Windows|Macintosh|Linux/.test(ua) ? "desktop" : "unknown";
    const name = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : os === "Android" ? "جهاز Android" : type === "desktop" ? "حاسوب" : "جهاز غير معروف";
    const browser = /Edg/.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "غير معروف";
    return { type, name, os, browser };
}
export function activeInterval(from: number, to: number, lastInteraction: number, engaged: boolean) {
    return engaged ? Math.max(0, Math.min(to, lastInteraction + 60000) - from) : 0;
}
