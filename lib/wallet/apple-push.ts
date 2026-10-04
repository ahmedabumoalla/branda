import "server-only";
import { connect } from "node:http2";
import { appleConfig } from "./config";

export async function pushAppleDevice(pushToken: string) {
  if (!/^[a-f0-9]{32,256}$/i.test(pushToken)) throw new Error("apple_invalid_push_token");
  const config = appleConfig();
  return new Promise<void>((resolve, reject) => {
    const client = connect("https://api.push.apple.com", { cert: config.signerCert, key: config.signerKey, passphrase: config.signerKeyPassphrase });
    let settled = false;
    let status: number | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      client.destroy();
      if (error) reject(error); else resolve();
    };
    client.on("error", () => finish(new Error("apple_push_connection_failed")));
    client.setTimeout(15000, () => finish(new Error("apple_push_timeout")));
    // Wallet uses an empty dictionary and the pass certificate. Let APNs use
    // its normal immediate priority, instead of requesting power-saving delay.
    const request = client.request({ ":method": "POST", ":path": `/3/device/${pushToken}`, "apns-topic": config.passTypeIdentifier, "apns-priority": "10", "content-type": "application/json" });
    request.on("response", headers => { status = Number(headers[":status"]); });
    request.on("error", () => finish(new Error("apple_push_request_failed")));
    request.on("end", () => finish(status === 200 ? undefined : new Error(status ? `apple_push_${status}` : "apple_push_missing_response")));
    request.on("close", () => { if (!settled) finish(new Error("apple_push_incomplete_response")); });
    request.resume();
    request.end("{}");
  });
}
