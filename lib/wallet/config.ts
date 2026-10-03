import "server-only";
import { createPrivateKey, X509Certificate } from "node:crypto";

export function walletBaseUrl() {
  const value = process.env.WALLET_PUBLIC_BASE_URL;
  if (!value) throw new Error("wallet_not_configured");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("wallet_not_configured");
  return url.origin;
}

export function pem(name: string) {
  const value = process.env[name]?.replace(/\\n/g, "\n");
  if (!value) throw new Error("wallet_not_configured");
  return value;
}

export function appleConfig() {
  const passTypeIdentifier = process.env.APPLE_WALLET_PASS_TYPE_ID;
  const teamIdentifier = process.env.APPLE_WALLET_TEAM_ID;
  const secret = process.env.WALLET_AUTH_SECRET;
  if (!passTypeIdentifier?.startsWith("pass.") || !teamIdentifier || !secret || secret.length < 32) {
    throw new Error("wallet_not_configured");
  }
  const signerCert = pem("APPLE_WALLET_SIGNER_CERT_PEM");
  const signerKey = pem("APPLE_WALLET_SIGNER_KEY_PEM");
  const wwdr = pem("APPLE_WALLET_WWDR_CERT_PEM");
  const signerKeyPassphrase = process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE;
  const cert = new X509Certificate(signerCert);
  const key = createPrivateKey({ key: signerKey, passphrase: signerKeyPassphrase });
  const now = Date.now();
  if (!cert.checkPrivateKey(key) || Date.parse(cert.validTo) <= now || Date.parse(cert.validFrom) > now || !cert.subject.includes(passTypeIdentifier) || !cert.subject.includes(teamIdentifier)) throw new Error("wallet_not_configured");
  const intermediate = new X509Certificate(wwdr);
  if (Date.parse(intermediate.validTo) <= now || !cert.verify(intermediate.publicKey)) throw new Error("wallet_not_configured");
  return { passTypeIdentifier, teamIdentifier, secret, signerCert, signerKey, wwdr, signerKeyPassphrase, baseUrl: walletBaseUrl() };
}

export function googleConfig() {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const existingClass = process.env.GOOGLE_WALLET_RAST_CLASS_ID;
  const email = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
  const key = pem("GOOGLE_WALLET_PRIVATE_KEY_PEM");
  if (!issuerId || !/^\d+$/.test(issuerId) || !email?.endsWith(".iam.gserviceaccount.com") || !process.env.WALLET_AUTH_SECRET || process.env.WALLET_AUTH_SECRET.length < 32) throw new Error("wallet_not_configured");
  if (existingClass && (!existingClass.startsWith(`${issuerId}.`) || !/^[a-zA-Z0-9._-]{1,200}$/.test(existingClass))) throw new Error("wallet_not_configured");
  if (createPrivateKey(key).asymmetricKeyType !== "rsa") throw new Error("wallet_not_configured");
  return { issuerId, email, key, baseUrl: walletBaseUrl() };
}

export function getWalletReadiness() {
  let apple = false;
  let google = false;
  try { appleConfig(); apple = true; } catch { /* Missing or invalid signing configuration. */ }
  try { googleConfig(); google = process.env.GOOGLE_WALLET_PUBLISHING_APPROVED === "true"; } catch { /* Publishing approval is separate from valid signing credentials. */ }
  return { apple, google };
}
