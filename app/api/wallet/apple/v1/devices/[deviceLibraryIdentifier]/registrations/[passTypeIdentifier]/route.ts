import { listAppleUpdates, walletServiceUnavailable } from "@/lib/wallet/webservice";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string }> };
export async function GET(request: Request, context: Context) {
  const p = await context.params;
  try { return await listAppleUpdates(request, p.deviceLibraryIdentifier, p.passTypeIdentifier); } catch { return walletServiceUnavailable(); }
}
