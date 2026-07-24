import { FINDING_SENSITIVITY_ORDER } from "@shared/types";
import type { PiiType } from "@shared/types";

// Display order wherever findings are listed: most sensitive first, so a card
// number never sits below a postal code.
export const PII_TYPES: PiiType[] = [...FINDING_SENSITIVITY_ORDER];

export const PII_LABELS: Record<PiiType, string> = {
  credit_card: "Card number",
  iban: "IBAN",
  national_id: "National ID",
  phone: "Phone number",
  address: "Address",
  postal_code: "Postal code",
  email: "Email address",
};
