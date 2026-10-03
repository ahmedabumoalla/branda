export const runtime = "nodejs";
export async function POST() {
  // Device diagnostics can contain pass credentials and personal data. Acknowledge without storing them.
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
}
