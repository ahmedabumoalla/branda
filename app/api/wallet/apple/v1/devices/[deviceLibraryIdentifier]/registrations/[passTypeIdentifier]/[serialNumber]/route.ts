import { registerAppleDevice, unregisterAppleDevice, walletServiceUnavailable } from "@/lib/wallet/webservice";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string; serialNumber: string }> };
export async function POST(request: Request, context: Context) {
  const p = await context.params;
  try { return await registerAppleDevice(request, p.deviceLibraryIdentifier, p.passTypeIdentifier, p.serialNumber); } catch { return walletServiceUnavailable(); }
}
export async function DELETE(request: Request, context: Context) {
  const p = await context.params;
  try { return await unregisterAppleDevice(request, p.deviceLibraryIdentifier, p.passTypeIdentifier, p.serialNumber); } catch { return walletServiceUnavailable(); }
}
