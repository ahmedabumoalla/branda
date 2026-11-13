import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createWalletArtifactCache } from "./artifact-cache";
import { MQAS77_WALLET_VERSION } from "./mqas77-design";

const cached = createWalletArtifactCache(4 * 1024 * 1024, 12, 300_000);

export function mqas77Emblem() {
  return cached(`${MQAS77_WALLET_VERSION}:emblem`, async () => sharp(await readFile(path.join(process.cwd(), "public/mqas77/wallet-emblem-v1.png")))
    .resize(512, 512, { fit: "contain", background: "#00000000" }).png().toBuffer());
}

/** Circular Google logo mask: the entire mark sits within the central 70% square. */
export function mqas77GoogleLogo() {
  return cached(`${MQAS77_WALLET_VERSION}:google-logo`, async () => sharp({ create: { width: 660, height: 660, channels: 4, background: "#080808" } })
    .composite([{ input: await sharp(await mqas77Emblem()).resize(462, 462).toBuffer(), left: 99, top: 99 }]).png().toBuffer());
}
