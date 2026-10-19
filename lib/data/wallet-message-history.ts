import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { messageHistoryInputSchema, messageHistoryPageSchema, messageHistoryPageSize, walletProviderStatus, type MessageHistoryInput } from "@/lib/loyalty/message-history";

export class MessageHistoryAccessError extends Error {}

export async function getWalletMessageHistory(input: MessageHistoryInput) {
  const filters = messageHistoryInputSchema.parse(input);
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) throw new MessageHistoryAccessError("Message history access denied");
  const { data: profile, error: profileError } = await session.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profileError || profile?.status !== "active") throw new MessageHistoryAccessError("Message history access denied");
  // A supplied brand is exclusively an active platform-admin operation.
  if (filters.brandId && profile.role !== "platform_admin") throw new MessageHistoryAccessError("Message history access denied");
  const cafeId = filters.brandId ?? (await requireOwnerCafeContext()).id;
  const db = createAdminClient();
  const { data: cafe, error: cafeError } = await db.from("cafes").select("id,owner_user_id").eq("id", cafeId).is("deleted_at", null).maybeSingle();
  if (cafeError || !cafe) throw new MessageHistoryAccessError("Message history access denied");
  if (profile.role !== "platform_admin" && cafe.owner_user_id !== user.id) {
    const { data: member, error: memberError } = await db.from("cafe_members").select("role").eq("cafe_id", cafeId).eq("user_id", user.id).maybeSingle();
    if (memberError || !member || !["owner", "manager"].includes(member.role)) throw new MessageHistoryAccessError("Message history access denied");
  }
  // The private queue stays inaccessible to browser clients. Return only display fields.
  const { data, count, error } = await db.from("wallet_notification_jobs")
    .select("id,title,body,status,delivery_state,created_at,updated_at", { count: "exact" })
    .eq("cafe_id", cafeId).eq("kind", "message")
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(filters.page * messageHistoryPageSize, (filters.page + 1) * messageHistoryPageSize - 1);
  if (error || count === null) throw new Error("Message history unavailable");
  return messageHistoryPageSchema.parse({ page: filters.page, total: count, messages: (data ?? []).map(row => ({
    id: row.id, title: row.title, body: row.body, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
    apple: walletProviderStatus(row.delivery_state?.apple), google: walletProviderStatus(row.delivery_state?.google),
  })) });
}
