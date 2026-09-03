import { getDb } from "../db";
import type {
  PiiCompanyOrder,
  PiiOverview,
  PiiRevealedValue,
  PiiType,
  PiiValue,
  PiiValueCompany,
  VendorPiiSummary,
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
    case "date_of_birth":
      return `••-••-${v.slice(0, 4)}`;
    default:
      return "•••";
  }
}

// Count messages the engine has analyzed in any version. The summary does not
// filter findings by engine version either, so a version bump must not collapse
// this count to zero while the values it describes are still on screen.
function getScannedMessageCount(vendorId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS scanned
       FROM messages
       WHERE vendor_id = ?
         AND analysis_version IS NOT NULL`,
    )
    .get(vendorId) as { scanned: number };
  return row.scanned;
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

// Most queries exclude values marked `Not mine`. The overview, reveal path and
// company breakdown read both sides and partition only after grouping.
type SuppressionScope = "excluded" | "either";

const suppressionMatchSql = (
  findingAlias: string,
  valueColumn = "value_normalized",
): string => `EXISTS (
  SELECT 1 FROM global.pii_suppressions suppression
  WHERE suppression.type = ${findingAlias}.type
    AND suppression.value_normalized = ${findingAlias}.${valueColumn}
)`;

const suppressionSql = (findingAlias: string, scope: SuppressionScope): string => {
  if (scope === "either") return "";
  return `\n  AND NOT ${suppressionMatchSql(findingAlias)}`;
};

// The one ownership predicate used by every query. Connected addresses and
// confirmed findings all reach this view through the global profile tables.
const profileMatchSql = (
  findingAlias: string,
  valueColumn = "value_normalized",
): string => `EXISTS (
  SELECT 1 FROM global.profile_match_values profile_value
  WHERE profile_value.type = ${findingAlias}.type
    AND profile_value.value_normalized = ${findingAlias}.${valueColumn}
)`;

// These predicates are the visibility boundary shared by summaries, reveal and
// vendor filters. A positive profile assertion overrides every inferred engine
// exclusion and any stale suppression. The overview later partitions only
// unconfirmed suppressed values into its `Not mine` side.
const visibleFindingSql = (
  findingAlias: string,
  vendorAlias: string,
  suppression: SuppressionScope = "excluded",
): string => {
  const match = profileMatchSql(findingAlias);
  const inferred = `
    ${findingAlias}.in_quoted_text = 0
    AND ${findingAlias}.in_footer = 0
    AND ${findingAlias}.self_reference = 0
    AND NOT (
      ${findingAlias}.type IN (${sqlTypes(COMPANY_CONTACT_TYPES)})
      AND ${seenInCompanyFooterSql(findingAlias, vendorAlias)}
    )`;

  if (suppression === "either") return `(${match} OR (${inferred}))`;
  return `(${match} OR (${inferred}${suppressionSql(findingAlias, suppression)}))`;
};

// One indexed lookup by (type, value_normalized), counting company identities
// rather than raw vendor rows so regional domains do not fake wider presence.
// Takes the value's type/value expressions so the per-company summary and the
// mailbox-wide overview count company spread the exact same way.
const crossCompanyCountSql = (typeExpr: string, valueExpr: string): string => `(
  SELECT COUNT(DISTINCT ${companyIdSql("v2")})
  FROM pii_findings f2
  JOIN messages m2 ON f2.message_id = m2.id
  JOIN vendors v2 ON m2.vendor_id = v2.id
  WHERE f2.type = ${typeExpr}
    AND f2.value_normalized = ${valueExpr}
    AND ${visibleFindingSql("f2", "v2", "either")}
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
  ${profileMatchSql("f")}
  OR f.type IN (${sqlTypes(SPREAD_EXEMPT_TYPES)})
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

export function getProfileCountry(): string | undefined {
  const row = getDb()
    .prepare("SELECT country FROM global.profile WHERE id = 1")
    .get() as { country: string | null } | undefined;
  return row?.country ?? undefined;
}

interface VendorObservedOptions {
  type?: PiiType;
  nonEmailOnly?: boolean;
  primaryOnly?: boolean;
  homeCountry?: string;
}

/** SQL predicate over the outer `vendors` row. Summary/filter/Accounts callers
 * share the same inferred exclusions, profile escape and spread thresholds. */
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
      `(${profileMatchSql("f")} OR NOT (
        f.type IN (${sqlTypes(LOCALE_TYPES)})
        AND f.country IS NOT NULL
        AND f.country != ?
      ))`,
    );
    params.push(options.homeCountry);
  }

  // Promoting a company into Accounts on an identifier alone asks more of the
  // evidence: one held at a single company reads as that company's own
  // reference number, so it only counts when it spans more than one.
  const identifierEscape = options.primaryOnly
    ? `(${IS_IDENTIFIER_SQL} AND ${crossCompanyCountSql("f.type", "f.value_normalized")} > 1)`
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
      HAVING ${profileMatchSql("f")}
         OR f.type = 'email'
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
// identifier); High or Possible is everything else shown. A profile match is
// always High. Same visibility, grouping and shown-value predicates as the
// summary, so the icon and the panel cannot disagree.
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
           ${profileMatchSql("f")}
           OR ${crossCompanyCountSql("f.type", "f.value_normalized")} > 1
           OR (NOT ${isForeignFormat} AND NOT ${isFrequentIdentifier})
         )
      LIMIT 1
    )`,
    params,
  };
}

// Values found in a company's emails, grouped into rows. Shared verbatim by
// the summary and the reveal path so the two can never disagree: same
// exclusions, same grouping, same `ref` per row. User suppressions are included
// here and partitioned after grouping; inferred engine exclusions remain out.
//
// For values outside the profile, five exclusions mean "probably not the
// user's data": quoted text, footer placement, self-reference, matching company
// footer evidence, and the spread rule. A profile match overrides all five.
// Suppressed unmatched values are the user's own correction on top.
// queryVendors' piiType filter mirrors every one of these — see vendors.ts.
const VENDOR_VALUES_FROM = `
  FROM pii_findings f
  JOIN messages m ON f.message_id = m.id
  JOIN vendors current_vendor ON m.vendor_id = current_vendor.id
  CROSS JOIN (SELECT COUNT(*) AS n FROM messages WHERE vendor_id = ?) AS vendor_total
  WHERE m.vendor_id = ?
    AND ${visibleFindingSql("f", "current_vendor", "either")}
  GROUP BY f.type, f.value_normalized
  ${PII_SUMMARY_HAVING}`;

// What both grouped queries select, and what turns one of their rows into the
// masked row the renderer gets. The raw value is read here and left here.
interface GroupedValueRow {
  ref: number;
  type: PiiType;
  value: string;
  lastSeen: number;
  country: string | null;
  isMatch: number;
  frequentAtCompany: number;
  companyCount: number;
}

interface VendorValueRow extends GroupedValueRow {
  isSuppressed: number;
}

function toPiiValue(
  row: GroupedValueRow,
  homeCountry?: string,
): PiiValue {
  return {
    ref: row.ref,
    type: row.type,
    maskedValue: maskValue(row.type, row.value),
    lastSeen: row.lastSeen,
    ...(row.isMatch ? { isMatch: true } : {}),
    ...(homeCountry &&
    row.country &&
    LOCALE_TYPES.includes(row.type) &&
    row.country !== homeCountry
      ? { isForeignFormat: true }
      : {}),
    companyCount: row.companyCount,
    ...(IDENTIFIER_TYPES.includes(row.type) && row.frequentAtCompany
      ? { isFrequentAtCompany: true }
      : {}),
  };
}

// One row per unique value found in a company's emails. Inferred exclusions
// apply before grouping; global suppressions partition unmatched rows afterward.
export function getVendorPiiSummary(vendorId: number): VendorPiiSummary {
  const d = getDb();
  const homeCountry = getProfileCountry();

  const rows = d
    .prepare(
      `SELECT MIN(f.id) AS ref, f.type AS type, f.value_normalized AS value,
              MAX(m.date) AS lastSeen,
              MAX(f.country) AS country,
              MAX(${profileMatchSql("f")}) AS isMatch,
              MAX(${suppressionMatchSql("f")}) AS isSuppressed,
              ${PII_IS_FREQUENT_SQL} AS frequentAtCompany,
              ${crossCompanyCountSql("f.type", "f.value_normalized")} AS companyCount
       ${VENDOR_VALUES_FROM}
       ORDER BY lastSeen DESC`,
    )
    .all(vendorId, vendorId) as VendorValueRow[];

  const values: PiiValue[] = [];
  const suppressedValues: PiiValue[] = [];
  for (const row of rows) {
    const value = toPiiValue(row, homeCountry);
    if (row.isSuppressed && !row.isMatch) suppressedValues.push(value);
    else values.push(value);
  }

  return {
    values,
    suppressedValues,
    scannedMessages: getScannedMessageCount(vendorId),
  };
}

// The same values, across every company at once — the Data page.
//
// Two levels of grouping, because the per-company rules have to run first: the
// inner group is exactly what one company's panel lists (same exclusions,
// profile escape and spread rule), and the outer group merges that value across
// companies into one row.
// A per-vendor message total can't be a correlated CROSS JOIN at this level, so
// it comes from one grouped pass over messages.
const GLOBAL_VALUES_CTE = `
  WITH vendor_totals AS (
    SELECT vendor_id, COUNT(*) AS n FROM messages GROUP BY vendor_id
  ),
  vendor_values AS (
    SELECT f.type AS type, f.value_normalized AS value,
           MIN(f.id) AS ref,
           MAX(m.date) AS lastSeen,
           MAX(f.country) AS country,
           ${PII_IS_FREQUENT_SQL} AS frequentAtCompany
    FROM pii_findings f
    JOIN messages m ON f.message_id = m.id
    JOIN vendors current_vendor ON m.vendor_id = current_vendor.id
    JOIN vendor_totals vendor_total ON vendor_total.vendor_id = current_vendor.id
    WHERE ${visibleFindingSql("f", "current_vendor", "either")}
    GROUP BY current_vendor.id, f.type, f.value_normalized
    ${PII_SUMMARY_HAVING}
  )`;

// `ref` is the lowest finding id across the companies holding the value, so the
// overview and its reveal path key rows identically — and, like every other ref,
// it resolves to nothing more than the (type, value) pair it stands for.
const GLOBAL_VALUES_GROUP = `FROM vendor_values vv GROUP BY type, value`;

interface GlobalValueRow extends GroupedValueRow {
  isSuppressed: number;
}

/** Every masked value found across the whole mailbox, partitioned by the
 *  user's global `Not mine` correction after one shared scan. */
export function getPiiOverview(): PiiOverview {
  const homeCountry = getProfileCountry();
  const rows = getDb()
    .prepare(
      `${GLOBAL_VALUES_CTE}
       SELECT type, value, MIN(ref) AS ref,
              MAX(lastSeen) AS lastSeen,
              MAX(country) AS country,
              MAX(${profileMatchSql("vv", "value")}) AS isMatch,
              MAX(${suppressionMatchSql("vv", "value")}) AS isSuppressed,
              MAX(frequentAtCompany) AS frequentAtCompany,
              ${crossCompanyCountSql("vv.type", "vv.value")} AS companyCount
       ${GLOBAL_VALUES_GROUP}
       ORDER BY lastSeen DESC`,
    )
    .all() as GlobalValueRow[];

  const values: PiiValue[] = [];
  const suppressedValues: PiiValue[] = [];
  for (const row of rows) {
    const value = toPiiValue(row, homeCountry);
    if (row.isSuppressed && !row.isMatch) suppressedValues.push(value);
    else values.push(value);
  }
  return { values, suppressedValues };
}

// The companies holding one value, which is what a Personal Data row expands to
// show. Same visibility predicate as the cross-company count on that row's badge,
// so the list and the number can never disagree, and company identities rather
// than vendor rows, so a company's regional domains collapse into one entry.
// Takes the same opaque ref the row carries and returns no value of any kind.
//
// `lastSeen` is the company's own last contact, not the last sighting of this
// value: the two questions a user asks here are "are they still active?" and
// "is this an old contact that may still hold it?", and both are about the
// relationship. `order` picks which of those they are asking.
const PII_VALUE_COMPANY_LIMIT = 5;

export function getPiiValueCompanies(
  findingId: number,
  order: PiiCompanyOrder = "recent",
): PiiValueCompany[] {
  const { type, value_normalized } = resolveFinding(findingId);
  return getDb()
    .prepare(
      `SELECT COALESCE(MAX(v.company_slug), MIN(v.root_domain)) AS groupKey,
              MIN(v.name) AS name,
              MAX(contact.last_contact) AS lastSeen
       FROM pii_findings f
       JOIN messages m ON f.message_id = m.id
       JOIN vendors v ON m.vendor_id = v.id
       JOIN (
         SELECT vendor_id, MAX(date) AS last_contact FROM messages GROUP BY vendor_id
       ) contact ON contact.vendor_id = v.id
       WHERE f.type = ?
         AND f.value_normalized = ?
         AND ${visibleFindingSql("f", "v", "either")}
       GROUP BY ${companyIdSql("v")}
       ORDER BY lastSeen ${order === "oldest" ? "ASC" : "DESC"}
       LIMIT ${PII_VALUE_COMPANY_LIMIT}`,
    )
    .all(type, value_normalized) as PiiValueCompany[];
}

// The one place a full value leaves the main process, and only when the user
// asks: the review UI can't judge "is this mine?" from `a•••@•••.com`. The
// renderer holds what comes back in memory for as long as the toggle is on and
// never stores it. Rows are keyed by the same `ref` the list handed out, so the
// caller matches them up without learning anything new about the grouping. Both
// paths reuse their list's own query, so neither can reveal a value absent from
// its active or `Not mine` list.
export function revealVendorPiiValues(vendorId: number): PiiRevealedValue[] {
  return getDb()
    .prepare(`SELECT MIN(f.id) AS ref, f.value_normalized AS value ${VENDOR_VALUES_FROM}`)
    .all(vendorId, vendorId) as PiiRevealedValue[];
}

// Covers marked-`Not mine` values too: judging "did I get that one wrong?" needs
// the value just as much as judging it the first time. The suppression clause is
// all-or-nothing per value, so the refs are identical either way.
export function revealPiiValues(): PiiRevealedValue[] {
  return getDb()
    .prepare(
      `${GLOBAL_VALUES_CTE} SELECT MIN(ref) AS ref, value ${GLOBAL_VALUES_GROUP}`,
    )
    .all() as PiiRevealedValue[];
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

/** Remove a value from every aggregate, in every account. */
export function suppressPiiFinding(findingId: number): void {
  const { type, value_normalized } = resolveFinding(findingId);
  const target = getDb();
  const isMatch = target
    .prepare(
      `SELECT 1
       FROM global.profile_match_values
       WHERE type = ? AND value_normalized = ?`,
    )
    .get(type, value_normalized);
  if (isMatch) {
    throw new Error("Remove this value from your profile before marking it as not yours.");
  }
  target
    .prepare(
      `INSERT INTO global.pii_suppressions (type, value_normalized)
       VALUES (?, ?)
       ON CONFLICT(type, value_normalized) DO NOTHING`,
    )
    .run(type, value_normalized);
}

/** Add one reviewed finding to the global profile and clear any conflicting
 * correction. The opaque ref and normalized value never leave the main process. */
export function confirmPiiFinding(findingId: number): boolean {
  const target = getDb();
  const confirm = target.transaction(() => {
    const { type, value_normalized } = resolveFinding(findingId);
    const alreadyMatched = !!target
      .prepare(
        `SELECT 1
         FROM global.profile_match_values
         WHERE type = ? AND value_normalized = ?`,
      )
      .get(type, value_normalized);

    switch (type) {
      case "email":
        target.prepare(
          `INSERT INTO global.profile_emails (address, value_normalized)
           VALUES (?, ?)
           ON CONFLICT(value_normalized) DO NOTHING`,
        ).run(value_normalized, value_normalized);
        break;
      case "phone":
        target.prepare(
          `INSERT INTO global.profile_phones (number_raw, value_normalized)
           VALUES (?, ?)
           ON CONFLICT(value_normalized) DO NOTHING`,
        ).run(value_normalized, value_normalized);
        break;
      case "address":
        target.prepare(
          `INSERT INTO global.profile_addresses (raw, value_normalized)
           VALUES (?, ?)
           ON CONFLICT(value_normalized) DO NOTHING`,
        ).run(value_normalized, value_normalized);
        break;
      case "postal_code":
        target.prepare(
          `INSERT INTO global.profile_addresses
             (raw, value_normalized, postal_code_normalized)
           SELECT ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1
             FROM global.profile_addresses
             WHERE postal_code_normalized = ?
           )
           ON CONFLICT(value_normalized) DO UPDATE
             SET postal_code_normalized = excluded.postal_code_normalized`,
        ).run(
          value_normalized,
          value_normalized,
          value_normalized,
          value_normalized,
        );
        break;
      case "national_id":
        target.prepare(
          `INSERT INTO global.profile_national_ids (value_normalized)
           VALUES (?)
           ON CONFLICT(value_normalized) DO NOTHING`,
        ).run(value_normalized);
        break;
      case "iban":
      case "credit_card":
        target.prepare(
          `INSERT INTO global.profile_payments (type, value_normalized)
           VALUES (?, ?)
           ON CONFLICT(type, value_normalized) DO NOTHING`,
        ).run(type, value_normalized);
        break;
    }

    target.prepare(
      `DELETE FROM global.pii_suppressions
       WHERE type = ? AND value_normalized = ?`,
    ).run(type, value_normalized);

    return (
      !alreadyMatched
      && !!target
        .prepare(
          `SELECT 1
           FROM global.profile_match_values
           WHERE type = ? AND value_normalized = ?`,
        )
        .get(type, value_normalized)
    );
  });

  return confirm();
}
