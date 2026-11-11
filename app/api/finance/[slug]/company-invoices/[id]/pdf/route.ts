import { z } from "zod";
import { readIssuedCompanyInvoice, issuedCompanyInvoicePdf } from "@/lib/data/company-invoices";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404 });
  try {
    const invoice = await readIssuedCompanyInvoice(slug, id);
    if (!invoice) return new Response(null, { status: 404 });
    const pdf = await issuedCompanyInvoicePdf(invoice);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="invoice-${invoice.number}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 403 }); }
}
