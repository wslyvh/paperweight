import { isValidEmail } from "@/utils/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("Resend API key not found");
      return new Response("Newsletter service unavailable", { status: 503 });
    }

    const { email } = await request.json();
    if (!email || typeof email !== "string" || !isValidEmail(email)) {
      return new Response("Invalid email", { status: 400 });
    }
    // Create or get contact
    const contactResponse = await fetch("https://api.resend.com/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
      }),
    });

    const segmentId = process.env.RESEND_SEGMENT_ID;

    if (!contactResponse.ok) {
      const error = await contactResponse.text();
      console.error("Resend API error:", contactResponse.status, error);

      // Handle duplicate email case (usually 422 or 409)
      if (contactResponse.status === 422 || contactResponse.status === 409) {
        // Contact already exists, try to add to segment if configured
        if (segmentId) {
          const addToSegmentResponse = await fetch(
            `https://api.resend.com/contacts/${encodeURIComponent(
              email,
            )}/segments/${segmentId}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
            },
          );
          // Ignore errors - contact might already be in segment
          if (!addToSegmentResponse.ok) {
            console.info("Contact may already be in segment");
          }
        }
        return Response.json(
          { message: "This email is already subscribed" },
          { status: 409 },
        );
      }

      return new Response("Failed to subscribe", { status: 500 });
    }

    const contactData = await contactResponse.json();
    const contactId = contactData.id || contactData.data?.id;

    // Add contact to segment if segment ID is configured
    if (segmentId) {
      const segmentEndpoint = contactId
        ? `https://api.resend.com/contacts/${contactId}/segments/${segmentId}`
        : `https://api.resend.com/contacts/${encodeURIComponent(
            email,
          )}/segments/${segmentId}`;

      const segmentResponse = await fetch(segmentEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!segmentResponse.ok) {
        // Log but don't fail - contact was created successfully
        console.warn(
          "Failed to add contact to segment:",
          segmentResponse.status,
        );
      }
    }

    return Response.json({ message: "Successfully subscribed!" });
  } catch (err) {
    console.error("ERROR: Newsletter subscription", err);
    return new Response("Subscription failed", { status: 500 });
  }
}
