import "server-only";
import { getActiveUser } from "@/lib/auth/active-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Bind only verified matching identities; the database persists the binding so
 * opening the original scanner cannot bypass a finance employee's restrictions. */
export async function enforceFinanceLoyaltySession(token: string): Promise<boolean> {
  const client = await createClient();
  const user = await getActiveUser(client);
  if (user) {
    const bound = await client.rpc("brand_finance_bind_loyalty_session", { p_session_token: token });
    if (bound.error) throw new Error("استخدم حساب كاشير الولاء المرتبط برقم جوالك نفسه وتحقق من صلاحيات الولاء");
  }
  const checked = await createAdminClient().rpc("brand_finance_loyalty_session_guard", { p_session_token: token });
  if (checked.error || checked.data?.allowed === false) throw new Error("لا تملك صلاحية الاطلاع على الولاء بهذه الجلسة");
  return checked.data?.linked === true;
}
