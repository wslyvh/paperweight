export const runtime = "nodejs";

interface PolarValidateResponse {
  status?: string;
  expires_at?: string | null;
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
  const expiresAt =
    typeof v.expires_at === "string" || v.expires_at === null
      ? (v.expires_at as string | null)
      : undefined;
  const customerId =
    typeof v.customer_id === "string" ? v.customer_id : undefined;

  return { status, expires_at: expiresAt, customer_id: customerId };
}

async function createCustomerPortalUrl(
  polarApiKey: string,
  customerId: string,
): Promise<string | undefined> {
  try {
    const response = await fetch("https://api.polar.sh/v1/customer-sessions/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${polarApiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
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
        headers: {
          Authorization: `Bearer ${polarApiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          key: key,
          organization_id: organizationId,
        }),
      },
    );

    const responseText = await response.text();
    const details =
      responseText.length > 0
        ? (safeParseJson(responseText) ?? responseText)
        : undefined;

    if (!response.ok) {
      // Treat common "invalid key" failures as a normal (non-throwing) result.
      // Everything else is a service/config problem (bad token, wrong org id, etc.)
      if (response.status === 404 || response.status === 422) {
        return Response.json({ valid: false, details }, { status: 200 });
      }

      console.error("Polar API error:", response.status, details);
      return Response.json(
        { valid: false, error: "License validation failed", details },
        { status: 502 },
      );
    }

    const parsed =
      responseText.length > 0 ? safeParseJson(responseText) : undefined;
    const data = asPolarValidateResponse(parsed);
    const status = data.status;
    const expiresAtRaw = data.expires_at ?? undefined;

    // Check expiration
    const now = new Date();
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    const isExpired = expiresAt ? expiresAt < now : false;
    const isValid = status === "granted" && !isExpired;

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
      tier: expiresAtRaw ? "test" : "lifetime",
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
