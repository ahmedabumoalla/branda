import { createAldeemSalesInvoicePreviewPdf, readAldeemSalesInvoicePreview } from "@/lib/data/aldeem-invoice-preview";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (slug !== "khayal-aldeem") return new Response(null, { status: 404 });
  try {
    const preview = await readAldeemSalesInvoicePreview(id, slug);
    const pdf = await createAldeemSalesInvoicePreviewPdf(preview);
    const number = preview.invoice?.number ?? preview.receipt!.number;
    return new Response(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="invoice-${number}.pdf"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new Response(null, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
}
