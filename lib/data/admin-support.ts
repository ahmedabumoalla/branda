import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/data/cafes";

export type AdminSupportTicket = {
  id: string;
  cafeName: string;
  cafeCode: string;
  requesterName: string;
  requesterPhone: string;
  requesterEmail?: string | null;
  message: string;
  status: string;
  createdAt: string;
};

export async function getAdminSupportTickets(): Promise<AdminSupportTicket[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_support_tickets")
    .select("id, requester_name, requester_phone, requester_email, message, status, created_at, cafes(name, public_code)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const cafe = row.cafes as unknown as { name?: string; public_code?: string } | null;
    return {
      id: String(row.id),
      cafeName: cafe?.name ?? "غير مرتبط",
      cafeCode: cafe?.public_code ?? "بدون رقم",
      requesterName: String(row.requester_name ?? ""),
      requesterPhone: String(row.requester_phone ?? ""),
      requesterEmail: row.requester_email ? String(row.requester_email) : null,
      message: String(row.message ?? ""),
      status: String(row.status ?? "open"),
      createdAt: String(row.created_at ?? ""),
    };
  });
}
