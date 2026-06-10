type PaypalTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type PaypalOrderAmount = {
  currency_code: string;
  value: string;
};

type PaypalOrderResponse = {
  id?: string;
  status?: string;
  links?: Array<{ href: string; rel: string; method: string }>;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: PaypalOrderAmount;
      }>;
    };
  }>;
  message?: string;
  name?: string;
  details?: unknown;
};

export type PaypalCaptureResult = {
  orderId: string;
  captureId: string;
  status: string;
  amount: number;
  currency: string;
};

const PAYPAL_API = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

function getPaypalEnv() {
  const env = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();

  if (!clientId) throw new Error("PAYPAL_CLIENT_ID is missing");
  if (!clientSecret) throw new Error("PAYPAL_CLIENT_SECRET is missing");

  return {
    env,
    clientId,
    clientSecret,
    baseUrl: PAYPAL_API[env],
  };
}

export function isPaypalConfigured() {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID?.trim() &&
      process.env.PAYPAL_CLIENT_SECRET?.trim() &&
      process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim()
  );
}

export function getPaypalPublicClientId() {
  return process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() ?? "";
}

export function getPaypalCurrency() {
  return (process.env.PAYPAL_CURRENCY?.trim().toUpperCase() || "USD");
}

export function getUsdSarRate() {
  const rate = Number(process.env.PAYPAL_USD_SAR_RATE ?? 3.75);
  return Number.isFinite(rate) && rate > 0 ? rate : 3.75;
}

export function sarToPaypalCurrencyAmount(amountSar: number) {
  const currency = getPaypalCurrency();

  if (currency === "SAR") {
    return {
      currency,
      value: amountSar.toFixed(2),
      rate: 1,
    };
  }

  if (currency === "USD") {
    const rate = getUsdSarRate();
    return {
      currency,
      value: (amountSar / rate).toFixed(2),
      rate,
    };
  }

  throw new Error(`Unsupported PAYPAL_CURRENCY ${currency}`);
}

async function getAccessToken() {
  const { baseUrl, clientId, clientSecret } = getPaypalEnv();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const payload = (await response.json().catch(() => ({}))) as PaypalTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(`PayPal token failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload.access_token;
}

export async function createPaypalSubscriptionOrder(input: {
  subscriptionId: string;
  cafeName: string;
  planName: string;
  amountSar: number;
  returnUrl?: string;
  cancelUrl?: string;
}) {
  const { baseUrl } = getPaypalEnv();
  const token = await getAccessToken();
  const amount = sarToPaypalCurrencyAmount(input.amountSar);

  const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `branda-sub-${input.subscriptionId}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.subscriptionId,
          custom_id: input.subscriptionId,
          description: `Branda subscription - ${input.planName}`.slice(0, 120),
          amount: {
            currency_code: amount.currency,
            value: amount.value,
            breakdown: {
              item_total: {
                currency_code: amount.currency,
                value: amount.value,
              },
            },
          },
          items: [
            {
              name: `Branda ${input.planName}`.slice(0, 120),
              quantity: "1",
              unit_amount: {
                currency_code: amount.currency,
                value: amount.value,
              },
              category: "DIGITAL_GOODS",
            },
          ],
        },
      ],
      application_context: {
        brand_name: "Branda",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as PaypalOrderResponse;

  if (!response.ok || !payload.id) {
    throw new Error(`PayPal create order failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return {
    id: payload.id,
    approveUrl: payload.links?.find((link) => link.rel === "approve")?.href ?? null,
    currency: amount.currency,
    value: amount.value,
    rate: amount.rate,
  };
}

export async function capturePaypalOrder(orderId: string): Promise<PaypalCaptureResult> {
  const { baseUrl } = getPaypalEnv();
  const token = await getAccessToken();

  const response = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `branda-cap-${orderId}`,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as PaypalOrderResponse;

  if (!response.ok) {
    throw new Error(`PayPal capture failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  const capture = payload.purchase_units?.[0]?.payments?.captures?.[0];

  if (!capture?.id || capture.status !== "COMPLETED") {
    throw new Error(`PayPal capture not completed: ${JSON.stringify(payload)}`);
  }

  return {
    orderId: payload.id ?? orderId,
    captureId: capture.id,
    status: capture.status,
    amount: Number(capture.amount?.value ?? 0),
    currency: capture.amount?.currency_code ?? getPaypalCurrency(),
  };
}
