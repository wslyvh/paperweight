import type { PiiType } from "@shared/types";
import { getGlobalSetting } from "../main/services/globalSettings";
import { getPiiFindingValues, maskValue } from "../main/services/pii";
import { getProfileMatchValues } from "../main/services/profile";

interface KnownValue {
  type: PiiType;
  value: string;
}

const SCRUB_TYPES = new Set<PiiType>([
  "email",
  "phone",
  "iban",
  "credit_card",
  "national_id",
  "address",
  "postal_code",
]);

const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const PHONE_PATTERN = /(?<![\w])\+?\d(?:[\s().-]*\d){7,14}(?![\w])/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0] ?? "•"}•••`)
    .join(" ");
}

function flexiblePattern(type: PiiType, value: string): RegExp | undefined {
  if (value.length < 4) return undefined;
  if (type === "email") return new RegExp(escapeRegExp(value), "gi");
  if (["phone", "iban", "credit_card", "national_id", "postal_code"].includes(type)) {
    const characters = [...value].filter((character) => /[a-z0-9]/i.test(character));
    if (characters.length < 4) return undefined;
    return new RegExp(characters.map(escapeRegExp).join("[\\s().-]*"), "gi");
  }
  return new RegExp(escapeRegExp(value).replace(/\s+/g, "\\s+"), "gi");
}

function isCompanyContact(path: string[]): boolean {
  const field = path.at(-1);
  const parent = path.at(-2);
  if (field === "recipientEmail" || field === "senderEmail" || field === "senderName") {
    return true;
  }
  if (parent === "senders" && (field === "email" || field === "name")) return true;
  return path.includes("profile") && ["email", "phone", "address"].includes(field ?? "");
}

function isStableMetadata(path: string[]): boolean {
  const field = path.at(-1) ?? "";
  if ([
    "mailbox",
    "selectedMailbox",
    "appActiveMailbox",
    "key",
    "companyKey",
    "domain",
    "companyDomain",
    "ref",
    "country",
    "risk",
    "category",
    "url",
  ].includes(field)) return true;
  return field.endsWith("At") || field.endsWith("Date") || field.endsWith("Seen");
}

function explicitMask(
  value: string,
  path: string[],
  parent: Record<string, unknown>,
): string | undefined {
  const field = path.at(-1);
  const collection = path.at(-2);
  if (field === "email" && collection === "mailboxes") return maskValue("email", value);
  if (field === "email" && collection === "receivedAddresses") return maskValue("email", value);
  if (field === "accountAddress" || field === "accountEmail") return maskValue("email", value);
  if (field === "value" && value.includes("@")) return maskValue("email", value);
  if (field === "birthDate") return maskValue("date_of_birth", value);
  if (field !== "maskedValue") return undefined;

  const type = parent.type;
  if (typeof type === "string" && SCRUB_TYPES.has(type as PiiType)) {
    return maskValue(type as PiiType, value);
  }
  if (collection === "names") return maskName(value);
  if (collection === "emails") return maskValue("email", value);
  if (collection === "phones") return maskValue("phone", value);
  if (collection === "addresses") return maskValue("address", value);
  if (collection === "nationalIds") return maskValue("national_id", value);
  return undefined;
}

function scrubKnownValues(value: string, knownValues: KnownValue[]): string {
  return knownValues.reduce((result, known) => {
    const pattern = flexiblePattern(known.type, known.value);
    return pattern
      ? result.replace(pattern, maskValue(known.type, known.value))
      : result;
  }, value);
}

function getKnownValues(): KnownValue[] {
  const values = [...getProfileMatchValues(), ...getPiiFindingValues()]
    .filter((item): item is KnownValue => SCRUB_TYPES.has(item.type));
  const unique = new Map<string, KnownValue>();
  for (const value of values) unique.set(`${value.type}\0${value.value}`, value);
  return [...unique.values()].sort((left, right) => right.value.length - left.value.length);
}

export function maskAgentPayload<T>(payload: T): T {
  if (getGlobalSetting("agentMaskPersonalData") === false) return payload;
  const knownValues = getKnownValues();

  function walk(value: unknown, path: string[], parent?: Record<string, unknown>): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => walk(item, path, parent));
    }
    if (value && typeof value === "object") {
      const source = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(source).map(([key, item]) => [key, walk(item, [...path, key], source)]),
      );
    }
    if (typeof value !== "string" || !parent) return value;

    const explicit = explicitMask(value, path, parent);
    if (explicit !== undefined) return explicit;
    if (isCompanyContact(path) || isStableMetadata(path)) return value;

    let masked = scrubKnownValues(value, knownValues);
    const field = path.at(-1);
    if (field === "subject" || field === "preview") {
      masked = masked
        .replace(EMAIL_PATTERN, "•••@•••")
        .replace(PHONE_PATTERN, "•••");
    }
    return masked;
  }

  return walk(payload, []) as T;
}

export function agentToolResult<T extends Record<string, unknown>>(
  payload: T,
  isError = false,
) {
  const structuredContent = maskAgentPayload(payload);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
    ...(isError ? { isError: true } : {}),
  };
}
