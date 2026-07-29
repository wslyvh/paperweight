import {
  extractKnownAddressComponents,
  normalizeValue,
  validateValue,
} from "@paperweight/analysis/profile-values";
import {
  isSupportedCountryCode,
  normalizeCountryCode,
} from "@paperweight/analysis/country";
import { PROFILE_BIRTH_YEAR_MIN } from "@shared/types";
import type {
  ProfileAddress,
  ProfileBirthDate,
  ProfileEmail,
  ProfileName,
  ProfileNationalId,
  ProfilePayment,
  ProfilePhone,
  UserProfile,
} from "@shared/types";
import { listAccounts } from "../credentials";
import { getGlobalDb } from "../globalDb";
import { dbLog } from "../utils/log";
import { seedProfileEmailsFromAccounts } from "./profileSeed";

interface ProfileRow {
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  country: string | null;
}

interface NameRow {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
}

interface EmailRow {
  id: number;
  address: string;
}

interface PhoneRow {
  id: number;
  number_raw: string;
}

interface AddressRow {
  id: number;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  raw: string | null;
}

interface NationalIdRow {
  id: number;
  value_normalized: string;
}

interface PaymentRow {
  id: number;
  type: "iban" | "credit_card";
  value_normalized: string;
}

interface StoredName {
  firstName: string;
  middleName?: string;
  lastName: string;
}

interface StoredEmail {
  address: string;
  normalized: string;
}

interface StoredPhone {
  number: string;
  normalized: string;
}

interface StoredAddress {
  mode: "structured" | "raw";
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  raw?: string;
  normalized: string;
  postalCodeNormalized?: string;
}

interface StoredValue {
  normalized: string;
}

interface StoredPayment extends StoredValue {
  type: "iban" | "credit_card";
}

interface ProfileMatchRow {
  type: string;
  value_normalized: string;
}

interface ProfileAnalysisAddressRow {
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  raw: string | null;
}

function compactWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getProfileAnalysisKeys(
  target: ReturnType<typeof getGlobalDb>,
): Set<string> {
  const rows = target
    .prepare(
      `SELECT type, value_normalized
       FROM profile_match_values`,
    )
    .all() as ProfileMatchRow[];
  const keys = new Set(
    rows.map((row) => `${row.type}\0${row.value_normalized}`),
  );
  const addresses = target
    .prepare(
      `SELECT street, house_number, postal_code, raw
       FROM profile_addresses`,
    )
    .all() as ProfileAnalysisAddressRow[];
  for (const address of addresses) {
    const components = address.raw
      ? extractKnownAddressComponents(address.raw)
      : address.street && address.house_number && address.postal_code
        ? {
            street: normalizeValue("address", address.street),
            houseNumber: normalizeValue("address", address.house_number),
            postalCode: normalizeValue("address", address.postal_code),
          }
        : undefined;
    if (!components) continue;
    keys.add([
      "address-components",
      components.street,
      components.houseNumber,
      components.postalCode,
    ].join("\0"));
  }
  return keys;
}

function sameKeys(left: Set<string>, right: Set<string>): boolean {
  return (
    left.size === right.size
    && [...left].every((value) => right.has(value))
  );
}

function normalizeCountry(value?: string): string | undefined {
  const country = value ? normalizeCountryCode(value) : "";
  if (!country) return undefined;
  if (!isSupportedCountryCode(country)) {
    throw new Error("Invalid profile country");
  }
  return country;
}

function validateBirthDate(value?: ProfileBirthDate): ProfileBirthDate | undefined {
  if (!value) return undefined;
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
  if (
    !Number.isInteger(value.day)
    || !Number.isInteger(value.month)
    || !Number.isInteger(value.year)
    || value.year < PROFILE_BIRTH_YEAR_MIN
    || value.year > new Date().getUTCFullYear()
    || date.getUTCFullYear() !== value.year
    || date.getUTCMonth() !== value.month - 1
    || date.getUTCDate() !== value.day
  ) {
    throw new Error("Invalid profile birth date");
  }
  return value;
}

function normalizeNames(values: ProfileName[]): StoredName[] {
  const seen = new Set<string>();
  return values.map((value) => {
    const firstName = compactWhitespace(value.firstName);
    const middleName = compactWhitespace(value.middleName ?? "");
    const lastName = compactWhitespace(value.lastName);
    if (!firstName || !lastName) throw new Error("Invalid profile name");
    const key = [firstName, middleName, lastName]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    if (seen.has(key)) throw new Error("Duplicate profile name");
    seen.add(key);
    return {
      firstName,
      ...(middleName ? { middleName } : {}),
      lastName,
    };
  });
}

function normalizeEmails(values: ProfileEmail[]): StoredEmail[] {
  const all = [
    ...values.map((value) => value.address),
    ...listAccounts().map((account) => account.email),
  ];
  const seen = new Set<string>();
  return all.flatMap((address) => {
    const display = compactWhitespace(address);
    const normalized = normalizeValue("email", display);
    if (!validateValue("email", display)) {
      throw new Error("Invalid profile email");
    }
    if (seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ address: display, normalized }];
  });
}

function normalizePhones(values: ProfilePhone[]): StoredPhone[] {
  const seen = new Set<string>();
  return values.map((value) => {
    const number = compactWhitespace(value.number);
    const normalized = normalizeValue("phone", number);
    if (!validateValue("phone", number)) {
      throw new Error("Invalid profile phone");
    }
    if (seen.has(normalized)) throw new Error("Duplicate profile phone");
    seen.add(normalized);
    return { number, normalized };
  });
}

function normalizeAddresses(values: ProfileAddress[]): StoredAddress[] {
  const normalizedValues = values.map((value): StoredAddress => {
    if (value.mode === "raw") {
      const raw = compactWhitespace(value.raw ?? "");
      if (!validateValue("address", raw)) {
        throw new Error("Invalid raw profile address");
      }
      const normalized = normalizeValue("address", raw);
      const postalCodeNormalized = validateValue("postal_code", raw)
        ? normalizeValue("postal_code", raw)
        : undefined;
      return {
        mode: "raw",
        raw,
        normalized,
        ...(postalCodeNormalized ? { postalCodeNormalized } : {}),
      };
    }

    const street = compactWhitespace(value.street ?? "");
    const houseNumber = compactWhitespace(value.houseNumber ?? "");
    const postalCode = compactWhitespace(value.postalCode ?? "");
    const city = compactWhitespace(value.city ?? "");
    const country = normalizeCountry(value.country);
    if (!street || !houseNumber || !postalCode || !city || !country) {
      throw new Error("Invalid structured profile address");
    }
    const normalized = normalizeValue(
      "address",
      `${street} ${houseNumber} ${postalCode} ${city}`,
    );
    return {
      mode: "structured",
      street,
      houseNumber,
      postalCode,
      city,
      country,
      normalized,
      postalCodeNormalized: normalizeValue("postal_code", postalCode),
    };
  });

  const indexes = new Map<string, number>();
  const result: StoredAddress[] = [];
  for (const address of normalizedValues) {
    const existingIndex = indexes.get(address.normalized);
    if (existingIndex === undefined) {
      indexes.set(address.normalized, result.length);
      result.push(address);
      continue;
    }

    const existing = result[existingIndex];
    if (existing.mode === address.mode) {
      throw new Error("Duplicate profile address");
    }
    // The explicit fields are stronger than an earlier opaque spelling. A
    // snapshot containing both is an upgrade, not two profile addresses.
    if (address.mode === "structured") result[existingIndex] = address;
  }
  return result;
}

function normalizeNationalIds(values: ProfileNationalId[]): StoredValue[] {
  const seen = new Set<string>();
  return values.map((value) => {
    const normalized = normalizeValue("national_id", value.value);
    if (!validateValue("national_id", value.value)) {
      throw new Error("Invalid profile national ID");
    }
    if (seen.has(normalized)) throw new Error("Duplicate profile national ID");
    seen.add(normalized);
    return { normalized };
  });
}

function normalizePayments(values: ProfilePayment[]): StoredPayment[] {
  const seen = new Set<string>();
  return values.map((value) => {
    const normalized = normalizeValue(value.type, value.value);
    if (!validateValue(value.type, value.value)) {
      throw new Error("Invalid profile payment");
    }
    const key = `${value.type}:${normalized}`;
    if (seen.has(key)) throw new Error("Duplicate profile payment");
    seen.add(key);
    return { type: value.type, normalized };
  });
}

export function getUserProfile(): UserProfile {
  const target = getGlobalDb();
  const profile = target
    .prepare(
      `SELECT birth_year, birth_month, birth_day, country
       FROM profile
       WHERE id = 1`,
    )
    .get() as ProfileRow;
  const names = target
    .prepare(
      `SELECT id, first_name, middle_name, last_name
       FROM profile_names
       ORDER BY id`,
    )
    .all() as NameRow[];
  const emails = target
    .prepare("SELECT id, address FROM profile_emails ORDER BY id")
    .all() as EmailRow[];
  const phones = target
    .prepare("SELECT id, number_raw FROM profile_phones ORDER BY id")
    .all() as PhoneRow[];
  const addresses = target
    .prepare(
      `SELECT id, street, house_number, postal_code, city, country, raw
       FROM profile_addresses
       ORDER BY id`,
    )
    .all() as AddressRow[];
  const nationalIds = target
    .prepare(
      `SELECT id, value_normalized
       FROM profile_national_ids
       ORDER BY id`,
    )
    .all() as NationalIdRow[];
  const payments = target
    .prepare(
      `SELECT id, type, value_normalized
       FROM profile_payments
       ORDER BY id`,
    )
    .all() as PaymentRow[];

  const result: UserProfile = {
    names: names.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      ...(row.middle_name ? { middleName: row.middle_name } : {}),
      lastName: row.last_name,
    })),
    emails: emails.map((row) => ({ id: row.id, address: row.address })),
    phones: phones.map((row) => ({ id: row.id, number: row.number_raw })),
    addresses: addresses.map((row) => (
      row.raw !== null
        ? { id: row.id, mode: "raw", raw: row.raw }
        : {
            id: row.id,
            mode: "structured",
            street: row.street ?? "",
            houseNumber: row.house_number ?? "",
            postalCode: row.postal_code ?? "",
            city: row.city ?? "",
            country: row.country ?? "",
          }
    )),
    nationalIds: nationalIds.map((row) => ({
      id: row.id,
      value: row.value_normalized,
    })),
    payments: payments.map((row) => ({
      id: row.id,
      type: row.type,
      value: row.value_normalized,
    })),
  };
  if (profile.country) result.country = profile.country;
  if (
    profile.birth_year !== null
    && profile.birth_month !== null
    && profile.birth_day !== null
  ) {
    result.birthDate = {
      year: profile.birth_year,
      month: profile.birth_month,
      day: profile.birth_day,
    };
  }
  return result;
}

export function saveUserProfile(profile: UserProfile): boolean {
  const target = getGlobalDb();
  const country = normalizeCountry(profile.country);
  const birthDate = validateBirthDate(profile.birthDate);
  const names = normalizeNames(profile.names);
  const emails = normalizeEmails(profile.emails);
  const phones = normalizePhones(profile.phones);
  const addresses = normalizeAddresses(profile.addresses);
  const nationalIds = normalizeNationalIds(profile.nationalIds);
  const payments = normalizePayments(profile.payments);
  const analysisKeysBefore = getProfileAnalysisKeys(target);

  const save = target.transaction(() => {
    target.prepare(
      `UPDATE profile
       SET birth_year = ?,
           birth_month = ?,
           birth_day = ?,
           country = ?
       WHERE id = 1`,
    ).run(
      birthDate?.year ?? null,
      birthDate?.month ?? null,
      birthDate?.day ?? null,
      country ?? null,
    );

    for (const table of [
      "profile_names",
      "profile_emails",
      "profile_phones",
      "profile_addresses",
      "profile_national_ids",
      "profile_payments",
    ]) {
      target.prepare(`DELETE FROM ${table}`).run();
    }

    const addName = target.prepare(
      `INSERT INTO profile_names (first_name, middle_name, last_name)
       VALUES (?, ?, ?)`,
    );
    for (const name of names) {
      addName.run(name.firstName, name.middleName ?? null, name.lastName);
    }

    const addEmail = target.prepare(
      `INSERT INTO profile_emails (address, value_normalized)
       VALUES (?, ?)`,
    );
    for (const email of emails) addEmail.run(email.address, email.normalized);

    const addPhone = target.prepare(
      `INSERT INTO profile_phones (number_raw, value_normalized)
       VALUES (?, ?)`,
    );
    for (const phone of phones) addPhone.run(phone.number, phone.normalized);

    const addAddress = target.prepare(
      `INSERT INTO profile_addresses
         (street, house_number, postal_code, city, country, raw,
          value_normalized, postal_code_normalized)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const address of addresses) {
      addAddress.run(
        address.street ?? null,
        address.houseNumber ?? null,
        address.postalCode ?? null,
        address.city ?? null,
        address.country ?? null,
        address.raw ?? null,
        address.normalized,
        address.postalCodeNormalized ?? null,
      );
    }

    const addNationalId = target.prepare(
      `INSERT INTO profile_national_ids (value_normalized)
       VALUES (?)`,
    );
    for (const value of nationalIds) addNationalId.run(value.normalized);

    const addPayment = target.prepare(
      `INSERT INTO profile_payments (type, value_normalized)
       VALUES (?, ?)`,
    );
    for (const payment of payments) {
      addPayment.run(payment.type, payment.normalized);
    }

    target.prepare(
      `DELETE FROM pii_suppressions
       WHERE (type, value_normalized) IN (
         SELECT type, value_normalized
         FROM profile_match_values
       )`,
    ).run();
  });

  save();

  try {
    seedProfileEmailsFromAccounts();
  } catch {
    dbLog.warn("Profile saved, but account email discovery could not run");
  }

  return !sameKeys(analysisKeysBefore, getProfileAnalysisKeys(target));
}
