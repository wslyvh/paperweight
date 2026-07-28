import { isSupportedCountry } from "libphonenumber-js";

export function normalizeCountryCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isSupportedCountryCode(value: string): boolean {
  const country = normalizeCountryCode(value);
  return /^[A-Z]{2}$/.test(country) && isSupportedCountry(country);
}
