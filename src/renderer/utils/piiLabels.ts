import { FINDING_SENSITIVITY_ORDER } from "@shared/types";
import type { PiiType } from "@shared/types";

// Display order wherever findings are listed: most sensitive first, so a card
// number never sits below a postal code.
export const PII_TYPES: PiiType[] = [...FINDING_SENSITIVITY_ORDER];

// One word each, so the type column reads as a single vocabulary. "ID" carries
// national identity numbers (BSN, NIR): "National" alone means nothing, and the
// company it keeps here (Card, IBAN, Phone) makes the short form clear.
export const PII_LABELS: Record<PiiType, string> = {
  credit_card: "Card",
  iban: "IBAN",
  national_id: "ID",
  phone: "Phone",
  address: "Address",
  postal_code: "Postal",
  email: "Email",
  date_of_birth: "Date of birth",
};
