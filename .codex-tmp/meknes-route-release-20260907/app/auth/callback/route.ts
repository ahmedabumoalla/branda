import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PASSWORD_RECOVERY_COOKIE = "barndaksa_password_recovery";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const response = NextResponse.redirect(`${origin}${next}`);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && next === "/auth/update-password") {
      response.cookies.set(PASSWORD_RECOVERY_COOKIE, "1", {
        httpOnly: true,
        maxAge: 15 * 60,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
  }

  return response;
}
