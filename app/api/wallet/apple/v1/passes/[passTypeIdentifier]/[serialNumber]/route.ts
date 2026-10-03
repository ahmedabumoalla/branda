import { downloadUpdatedApplePass, walletServiceUnavailable } from "@/lib/wallet/webservice";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ passTypeIdentifier: string; serialNumber: string }> };
export async function GET(request: Request, context: Context) {
  const p = await context.params;
  try { return await downloadUpdatedApplePass(request, p.passTypeIdentifier, p.serialNumber); } catch { return walletServiceUnavailable(); }
}
