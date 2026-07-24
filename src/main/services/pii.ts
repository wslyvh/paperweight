import { getDb } from "../db";
import { listAccounts } from "../credentials";
import { PERSONAL_DOMAINS } from "@paperweight/analysis/contracts";
import type {
  PiiType,
  VendorPiiCoverage,
  VendorPiiRevealedValue,
  VendorPiiSummary,
  VendorPiiValue,
} from "@shared/types";

interface SqlCondition {
  sql: string;
  params: Array<string | number>;
}

// Partial masks: reveal just enough for the user to recognize their own value,
// never the whole thing. Applied in the main process, and what the summary
// carries — the summary payload is still raw-free. Full values leave the main
// process only through revealVendorPiiValues(), on an explicit user action.
// Input is the finding's value_normalized (canonical form).
export function maskValue(type: PiiType, normalized: string): string {
  const v = normalized;
  switch (type) {
    case "email": {
      const [local = "", domain = ""] = v.split("@");
      const tld = domain.split(".").pop() ?? "";
      return `${local[0] ?? "•"}•••@•••.${tld}`;
    }
    case "iban":
      return `${v.slice(0, 2)} •••• ${v.slice(-4)}`;
    case "credit_card":
      return `•••• ${v.slice(-4)}`;
    case "phone":
      return `${v.slice(0, 3)} •••• ${v.slice(-2)}`;
    case "national_id":
      return `•••• ${v.slice(-3)}`;
    case "postal_code":
      return `${v.slice(0, 2)}•••`;
    case "address":
      return `${v.slice(0, 3)}•••`;
    default:
      return "•••";
  }
}

// Which addresses are the user's own. Three rules, deliberately no fourth:
// naive domain matching would label every address at gmail.com as theirs.
//
//   exact       — a connected account, or the alias this company mails them at
//   plus-alias  — base+anything@domain of an address already known to be theirs
//   catch-all   — a domain the user evidently owns: three or more distinct
//                 non-plus local parts appear as aliases across vendors
//
// The catch-all count ignores plus-aliases (one mailbox spelled many ways is
// not evidence of a domain) and skips public webmail outright — three old
// gmail addresses do not make gmail.com the user's domain.
interface OwnAddressRules {
  exact: Set<string>;
  plusBases: Set<string>;
  catchAllDomains: Set<string>;
}

const CATCH_ALL_MIN_LOCAL_PARTS = 3;

function splitAddress(address: string): { local: string; domain: string } {
  const at = address.lastIndexOf("@");
  return at === -1
    ? { local: address.toLowerCase(), domain: "" }
    : { local: address.slice(0, at).toLowerCase(), domain: address.slice(at + 1).toLowerCase() };
}

/** "alice+shop@example.com" -> "alice@example.com"; anything else unchanged. */
function plusBase(address: string): string {
  const { local, domain } = splitAddress(address);
  const plus = local.indexOf("+");
  return `${plus === -1 ? local : local.slice(0, plus)}@${domain}`;
}

function catchAllDomains(): Set<string> {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT account_email FROM vendors
       WHERE account_email IS NOT NULL AND TRIM(account_email) != ''`,
    )
    .all() as Array<{ account_email: string }>;

  const localsByDomain = new Map<string, Set<string>>();
  for (const { account_email } of rows) {
    const { local, domain } = splitAddress(account_email.trim());
    if (!domain || local.includes("+")) continue;
    if (PERSONAL_DOMAINS.includes(domain)) continue;
    const locals = localsByDomain.get(domain) ?? new Set<string>();
    locals.add(local);
    localsByDomain.set(domain, locals);
  }

  const owned = new Set<string>();
  for (const [domain, locals] of localsByDomain) {
    if (locals.size >= CATCH_ALL_MIN_LOCAL_PARTS) owned.add(domain);
  }
  return owned;
}

// Transactional body text ("your account alice@… was used to sign in") makes the
// alias the likeliest own-address hit in a vendor's mail, so it has to be
// labelled or the user marks their own address `Not mine`.
function ownAddressRules(vendorAccountEmail?: string): OwnAddressRules {
  const exact = new Set(listAccounts().map((a) => a.email.toLowerCase()));
  if (vendorAccountEmail) exact.add(vendorAccountEmail.toLowerCase());
  return {
    exact,
    plusBases: new Set([...exact].map(plusBase)),
    catchAllDomains: catchAllDomains(),
  };
}

function isOwnAddress(address: string, rules: OwnAddressRules): boolean {
  const lower = address.toLowerCase();
  if (rules.exact.has(lower)) return true;
  if (rules.plusBases.has(plusBase(lower))) return true;
  return rules.catchAllDomains.has(splitAddress(lower).domain);
}

// Denominator: every message stored for this company. Numerator: those the
// engine has analyzed, in any version — the summary doesn't filter findings by
// engine version either, so a version bump must not collapse this count to zero
// while the values it describes are still on screen.
function getVendorPiiCoverage(vendorId: number): VendorPiiCoverage {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN analysis_version IS NOT NULL THEN 1 ELSE 0 END), 0) AS scanned
       FROM messages WHERE vendor_id = ?`,
    )
    .get(vendorId) as { total: number; scanned: number };
  return { totalMessages: row.total, scannedMessages: row.scanned };
}

// The spread rule: a value the company repeats across its own mail is usually
// recurring sender/template data. Two thresholds, because one misses at both
// ends.
//
//   share    — ≥5 messages AND ≥40% of the vendor's mail. Catches small senders:
//              9 hits of Google's HQ address across a handful of messages.
//   absolute — ≥20 messages, whatever the share. Catches large ones, where a
//              boilerplate value drowns in volume: Microsoft's HQ appeared 108
//              times, and one clothing brand's phone number 56 times across 215
//              messages — 26%, under the share bar, and still boilerplate.
const SPREAD_MIN_MESSAGES = 5;
const SPREAD_MIN_SHARE = 0.4;
const SPREAD_ABSOLUTE = 20;

const PII_IS_FREQUENT_SQL = `(
  COUNT(DISTINCT f.message_id) >= ${SPREAD_ABSOLUTE}
  OR (
    COUNT(DISTINCT f.message_id) >= ${SPREAD_MIN_MESSAGES}
    AND COUNT(DISTINCT f.message_id) * 1.0 / MAX(vendor_total.n, 1) >= ${SPREAD_MIN_SHARE}
  )
)`;

const COMPANY_CONTACT_TYPES: readonly PiiType[] = ["address", "phone"];

const companyIdSql = (vendorAlias: string): string => `
  CASE
    WHEN ${vendorAlias}.company_slug IS NOT NULL
      THEN 'company:' || ${vendorAlias}.company_slug
    ELSE 'vendor:' || ${vendorAlias}.root_domain
  END`;

const sqlTypes = (types: readonly PiiType[]): string =>
  types.map((t) => `'${t}'`).join(", ");

// A normalized address/phone that this same company has printed in an
// independently detected footer is sender contact data. Apply that fact across
// the company's regional vendor rows so one template miss cannot leak a value
// that other messages already established as boilerplate.
const seenInCompanyFooterSql = (
  findingAlias: string,
  vendorAlias: string,
): string => `EXISTS (
  SELECT 1
  FROM pii_findings footer_f
  JOIN messages footer_m ON footer_f.message_id = footer_m.id
  JOIN vendors footer_v ON footer_m.vendor_id = footer_v.id
  WHERE footer_f.type = ${findingAlias}.type
    AND footer_f.value_normalized = ${findingAlias}.value_normalized
    AND footer_f.in_footer = 1
    AND footer_f.in_quoted_text = 0
    AND ${companyIdSql("footer_v")} = ${companyIdSql(vendorAlias)}
)`;

// These predicates are the hard visibility boundary shared by summaries,
// reveal and vendor filters. Locale and cross-company occurrence are ranking
// facts, never hard deletion.
const visibleFindingSql = (
  findingAlias: string,
  vendorAlias: string,
): string => `
  ${findingAlias}.in_quoted_text = 0
  AND ${findingAlias}.in_footer = 0
  AND ${findingAlias}.self_reference = 0
  AND NOT (
    ${findingAlias}.type IN (${sqlTypes(COMPANY_CONTACT_TYPES)})
    AND ${seenInCompanyFooterSql(findingAlias, vendorAlias)}
  )
  AND NOT EXISTS (
    SELECT 1 FROM pii_suppressions s
    WHERE s.type = ${findingAlias}.type
      AND s.value_normalized = ${findingAlias}.value_normalized
  )`;

// One indexed lookup by (type, value_normalized), counting company identities
// rather than raw vendor rows so regional domains do not fake wider presence.
const CROSS_COMPANY_COUNT_SQL = `(
  SELECT COUNT(DISTINCT ${companyIdSql("v2")})
  FROM pii_findings f2
  JOIN messages m2 ON f2.message_id = m2.id
  JOIN vendors v2 ON m2.vendor_id = v2.id
  WHERE f2.type = f.type
    AND f2.value_normalized = f.value_normalized
    AND f2.in_quoted_text = 0
    AND f2.in_footer = 0
    AND f2.self_reference = 0
    AND NOT (
      f2.type IN (${sqlTypes(COMPANY_CONTACT_TYPES)})
      AND ${seenInCompanyFooterSql("f2", "v2")}
    )
)`;

// The three type groups the rules below are written in terms of. Named once and
// interpolated everywhere, because the summary, the Accounts filter and the
// reveal path have to agree on them by construction — prose copies of the same
// list in four SQL fragments is how they drift apart.
//
//   identifier — a strong personal identifier. Ranked by how many companies
//                hold it, never hidden by the spread rule.
//   spreadExempt — identifiers plus email: an address a company repeats is
//                still the user's address.
//   locale     — types whose format carries a country, so a foreign one is a
//                ranking signal.
const IDENTIFIER_TYPES: readonly PiiType[] = ["iban", "national_id"];
const SPREAD_EXEMPT_TYPES: readonly PiiType[] = ["email", ...IDENTIFIER_TYPES];
const LOCALE_TYPES: readonly PiiType[] = ["phone", "postal_code", "address"];

const IS_IDENTIFIER_SQL = `f.type IN (${sqlTypes(IDENTIFIER_TYPES)})`;

// Which grouped values the summary shows at all: spread-exempt types always, and
// anything the company does not repeat at itself. Named once so the summary and
// the Accounts "has notable findings" predicate share the exact same set.
const PII_SUMMARY_SHOWN_SQL = `(
  f.type IN (${sqlTypes(SPREAD_EXEMPT_TYPES)})
  OR NOT ${PII_IS_FREQUENT_SQL}
)`;

const PII_SUMMARY_HAVING = `HAVING ${PII_SUMMARY_SHOWN_SQL}`;

/** Infer one home country from exact values repeated across unrelated
 * companies. One count, no type weights or likelihood score; ties are unknown. */
export function inferHomeCountry(): string | undefined {
  const rows = getDb()
    .prepare(
      `WITH cross_company_values AS (
         SELECT f.country AS country, f.type, f.value_normalized,
                COUNT(DISTINCT
                  CASE
                    WHEN v.company_slug IS NOT NULL THEN 'company:' || v.company_slug
                    ELSE 'vendor:' || v.root_domain
                  END
                ) AS company_count
         FROM pii_findings f
         JOIN messages m ON f.message_id = m.id
         JOIN vendors v ON m.vendor_id = v.id
         WHERE f.country IS NOT NULL
           AND ${visibleFindingSql("f", "v")}
         GROUP BY f.country, f.type, f.value_normalized
         HAVING company_count > 1
       )
       SELECT country, COUNT(*) AS value_count
       FROM cross_company_values
       GROUP BY country
       ORDER BY value_count DESC, country ASC
       LIMIT 2`,
    )
    .all() as Array<{ country: string; value_count: number }>;

  const first = rows[0];
  if (!first || first.value_count === rows[1]?.value_count) return undefined;
  return first.country;
}

interface VendorObservedOptions {
  type?: PiiType;
  nonEmailOnly?: boolean;
  primaryOnly?: boolean;
  homeCountry?: string;
}

/** SQL predicate over the outer `vendors` row. Summary/filter/Accounts callers
 * share the same hard exclusions and existing spread thresholds. */
export function vendorHasObservedPiiSql(
  options: VendorObservedOptions = {},
): SqlCondition {
  const filters = [
    "m.vendor_id = vendors.id",
    visibleFindingSql("f", "vendors"),
  ];
  const params: Array<string | number> = [];

  if (options.type) {
    filters.push("f.type = ?");
    params.push(options.type);
  }
  if (options.nonEmailOnly) filters.push("f.type != 'email'");
  if (options.primaryOnly && options.homeCountry) {
    filters.push(
      `NOT (f.type IN (${sqlTypes(LOCALE_TYPES)}) AND f.country IS NOT NULL AND f.country != ?)`,
    );
    params.push(options.homeCountry);
  }

  // Promoting a company into Accounts on an identifier alone asks more of the
  // evidence: one held at a single company reads as that company's own
  // reference number, so it only counts when it spans more than one.
  const identifierEscape = options.primaryOnly
    ? `(${IS_IDENTIFIER_SQL} AND ${CROSS_COMPANY_COUNT_SQL} > 1)`
    : IS_IDENTIFIER_SQL;

  return {
    sql: `EXISTS (
      SELECT 1
      FROM pii_findings f
      JOIN messages m ON f.message_id = m.id
      CROSS JOIN (
        SELECT COUNT(*) AS n FROM messages WHERE vendor_id = vendors.id
      ) AS vendor_total
      WHERE ${filters.join("\n        AND ")}
      GROUP BY f.type, f.value_normalized
      HAVING f.type = 'email'
         OR NOT ${PII_IS_FREQUENT_SQL}
         OR ${identifierEscape}
      LIMIT 1
    )`,
    params,
  };
}

// Whether a vendor holds at least one finding the Account Detail "Personal data"
// panel classifies as High or Possible (never only Low or nothing) — the signal
// behind the Accounts-list tags icon.
//
// FoundInEmails derives the tiers from getVendorPiiSummary: a shown value is Low
// only when it is single-company AND (a foreign-format locale value OR a frequent
// identifier); High or Possible is everything else shown. isOwnAddress never makes
// the difference here — an own-address email is neither foreign-format nor a
// frequent identifier, so it can never be Low — which is why this needs no
// ownership rules and stays pure SQL. Same visibility, grouping and shown-value
// predicates as the summary, so the icon and the panel cannot disagree.
export function vendorHasNotablePiiSql(homeCountry?: string): SqlCondition {
  const params: Array<string | number> = [];
  const isForeignFormat = homeCountry
    ? `(f.type IN (${sqlTypes(LOCALE_TYPES)}) AND MAX(f.country) IS NOT NULL AND MAX(f.country) != ?)`
    : "0";
  if (homeCountry) params.push(homeCountry);
  const isFrequentIdentifier = `(${IS_IDENTIFIER_SQL} AND ${PII_IS_FREQUENT_SQL})`;

  return {
    sql: `EXISTS (
      SELECT 1
      FROM pii_findings f
      JOIN messages m ON f.message_id = m.id
      CROSS JOIN (
        SELECT COUNT(*) AS n FROM messages WHERE vendor_id = vendors.id
      ) AS vendor_total
      WHERE m.vendor_id = vendors.id
        AND ${visibleFindingSql("f", "vendors")}
      GROUP BY f.type, f.value_normalized
      HAVING ${PII_SUMMARY_SHOWN_SQL}
         AND (
           ${CROSS_COMPANY_COUNT_SQL} > 1
           OR (NOT ${isForeignFormat} AND NOT ${isFrequentIdentifier})
         )
      LIMIT 1
    )`,
    params,
  };
}

// Values found in a company's emails, grouped into rows. Shared verbatim by
// the summary and the reveal path so the two can never disagree: same
// exclusions, same grouping, same `ref` per row. A value the summary hides is
// therefore unrevealable by construction.
//
// Five exclusions, all of them "this is not the user's data": quoted text is a
// third party's, a footer is the company's own boilerplate, a self-reference is
// an organizational mailbox, a matching address/phone already seen in this
// company's footer is the same boilerplate through a missed template, and the
// spread rule catches what a company repeats at itself. Suppressed values are
// the user's own correction on top.
// queryVendors' piiType filter mirrors every one of these — see vendors.ts.
const VENDOR_VALUES_FROM = `
  FROM pii_findings f
  JOIN messages m ON f.message_id = m.id
  JOIN vendors current_vendor ON m.vendor_id = current_vendor.id
  CROSS JOIN (SELECT COUNT(*) AS n FROM messages WHERE vendor_id = ?) AS vendor_total
  WHERE m.vendor_id = ?
    AND ${visibleFindingSql("f", "current_vendor")}
  GROUP BY f.type, f.value_normalized
  ${PII_SUMMARY_HAVING}`;

// One row per unique value found in a company's emails. Quoted-text findings
// are excluded here (a third party's data — never deleted, just not counted),
// and globally suppressed values are filtered out.
export function getVendorPiiSummary(vendorId: number): VendorPiiSummary {
  const d = getDb();
  const homeCountry = inferHomeCountry();
  const vendor = d.prepare("SELECT account_email FROM vendors WHERE id = ?").get(vendorId) as
    | { account_email: string | null }
    | undefined;
  const own = ownAddressRules(vendor?.account_email ?? undefined);

  const rows = d
    .prepare(
      `SELECT MIN(f.id) AS ref, f.type AS type, f.value_normalized AS value,
              MAX(m.date) AS lastSeen,
              MAX(f.country) AS country,
              ${PII_IS_FREQUENT_SQL} AS frequentAtCompany,
              ${CROSS_COMPANY_COUNT_SQL} AS companyCount
       ${VENDOR_VALUES_FROM}
       ORDER BY lastSeen DESC`,
    )
    .all(vendorId, vendorId) as Array<{
    ref: number;
    type: PiiType;
    value: string;
    lastSeen: number;
    country: string | null;
    frequentAtCompany: number;
    companyCount: number;
  }>;

  const values: VendorPiiValue[] = rows.map((r) => {
    const identifier = IDENTIFIER_TYPES.includes(r.type);
    return {
      ref: r.ref,
      type: r.type,
      maskedValue: maskValue(r.type, r.value),
      lastSeen: r.lastSeen,
      ...(r.type === "email" && isOwnAddress(r.value, own)
        ? { isOwnAddress: true }
        : {}),
      ...(homeCountry &&
      r.country &&
      LOCALE_TYPES.includes(r.type) &&
      r.country !== homeCountry
        ? { isForeignFormat: true }
        : {}),
      companyCount: r.companyCount,
      ...(identifier && r.frequentAtCompany
        ? { isFrequentAtCompany: true }
        : {}),
    };
  });

  return { values, coverage: getVendorPiiCoverage(vendorId) };
}

// The one place a full value leaves the main process, and only when the user
// asks: the review UI can't judge "is this mine?" from `a•••@•••.com`. The
// renderer holds what comes back in memory for as long as the toggle is on and
// never stores it. Rows are keyed by the same `ref` the summary handed out, so
// the caller matches them up without learning anything new about the grouping.
export function revealVendorPiiValues(vendorId: number): VendorPiiRevealedValue[] {
  return getDb()
    .prepare(`SELECT MIN(f.id) AS ref, f.value_normalized AS value ${VENDOR_VALUES_FROM}`)
    .all(vendorId, vendorId) as VendorPiiRevealedValue[];
}

// Resolve the renderer's opaque handle back to the pair suppression is keyed on.
// This is the only place (type, value_normalized) is recovered, and it never
// leaves the main process — callers return void.
function resolveFinding(findingId: number): { type: PiiType; value_normalized: string } {
  const row = getDb()
    .prepare("SELECT type, value_normalized FROM pii_findings WHERE id = ?")
    .get(findingId) as { type: PiiType; value_normalized: string } | undefined;
  // Re-analysis replaces a message's findings, so ids change. A handle held
  // across a re-sync stops resolving — say so instead of failing silently.
  if (!row) throw new Error("That value is no longer available. Reload the company page and try again.");
  return row;
}

// `Not mine` — hide a value from every aggregate, across all accounts/vendors.
export function suppressPiiFinding(findingId: number): void {
  const { type, value_normalized } = resolveFinding(findingId);
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO pii_suppressions (type, value_normalized, created_at) VALUES (?, ?, ?)",
    )
    .run(type, value_normalized, Date.now());
}

// Undo a suppression. The finding itself was never deleted, so the same handle
// still resolves.
export function unsuppressPiiFinding(findingId: number): void {
  const { type, value_normalized } = resolveFinding(findingId);
  getDb()
    .prepare("DELETE FROM pii_suppressions WHERE type = ? AND value_normalized = ?")
    .run(type, value_normalized);
}
