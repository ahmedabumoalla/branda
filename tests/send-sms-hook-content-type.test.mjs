import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";

const HOOK_SECRET_BYTES = Buffer.from(
  "branda-send-sms-hook-content-type-test",
  "utf8",
);
const HOOK_SECRET = `v1,whsec_${HOOK_SECRET_BYTES.toString("base64")}`;
const ALLOWED_PHONE = "966551234567";

async function listenOnRandomPort(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  return address.port;
}

async function waitForNextServer(url, process) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Next.js test server exited with code ${process.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.status === 405) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the Next.js test server");
}

function signedHeaders(rawBody) {
  const webhookId = "send-sms-content-type-test";
  const webhookTimestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", HOOK_SECRET_BYTES)
    .update(`${webhookId}.${webhookTimestamp}.${rawBody}`)
    .digest("base64");

  return {
    "content-type": "application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": webhookTimestamp,
    "webhook-signature": `v1,${signature}`,
  };
}

test("Send SMS Hook returns JSON on success and preserves method/auth errors", async (t) => {
  const greenApi = createServer((request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ idMessage: "test-message-id" }));
  });
  const greenPort = await listenOnRandomPort(greenApi);

  const portProbe = createServer();
  const nextPort = await listenOnRandomPort(portProbe);
  await new Promise((resolve, reject) =>
    portProbe.close((error) => (error ? reject(error) : resolve())),
  );

  const nextProcess = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", String(nextPort)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SUPABASE_SEND_SMS_HOOK_SECRET: HOOK_SECRET,
        GREEN_API_API_URL: `http://127.0.0.1:${greenPort}`,
        GREEN_API_ID_INSTANCE: "test-instance",
        GREEN_API_API_TOKEN_INSTANCE: "test-token",
        GREEN_API_REQUEST_TIMEOUT_MS: "2000",
        PHONE_OTP_TEST_MODE: "true",
        PHONE_OTP_ALLOWED_PHONES: ALLOWED_PHONE,
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );

  t.after(async () => {
    nextProcess.kill();
    await new Promise((resolve) => greenApi.close(resolve));
  });

  const hookUrl = `http://127.0.0.1:${nextPort}/api/auth/hooks/send-sms`;
  await waitForNextServer(hookUrl, nextProcess);

  const rawBody = JSON.stringify({
    user: { phone: `+${ALLOWED_PHONE}` },
    sms: { otp: "123456" },
  });
  const success = await fetch(hookUrl, {
    method: "POST",
    headers: signedHeaders(rawBody),
    body: rawBody,
  });

  assert.equal(success.status, 200);
  assert.match(success.headers.get("content-type") ?? "", /application\/json/i);
  assert.deepEqual(await success.json(), {});

  const invalidSignature = await fetch(hookUrl, {
    method: "POST",
    headers: {
      ...signedHeaders(rawBody),
      "webhook-signature": "v1,invalid",
    },
    body: rawBody,
  });
  assert.equal(invalidSignature.status, 401);

  const getResponse = await fetch(hookUrl);
  assert.equal(getResponse.status, 405);
});
