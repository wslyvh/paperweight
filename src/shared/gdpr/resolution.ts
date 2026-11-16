import type { LanguageOption } from "./types";

export const LANGUAGES: Record<string, LanguageOption> = {
  en: { label: "English", flag: "🇬🇧" },
  nl: { label: "Dutch", flag: "🇳🇱" },
  de: { label: "German", flag: "🇩🇪" },
  fr: { label: "French", flag: "🇫🇷" },
  es: { label: "Spanish", flag: "🇪🇸" },
  it: { label: "Italian", flag: "🇮🇹" },
  pt: { label: "Portuguese", flag: "🇵🇹" },
};

const TLD_LANG_CODES = new Set(
  Object.keys(LANGUAGES).filter((code) => code !== "en"),
);

export function detectLanguageFromDomain(domain?: string) {
  if (!domain) return "en";
  const tld = domain.split(".").pop()?.toLowerCase() ?? "";
  return TLD_LANG_CODES.has(tld) ? tld : "en";
}
