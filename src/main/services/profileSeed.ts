import Database from "better-sqlite3";
import { existsSync } from "fs";
import { join } from "path";
import {
  isSupportedCountryCode,
  normalizeCountryCode,
} from "@paperweight/analysis/country";
import { emailToFileKey, listAccounts } from "../credentials";
import { getGlobalDb } from "../globalDb";
import { dbLog } from "../utils/log";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function plusBase(value: string): string {
  const address = normalizeEmail(value);
  const at = address.lastIndexOf("@");
  if (at < 1) return address;
  const local = address.slice(0, at);
  const plus = local.indexOf("+");
  return `${plus < 0 ? local : local.slice(0, plus)}${address.slice(at)}`;
}

function isPlusAddress(value: string): boolean {
  const at = value.lastIndexOf("@");
  return at > 0 && value.slice(0, at).includes("+");
}

function hasTable(target: Database.Database, table: string): boolean {
  return Boolean(
    target
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table),
  );
}

function hasColumn(
  target: Database.Database,
  table: string,
  column: string,
): boolean {
  return (
    target.pragma(`table_info(${table})`) as Array<{ name: string }>
  ).some((entry) => entry.name === column);
}

function collectAccountEmails(
  target: Database.Database,
  known: Set<string>,
  candidates: Set<string>,
): void {
  if (
    hasTable(target, "vendors")
    && hasColumn(target, "vendors", "account_email")
  ) {
    const aliases = target
      .prepare(
        `SELECT DISTINCT account_email AS address
         FROM vendors
         WHERE account_email IS NOT NULL AND TRIM(account_email) != ''`,
      )
      .all() as Array<{ address: string }>;
    for (const row of aliases) known.add(normalizeEmail(row.address));
  }

  if (
    hasTable(target, "pii_findings")
    && hasColumn(target, "pii_findings", "value_normalized")
  ) {
    const findings = target
      .prepare(
        `SELECT DISTINCT value_normalized AS address
         FROM pii_findings
         WHERE type = 'email'`,
      )
      .all() as Array<{ address: string }>;
    for (const row of findings) candidates.add(normalizeEmail(row.address));
  }
}

function addKnownPlusAliases(known: Set<string>, candidates: Set<string>): void {
  const bases = new Set([...known].map(plusBase));
  for (const candidate of candidates) {
    if (isPlusAddress(candidate) && bases.has(plusBase(candidate))) {
      known.add(candidate);
    }
  }
}

function insertProfileEmails(
  target: Database.Database,
  table: "profile_emails" | "global.profile_emails",
  emails: Set<string>,
): number {
  const insert = target.prepare(
    `INSERT INTO ${table} (address, value_normalized)
     VALUES (?, ?)
     ON CONFLICT(value_normalized) DO NOTHING`,
  );
  const suppressionTable = table.startsWith("global.")
    ? "global.pii_suppressions"
    : "pii_suppressions";
  const unsuppress = target.prepare(
    `DELETE FROM ${suppressionTable}
     WHERE type = 'email' AND value_normalized = ?`,
  );
  const save = target.transaction(() => {
    let inserted = 0;
    for (const email of emails) {
      if (!email) continue;
      inserted += insert.run(email, email).changes;
      unsuppress.run(email);
    }
    return inserted;
  });
  return save();
}

/**
 * Add addresses the resolver read off message headers to the profile.
 *
 * Deliberately not insertProfileEmails: that helper clears a matching
 * suppression, which is right for an address the user typed or connected, and
 * wrong here. These addresses are inferred, so a "not mine" the user already
 * recorded has to outrank them, and stay outranking them on every later sync.
 */
export function addReceivedProfileEmails(
  target: Database.Database,
  table: "profile_emails" | "global.profile_emails",
  addresses: Iterable<string>,
): number {
  const suppressionTable = table.startsWith("global.")
    ? "global.pii_suppressions"
    : "pii_suppressions";
  const insert = target.prepare(
    `INSERT INTO ${table} (address, value_normalized)
     SELECT @address, @value
     WHERE NOT EXISTS (
       SELECT 1 FROM ${suppressionTable}
       WHERE type = 'email' AND value_normalized = @value
     )
     ON CONFLICT(value_normalized) DO NOTHING`,
  );
  const save = target.transaction(() => {
    let inserted = 0;
    for (const raw of addresses) {
      const address = normalizeEmail(raw);
      if (!address) continue;
      inserted += insert.run({ address, value: address }).changes;
    }
    return inserted;
  });
  return save();
}

export function seedProfileEmailsFromAccounts(): number {
  const accounts = listAccounts();
  if (accounts.length === 0) return 0;
  const known = new Set(accounts.map((account) => normalizeEmail(account.email)));
  const candidates = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  const userData = app.getPath("userData");

  for (const account of accounts) {
    const path = join(userData, `${emailToFileKey(account.email)}.db`);
    if (!existsSync(path)) continue;
    const accountDb = new Database(path, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      collectAccountEmails(accountDb, known, candidates);
    } catch {
      dbLog.warn("Skipped one account while seeding profile email addresses");
    } finally {
      accountDb.close();
    }
  }

  addKnownPlusAliases(known, candidates);
  const inserted = insertProfileEmails(getGlobalDb(), "profile_emails", known);
  if (inserted > 0) {
    dbLog.info(`Seeded ${inserted} profile email address${inserted === 1 ? "" : "es"}`);
  }
  return inserted;
}

export function seedProfileEmailsFromCurrentAccount(
  target: Database.Database,
  accountEmail?: string,
): number {
  const known = new Set<string>();
  const candidates = new Set<string>();
  const storedAccount = target
    .prepare("SELECT value FROM settings WHERE key = 'accountEmail'")
    .get() as { value: string } | undefined;
  const connected = accountEmail ?? storedAccount?.value;
  if (connected) known.add(normalizeEmail(connected));

  collectAccountEmails(target, known, candidates);
  addKnownPlusAliases(known, candidates);
  return insertProfileEmails(target, "global.profile_emails", known);
}

export function seedProfileCountryIfEmpty(
  inferCountry: () => string | undefined,
): boolean {
  const target = getGlobalDb();
  const row = target
    .prepare("SELECT country FROM profile WHERE id = 1")
    .get() as { country: string | null };
  if (row.country) return false;

  const inferred = inferCountry();
  const country = inferred ? normalizeCountryCode(inferred) : "";
  if (!country || !isSupportedCountryCode(country)) return false;
  return target
    .prepare(
      `UPDATE profile
       SET country = ?
       WHERE id = 1 AND country IS NULL`,
    )
    .run(country).changes === 1;
}
