import type { LicenseTier } from "@shared/license";

export const runtime = "nodejs";

const POLAR_API_VERSION = "2026-10";

interface LicenseBenefit {
  tier: LicenseTier;
  requiresExpiry: boolean;
}

const LICENSE_BENEFITS: Record<string, LicenseBenefit> = {
  // Polar omits expiry for subscription grants; one-time crypto grants use TTL.
  "d117b32b-f60e-4739-908b-ffc36e2cc523": {
    tier: "pro",
    requiresExpiry: false,
  },
  "26df0e3e-07fe-4f23-9bf4-2ee387e2c6b4": {
    tier: "cleanup",
    requiresExpiry: true,
  },
  "19517682-fe41-46e4-b1e7-97d0c8c8607a": {
    tier: "lifetime",
    requiresExpiry: false,
  },
  "be8f9c70-8a07-4e51-9d56-932e52bd9631": {
    tier: "pro",
    requiresExpiry: true,
  },
};

interface PolarValidateResponse {
  status?: string;
  expires_at?: string;
  benefit_id?: string;
  customer_id?: string;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function asPolarValidateResponse(value: unknown): PolarValidateResponse {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;

  const status = typeof v.status === "string" ? v.status : undefined;
  const expiresAt = typeof v.expires_at === "string" ? v.expires_at : undefined;
  const benefitId = typeof v.benefit_id === "string" ? v.benefit_id : undefined;
  const customerId =
    typeof v.customer_id === "string" ? v.customer_id : undefined;

  return {
    status,
    expires_at: expiresAt,
    customer_id: customerId,
    benefit_id: benefitId,
  };
}

function polarHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Polar-Version": POLAR_API_VERSION,
  };
}

async function createCustomerPortalUrl(
  polarApiKey: string,
  customerId: string,
): Promise<string | undefined> {
  try {
    const response = await fetch("https://api.polar.sh/v1/customer-sessions/", {
      method: "POST",
      headers: polarHeaders(polarApiKey),
      body: JSON.stringify({ customer_id: customerId }),
    });

    if (!response.ok) return undefined;

    const result = (await response.json()) as {
      customer_portal_url?: string;
    };
    return result.customer_portal_url;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  try {
    const polarApiKey = process.env.POLAR_API_KEY;
    const organizationId = process.env.POLAR_ORGANIZATION_ID;
    if (!polarApiKey || !organizationId) {
      return Response.json(
        { valid: false, error: "License service unavailable" },
        { status: 503 },
      );
    }

    const { key } = await request.json();
    if (!key || typeof key !== "string") {
      return Response.json(
        { valid: false, error: "Invalid license key" },
        { status: 400 },
      );
    }

    const response = await fetch(
      "https://api.polar.sh/v1/license-keys/validate",
      {
        method: "POST",
        headers: polarHeaders(polarApiKey),
        body: JSON.stringify({
          key: key,
          organization_id: organizationId,
        }),
      },
    );

    const responseText = await response.text();

    if (!response.ok) {
      // Treat common "invalid key" failures as a normal (non-throwing) result.
      // Everything else is a service/config problem (bad token, wrong org id, etc.)
      if (response.status === 404 || response.status === 422) {
        return Response.json({ valid: false }, { status: 200 });
      }

      console.error("Polar API error:", response.status);
      return Response.json(
        { valid: false, error: "License validation failed" },
        { status: 502 },
      );
    }

    const parsed =
      responseText.length > 0 ? safeParseJson(responseText) : undefined;
    const data = asPolarValidateResponse(parsed);
    const status = data.status;
    const expiresAtRaw = data.expires_at ?? undefined;

    const benefit =
      data.benefit_id && Object.hasOwn(LICENSE_BENEFITS, data.benefit_id)
        ? LICENSE_BENEFITS[data.benefit_id]
        : undefined;
    const isExpired =
      expiresAtRaw !== undefined && !(Date.parse(expiresAtRaw) > Date.now());
    // Paid time-limited plans must never become permanent if Polar omits expiry.
    const missingExpiry = benefit?.requiresExpiry && !expiresAtRaw;
    const isValid =
      status === "granted" && !!benefit && !isExpired && !missingExpiry;

    // Generate customer portal URL if valid
    let portalUrl: string | undefined;
    if (isValid && data.customer_id) {
      portalUrl = await createCustomerPortalUrl(polarApiKey, data.customer_id);
    }

    return Response.json({
      valid: isValid,
      expiresAt: expiresAtRaw, // ISO string (if present)
      status, // 'granted' or 'revoked'
      isExpired,
      tier: benefit?.tier,
      portalUrl,
    });
  } catch (error) {
    console.error("Validation error:", error);
    return Response.json(
      { valid: false, error: "Server error" },
      { status: 500 },
    );
  }
}
