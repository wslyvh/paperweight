import type { Finding, KnownPiiValue } from "../types";
import { findDateOfBirth } from "./date-of-birth";
import { canOmitPostalCodeSeparator } from "./postal-code";

const ADDRESS_BOUNDARY = "\\p{L}\\p{N}";
const ADDRESS_SEPARATOR = `[^${ADDRESS_BOUNDARY}]+`;
const ADDRESS_COMPONENT_GAP_MAX = 100;
const ADDRESS_COMPONENT_NEWLINES_MAX = 2;

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const separated = (value: string, separator: string): string =>
  [...value].map(escapeRegex).join(separator);

function addressPatternSource(normalized: string): string | undefined {
  const words = normalized
    .split(/\s+/)
    .filter(Boolean);
  const [first, ...remaining] = words;
  if (!first) return undefined;

  let source = escapeRegex(first);
  let previous = first;
  for (const word of remaining) {
    const separator = canOmitPostalCodeSeparator(
      previous,
      word,
    )
      ? `[^${ADDRESS_BOUNDARY}]*`
      : ADDRESS_SEPARATOR;
    source += separator + escapeRegex(word);
    previous = word;
  }
  return source;
}

function patternFor(value: KnownPiiValue): RegExp | undefined {
  const normalized = value.valueNormalized;
  if (!normalized) return undefined;

  switch (value.type) {
    case "email":
      return new RegExp(
        `(?<![A-Z0-9._%+-])${escapeRegex(normalized)}(?![A-Z0-9._%+-])`,
        "iu",
      );
    case "phone": {
      const international = normalized.startsWith("+");
      const digits = normalized.replace(/\D/g, "");
      if (!digits) return undefined;
      return new RegExp(
        `(?<![\\d+])${international ? "\\+" : ""}${separated(digits, "[\\s()./-]*")}(?!\\d)`,
        "u",
      );
    }
    case "iban": {
      const compact = normalized.replace(/\s/g, "");
      return new RegExp(
        `(?<![A-Z0-9])${separated(compact, "[ .]*")}(?![A-Z0-9])`,
        "iu",
      );
    }
    case "credit_card": {
      if (normalized.startsWith("****")) {
        const suffix = normalized.slice(-4);
        return new RegExp(
          `(?<!\\*)\\*{2,4}(?:[ -]?\\*{2,4}){0,2}[ -]?${escapeRegex(suffix)}(?!\\d)`,
          "u",
        );
      }
      return new RegExp(
        `(?<!\\d)${separated(normalized, "[ -]*")}(?!\\d)`,
        "u",
      );
    }
    case "national_id": {
      const compact = normalized.replace(/\s/g, "");
      return new RegExp(
        `(?<![A-Z0-9])${separated(compact, "\\s*")}(?![A-Z0-9])`,
        "iu",
      );
    }
    case "postal_code": {
      const compact = normalized.replace(/\s/g, "");
      return new RegExp(
        `(?<![A-Z0-9])${separated(compact, "\\s*")}(?![A-Z0-9])`,
        "iu",
      );
    }
    case "address": {
      const source = addressPatternSource(normalized);
      if (!source) return undefined;
      return new RegExp(
        `(?<![${ADDRESS_BOUNDARY}])${source}(?![${ADDRESS_BOUNDARY}])`,
        "iu",
      );
    }
  }
}

interface CompiledStructuredAddress {
  streetAndHouse: RegExp;
  postalCode: RegExp;
}

interface CompiledKnownValue {
  value: KnownPiiValue;
  pattern?: RegExp;
  structuredAddress?: CompiledStructuredAddress;
  dateOfBirth?: boolean;
}

const compiledValues = new WeakMap<
  readonly KnownPiiValue[],
  readonly CompiledKnownValue[]
>();

function structuredAddressKey(value: KnownPiiValue): string | undefined {
  const components = value.addressComponents;
  if (
    value.type !== "address"
    || !components?.street
    || !components.houseNumber
    || !components.postalCode
  ) {
    return undefined;
  }
  return [
    components.street,
    components.houseNumber,
    components.postalCode,
  ].join("\0");
}

function containsTokenSequence(
  tokens: string[],
  sequence: string[],
): boolean {
  return tokens.some((_, start) => (
    sequence.every((token, offset) => tokens[start + offset] === token)
  ));
}

function findingContainsAddressCore(
  finding: Finding,
  value: KnownPiiValue,
): boolean {
  const components = value.addressComponents;
  if (finding.type !== "address" || !components) return false;
  const tokens = finding.valueNormalized.split(/\s+/).filter(Boolean);
  const street = components.street.split(/\s+/).filter(Boolean);
  const postalCode = components.postalCode.split(/\s+/).filter(Boolean);
  return (
    (
      containsTokenSequence(tokens, [...street, components.houseNumber])
      || containsTokenSequence(
        tokens,
        [components.houseNumber, ...street],
      )
    )
    && containsTokenSequence(tokens, postalCode)
  );
}

// Generic detection has already established that a span is one address. Use
// that stronger boundary when raw body layout (for example several line
// breaks) prevents the independent known-value matcher from seeing the same
// components. Partial profile rows have no components and cannot participate.
export function reconcileKnownAddressFindings(
  findings: Finding[],
  values: readonly KnownPiiValue[],
): Finding[] {
  const unique = new Map<string, KnownPiiValue>();
  for (const value of values) {
    if (structuredAddressKey(value)) {
      unique.set(value.valueNormalized, value);
    }
  }
  const candidates = [...unique.values()];
  if (candidates.length === 0) return findings;

  return findings.map((finding) => {
    if (finding.type !== "address") return finding;
    const matches = candidates.filter((value) => (
      findingContainsAddressCore(finding, value)
    ));
    const cores = new Set(matches.map(structuredAddressKey));
    if (matches.length !== 1 || cores.size !== 1) return finding;
    const match = matches[0];
    if (!match) return finding;
    if (finding.valueNormalized === match.valueNormalized) return finding;
    return {
      ...finding,
      valueNormalized: match.valueNormalized,
      ...(match.addressComponents?.country
        ? { country: match.addressComponents.country }
        : {}),
      signals: [
        ...finding.signals,
        { id: "known-value.address-components" },
      ],
    };
  });
}

function compileStructuredAddress(
  value: KnownPiiValue,
): CompiledStructuredAddress | undefined {
  const components = value.addressComponents;
  if (!components) return undefined;
  const street = addressPatternSource(components.street);
  const house = addressPatternSource(components.houseNumber);
  const postalCode = addressPatternSource(components.postalCode);
  if (!street || !house || !postalCode) return undefined;

  return {
    // House numbers precede the street in some countries and follow it in
    // others. Their adjacency stays strict in both directions.
    streetAndHouse: new RegExp(
      `(?<![${ADDRESS_BOUNDARY}])(?:`
        + `${street}${ADDRESS_SEPARATOR}${house}`
        + `|${house}${ADDRESS_SEPARATOR}${street}`
        + `)(?![${ADDRESS_BOUNDARY}])`,
      "giu",
    ),
    postalCode: new RegExp(
      `(?<![${ADDRESS_BOUNDARY}])${postalCode}(?![${ADDRESS_BOUNDARY}])`,
      "giu",
    ),
  };
}

function compileKnownValues(
  values: readonly KnownPiiValue[],
): readonly CompiledKnownValue[] {
  const cached = compiledValues.get(values);
  if (cached) return cached;

  // Two profile rows with the same street/house/postcode core are ambiguous
  // when their optional city/country text is absent. Keep those on exact
  // whole-address matching instead of picking one canonical row arbitrarily.
  const structuredCounts = new Map<string, number>();
  for (const value of values) {
    const key = structuredAddressKey(value);
    if (key) structuredCounts.set(key, (structuredCounts.get(key) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const compiled: CompiledKnownValue[] = [];
  for (const value of values) {
    const key = `${value.type}:${value.valueNormalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const addressKey = structuredAddressKey(value);
    const structuredAddress =
      addressKey && structuredCounts.get(addressKey) === 1
        ? compileStructuredAddress(value)
        : undefined;
    const pattern = structuredAddress ? undefined : patternFor(value);
    const dateOfBirth = value.type === "date_of_birth";
    if (pattern || structuredAddress || dateOfBirth) {
      compiled.push({
        value,
        ...(pattern ? { pattern } : {}),
        ...(structuredAddress ? { structuredAddress } : {}),
        ...(dateOfBirth ? { dateOfBirth } : {}),
      });
    }
  }
  compiledValues.set(values, compiled);
  return compiled;
}

interface KnownMatch {
  start: number;
  end: number;
  signal: "known-value.exact" | "known-value.address-components";
}

function findStructuredAddress(
  text: string,
  patterns: CompiledStructuredAddress,
): KnownMatch | undefined {
  const postalCodes = [...text.matchAll(patterns.postalCode)];
  if (postalCodes.length === 0) return undefined;
  let best: KnownMatch | undefined;

  for (const streetAndHouse of text.matchAll(patterns.streetAndHouse)) {
    const pairStart = streetAndHouse.index;
    const pairEnd = pairStart + streetAndHouse[0].length;
    for (const postalCode of postalCodes) {
      const postalStart = postalCode.index;
      const postalEnd = postalStart + postalCode[0].length;
      const between =
        pairEnd <= postalStart
          ? text.slice(pairEnd, postalStart)
          : postalEnd <= pairStart
            ? text.slice(postalEnd, pairStart)
            : "";
      const newlineCount = between.match(/\n/g)?.length ?? 0;
      if (
        between.length > ADDRESS_COMPONENT_GAP_MAX
        || newlineCount > ADDRESS_COMPONENT_NEWLINES_MAX
      ) {
        continue;
      }

      const match = {
        start: Math.min(pairStart, postalStart),
        end: Math.max(pairEnd, postalEnd),
        signal: "known-value.address-components" as const,
      };
      if (!best || match.end - match.start < best.end - best.start) {
        best = match;
      }
    }
  }
  return best;
}

export function detectKnownValues(
  text: string,
  values: readonly KnownPiiValue[],
): Finding[] {
  if (values.length === 0) return [];
  const findings: Finding[] = [];
  for (const {
    value,
    pattern,
    structuredAddress,
    dateOfBirth,
  } of compileKnownValues(values)) {
    const exact = pattern?.exec(text);
    const match = structuredAddress
      ? findStructuredAddress(text, structuredAddress)
      : dateOfBirth
        ? (() => {
            const date = findDateOfBirth(text, value.valueNormalized);
            return date
              ? { ...date, signal: "known-value.exact" as const }
              : undefined;
          })()
        : exact
          ? {
              start: exact.index,
              end: exact.index + exact[0].length,
              signal: "known-value.exact" as const,
            }
          : undefined;
    if (!match) continue;

    findings.push({
      type: value.type,
      valueRaw: text.slice(match.start, match.end),
      valueNormalized: value.valueNormalized,
      start: match.start,
      end: match.end,
      confidence: "pattern",
      ...(value.addressComponents?.country
        ? { country: value.addressComponents.country }
        : {}),
      signals: [{ id: match.signal }],
    });
  }

  return findings;
}
