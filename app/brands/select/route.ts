import { NextResponse } from "next/server";
import { getBrandManagement, managedBrandCookie } from "@/lib/brands/management";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
  const management = await getBrandManagement();
  if (!management) return new Response("Unauthorized", { status: 401 });
  const id = (await request.formData()).get("brandId");
  if (typeof id !== "string" || !management.brands.some(brand => brand.id === id)) return new Response("Forbidden", { status: 403 });
  const response = NextResponse.redirect(new URL("/dashboard/loyalty", origin), 303);
  response.cookies.set(managedBrandCookie, `${management.userId}:${id}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
