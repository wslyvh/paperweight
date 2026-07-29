import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { FindingType } from "./contracts";
import { normalizeAddress } from "./detect/address";
import {
  isValidCardNumber,
  normalizeCardNumber,
} from "./detect/credit-card";
import { detectEmails } from "./detect/email";
import { isValidIban, normalizeIban } from "./detect/iban";
import {
  detectPostalCodes,
  normalizePostalCode,
} from "./detect/postal-code";

export { extractKnownAddressComponents } from "./detect/address";

function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(trimmed);
    if (parsed?.isValid()) return parsed.number;
    return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  }
  return trimmed.replace(/\D/g, "");
}

function validateEmail(value: string): boolean {
  const findings = detectEmails(value);
  return (
    findings.length === 1
    && findings[0]?.start === 0
    && findings[0]?.end === value.length
  );
}

function validatePhone(raw: string, normalized: string): boolean {
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  if (!raw.trim().startsWith("+")) return true;
  return parsePhoneNumberFromString(raw.trim())?.isValid() === true;
}

function validatePostalCode(raw: string): boolean {
  const value = raw.trim().toUpperCase();
  const { candidates } = detectPostalCodes(value);
  return candidates.some((candidate) => (
    candidate.start === 0 && candidate.end === value.length
  ));
}

function normalizeCreditCard(value: string): string {
  const trimmed = value.trim();
  const masked = trimmed.match(/^(?:\*{2,4}[ -]?){1,3}(\d{4})$/);
  return masked ? `****${masked[1]}` : normalizeCardNumber(trimmed);
}

export function normalizeValue(type: FindingType, raw: string): string {
  switch (type) {
    case "email":
      return raw.trim().toLowerCase();
    case "phone":
      return normalizePhone(raw);
    case "address":
      return normalizeAddress(raw);
    case "postal_code":
      return normalizePostalCode(raw.trim().toUpperCase());
    case "national_id":
      return raw.trim().toUpperCase().replace(/\s/g, "");
    case "iban":
      return normalizeIban(raw.trim());
    case "credit_card":
      return normalizeCreditCard(raw);
  }
}

export function validateValue(type: FindingType, raw: string): boolean {
  const normalized = normalizeValue(type, raw);
  switch (type) {
    case "email":
      return validateEmail(normalized);
    case "phone":
      return validatePhone(raw, normalized);
    case "address":
      return normalized.length > 0;
    case "postal_code":
      return validatePostalCode(raw);
    case "national_id":
      return (
        normalized.length >= 4
        && /^[A-Z0-9]+$/.test(normalized)
      );
    case "iban":
      return /^[A-Za-z0-9 .]+$/.test(raw) && isValidIban(normalized);
    case "credit_card":
      return (
        /^\*{4}\d{4}$/.test(normalized)
        || (/^[\d -]+$/.test(raw) && isValidCardNumber(normalized))
      );
  }
}
