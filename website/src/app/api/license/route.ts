export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const polarApiKey = process.env.POLAR_API_KEY;
    const organizationId = process.env.POLAR_ORGANIZATION_ID;
    if (!polarApiKey || !organizationId) {
      return new Response("License service unavailable", { status: 503 });
    }

    const { license_key } = await request.json();
    if (!license_key || typeof license_key !== "string") {
      return new Response("Invalid license key", { status: 400 });
    }

    // Validate license key
    const response = await fetch(
      "https://api.polar.sh/v1/license-keys/validate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${polarApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: license_key,
          organization_id: organizationId,
        }),
      },
    );

    if (!response.ok) {
      console.error("Polar API error:", response.status);
      return Response.json(
        { valid: false, error: "Validation failed" },
        { status: response.status },
      );
    }

    const data = await response.json();

    // Check expiration
    const now = new Date();
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    const isExpired = expiresAt ? expiresAt < now : false;
    const isValid = data.status === "granted" && !isExpired;

    return Response.json({
      valid: isValid,
      expires_at: data.expires_at, // ISO string or null
      status: data.status, // 'granted' or 'revoked'
      is_expired: isExpired,
      tier: data.expires_at ? "test" : "lifetime",
    });
  } catch (error) {
    console.error("Validation error:", error);
    return Response.json(
      { valid: false, error: "Server error" },
      { status: 500 },
    );
  }
}
