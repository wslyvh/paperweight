export function hasBulkHeaders(headersJson: string): boolean {
  try {
    const headers = JSON.parse(headersJson) as Record<string, string>;
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === "string") lower[k.toLowerCase()] = v;
    }

    // RFC 3834: auto-submitted auto-replies (out-of-office, vacation responders)
    // are never bulk marketing — bail immediately before any other check.
    const autoSubmitted = (lower["auto-submitted"] || lower["x-auto-submitted"] || "").toLowerCase();
    if (autoSubmitted.startsWith("auto-")) return false;

    if (lower["list-unsubscribe"]) return true;
    if (lower["list-unsubscribe-post"]) return true;
    if (lower["list-id"]) return true;

    const precedence = (lower["precedence"] || "").toLowerCase();
    if (
      precedence === "bulk" ||
      precedence === "list" ||
      precedence === "auto" ||
      precedence === "junk"
    )
      return true;

    // ESP-specific headers — present on bulk sends even without List-Unsubscribe.
    // Klaviyo, SendGrid, Mailchimp etc. inject these on every campaign message.
    const espHeaders = [
      "x-mailer-recptid",       // Klaviyo
      "x-klavio-id",            // Klaviyo (typo variant seen in the wild)
      "x-klaviyo",              // Klaviyo
      "x-sg-id",                // SendGrid
      "x-sg-eid",               // SendGrid
      "x-smtpapi",              // SendGrid legacy
      "x-mailchimp-id",         // Mailchimp
      "x-mc-user",              // Mailchimp
      "x-campaign-id",          // Generic ESP campaign header
      "x-mailgun-tag",          // Mailgun
      "x-brevo-id",             // Brevo (formerly Sendinblue)
      "x-sib-id",               // Brevo
      "x-amazon-ses",           // Amazon SES
      "x-ses-message-id",       // Amazon SES
      "x-iterable-id",          // Iterable
      "x-iterable",             // Iterable
      "x-hubspot-msgid",        // HubSpot
      "x-pardot-id",            // Pardot/Salesforce
      "x-marketo-id",           // Marketo
      "x-eloqua-id",            // Eloqua
      "x-cm-mmlid",             // Campaign Monitor
      "x-drip",                 // Drip
      "x-customer-io-id",       // Customer.io
      "x-postmark-msgid",       // Postmark (transactional, but indicates automated send)
    ];
    if (espHeaders.some((h) => lower[h] !== undefined)) return true;

    return false;
  } catch {
    return false;
  }
}

export function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

const COMPOUND_TLDS = new Set([
  "co.uk", "org.uk", "me.uk", "ac.uk",
  "com.au", "net.au", "org.au",
  "co.nz", "co.za", "co.in", "co.jp", "co.kr",
  "com.br", "com.mx", "com.ar", "com.co",
  "com.tr", "com.sg", "com.hk", "com.tw",
]);

export function getRootDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;
  const lastTwo = parts.slice(-2).join(".");
  if (COMPOUND_TLDS.has(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}
