import { getDb } from "../db";
import { RISK_CATEGORIES } from "@shared/languages";
import { APP_CONFIG } from "@shared/config";
import { getRootDomain } from "@shared/utils";
import type {
  Breach,
  BreachInfo,
  Company,
  Vendor,
  VendorQuery,
  VendorDetail,
  VendorStatus,
  Message,
  RiskLevel,
  ActivityEntry,
} from "@shared/types";
import { DEFAULT_CATEGORY, DEFAULT_RISK } from "@shared/types";
import { dbLog } from "../utils/log";

function toVendor(raw: Record<string, unknown>): Vendor {
  return {
    ...(raw as Omit<Vendor, "has_marketing" | "has_account" | "has_rfc8058" | "has_orders" | "risk_level">),
    has_marketing: !!raw.has_marketing,
    has_account: !!raw.has_account,
    has_rfc8058: !!raw.has_rfc8058,
    has_orders: !!raw.has_orders,
    risk_level: ((raw.computed_risk ?? raw.risk_level) as RiskLevel | undefined),
  };
}

interface BreachRow {
  name: string;
  title: string;
  domain: string;
  breach_date: string;
  pwn_count: number;
  description: string | null;
  data_classes: string | null;
  is_verified: number;
  is_sensitive: number;
}

function isBreachesAttached(): boolean {
  const d = getDb();
  return !!(
    d.prepare("SELECT name FROM pragma_database_list WHERE name = 'breaches'").get()
  );
}

function parseBreachInfo(vendor: Vendor, row: BreachRow): BreachInfo {
  let dataClasses: string[];
  try {
    dataClasses = JSON.parse(row.data_classes ?? "[]");
  } catch {
    dataClasses = [];
  }

  // first_seen is stored in milliseconds (MIN(messages.date)); breach_date is ISO "YYYY-MM-DD"
  const breachMs = new Date(row.breach_date).getTime();
  const likelyAffected =
    vendor.first_seen !== undefined && vendor.first_seen < breachMs;

  const breach: Breach = {
    name: row.name,
    title: row.title,
    domain: row.domain,
    breachDate: row.breach_date,
    pwnCount: row.pwn_count,
    description: row.description ?? "",
    dataClasses,
    isVerified: !!row.is_verified,
    isSensitive: !!row.is_sensitive,
  };

  return { breach, likelyAffected };
}

// SQL condition: vendors where first_seen predates a breach on their domain (user likely had an account).
// first_seen is stored in milliseconds; strftime('%s', ...) returns seconds, so multiply by 1000.
// Also matches subdomain vendors (e.g. kvibes.substack.com) against root-level breaches (substack.com).
const HAS_BREACH_SQL = `EXISTS (
  SELECT 1 FROM breaches.breaches b
  WHERE (b.domain = vendors.root_domain OR vendors.root_domain LIKE '%.' || b.domain)
  AND vendors.first_seen IS NOT NULL
  AND vendors.first_seen < strftime('%s', b.breach_date) * 1000
)`;

// SQL condition: any vendor whose domain appears in the breach database, regardless of first_seen.
const ON_BREACH_LIST_SQL = `EXISTS (
  SELECT 1 FROM breaches.breaches b
  WHERE (b.domain = vendors.root_domain OR vendors.root_domain LIKE '%.' || b.domain)
)`;

// Any vendor with order-type messages holds payment + shipping address data → always high.
// This is category-independent: a streaming service that sends an "invoice" is high risk.
export const COMPUTED_RISK_CASE = `
  CASE
    WHEN category_id IN ('financial','healthcare','government') THEN 'high'
    WHEN EXISTS (
      SELECT 1 FROM messages m WHERE m.vendor_id = vendors.id AND m.type = 'order' LIMIT 1
    ) THEN 'high'
    WHEN category_id = 'social' AND has_account = 1 THEN 'medium'
    WHEN category_id = 'social' THEN 'low'
    WHEN category_id = 'marketing' AND has_account = 1 THEN 'medium'
    WHEN category_id = 'marketing' THEN 'low'
    WHEN category_id IN ('shopping','communication','services') THEN 'medium'
    WHEN category_id = 'entertainment' THEN 'low'
    ELSE 'medium'
  END
`;

function riskWhereClause(risk: string): string {
  if (risk === "high") return `(
    category_id IN ('financial','healthcare','government')
    OR EXISTS (
      SELECT 1 FROM messages m WHERE m.vendor_id = vendors.id AND m.type = 'order' LIMIT 1
    )
  )`;
  if (risk === "medium") return `(
    NOT EXISTS (SELECT 1 FROM messages m WHERE m.vendor_id = vendors.id AND m.type = 'order' LIMIT 1)
    AND (
      category_id IN ('shopping','communication','services')
      OR (category_id = 'social' AND has_account = 1)
      OR (category_id = 'marketing' AND has_account = 1)
    )
  )`;
  if (risk === "low") return `(
    NOT EXISTS (SELECT 1 FROM messages m WHERE m.vendor_id = vendors.id AND m.type = 'order' LIMIT 1)
    AND (
      category_id = 'entertainment'
      OR (category_id = 'social' AND has_account = 0)
      OR (category_id = 'marketing' AND has_account = 0)
    )
  )`;
  return "1=1";
}

const ACTIVITY_RANGES: Record<string, [number, number | null]> = {
  recent:    [0, 90],
  active:    [90, 365],
  inactive:  [365, 730],
  stale:     [730, null],
  dead:      [1825, null],
};

const VOLUME_RANGES: Record<string, [number, number | null]> = {
  oneoff: [0, 5],
  low:    [6, 25],
  medium: [26, 100],
  high:   [101, null],
};

function findCompanyByDomain(rootDomain: string): {
  slug: string;
  name: string;
  categories: string | null;
} | undefined {
  const d = getDb();
  const attached = d
    .prepare("SELECT name FROM pragma_database_list WHERE name = 'companies'")
    .get();
  if (!attached) return undefined;

  const row = d
    .prepare(
      `SELECT slug, name, categories FROM companies.companies
       WHERE ',' || COALESCE(domains,'') || ',' LIKE '%,' || ? || ',%'
       LIMIT 1`
    )
    .get(rootDomain) as
    | { slug: string; name: string; categories: string | null }
    | undefined;

  return row;
}

function inferVendorName(rootDomain: string): string {
  const part = rootDomain.split(".")[0];
  if (!part) return rootDomain;
  return part.charAt(0).toUpperCase() + part.slice(1);
}

function mapCompanyCategoryToApp(categoriesJson: string | null): string {
  if (!categoriesJson) return DEFAULT_CATEGORY;
  try {
    const cats = JSON.parse(categoriesJson) as string[];
    const first = cats[0];
    if (first && typeof first === "string") return first;
  } catch {
    /* ignore */
  }
  return DEFAULT_CATEGORY;
}

// Multi-tenant platforms where each subdomain is a distinct publisher or company.
// For these we use the full sender subdomain as the vendor key rather than stripping to root.
// Kept small and evidence-based — add entries when users report mis-grouped vendors.
const PLATFORM_DOMAINS = new Set([
  // Newsletter platforms — username@platform.com, username = publication
  "substack.com",
  "beehiiv.com",
  "buttondown.email",
  // Support platforms — support@company.platform.com, subdomain = company
  "zendesk.com",
  "intercom-mail.com",
  "freshdesk.com",
  // Catch-all for rare ghost.io sending domain appearances
  "ghost.io",
  // Luma event platform — each org/event gets a dedicated address on a shared subdomain,
  // username is the differentiator (nftplayground@calendar.luma-mail.com → nftplayground.calendar.luma-mail.com).
  // noreply@luma-mail.com (generic platform sender) stays as luma-mail.com.
  "calendar.luma-mail.com",
  "user.luma-mail.com",
]);

// Derive the vendor grouping key from a sender email address.
// For normal senders: strip to root domain (e.g. mail.example.com → example.com).
// For platform domains with a subdomain in the email (e.g. support@netlify.zendesk.com):
//   use the full subdomain as the key (netlify.zendesk.com).
// For platform domains where everyone sends from the root (e.g. weekinethereum@substack.com):
//   synthesise a key from the username (weekinethereum.substack.com).
export function getVendorDomain(senderEmail: string): string {
  const atIdx = senderEmail.indexOf("@");
  const domain = atIdx !== -1 ? senderEmail.slice(atIdx + 1).toLowerCase() : senderEmail.toLowerCase();
  const root = getRootDomain(domain);

  // Third case: the email domain itself is a platform subdomain where the username
  // differentiates senders (e.g. nftplayground@calendar.luma-mail.com).
  // Distinct from Zendesk-style where the subdomain IS the company key.
  if (PLATFORM_DOMAINS.has(domain) && domain !== root) {
    if (atIdx !== -1) {
      const username = senderEmail.slice(0, atIdx).toLowerCase();
      return `${username}.${domain}`;
    }
    return domain;
  }

  if (!PLATFORM_DOMAINS.has(root)) return root;

  if (domain !== root) {
    // Subdomain already in the email domain (Zendesk, Intercom, Freshdesk style)
    return domain;
  }

  // Root domain only — differentiate by username (Substack, Beehiiv style)
  if (atIdx !== -1) {
    const username = senderEmail.slice(0, atIdx).toLowerCase();
    return `${username}.${root}`;
  }

  return root;
}

export function findOrCreateVendor(rootDomain: string): number {
  const d = getDb();

  const existing = d
    .prepare("SELECT id FROM vendors WHERE root_domain = ?")
    .get(rootDomain) as { id: number } | undefined;

  if (existing) return existing.id;

  const company = findCompanyByDomain(rootDomain);
  const now = Math.floor(Date.now() / 1000);

  const row = d
    .prepare(
      `INSERT INTO vendors (root_domain, company_slug, name, category_id, risk_level, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
    .get(
      rootDomain,
      company?.slug ?? null,
      company?.name ?? inferVendorName(rootDomain),
      company ? mapCompanyCategoryToApp(company.categories) : DEFAULT_CATEGORY,
      DEFAULT_RISK,
      now,
      now
    ) as { id: number };

  return row.id;
}


export function updateVendorStats(vendorId: number) {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT
        COUNT(*) as message_count,
        COUNT(DISTINCT sender_email) as sender_count,
        MIN(date) as first_seen,
        MAX(date) as last_seen
       FROM messages WHERE vendor_id = ?`
    )
    .get(vendorId) as {
      message_count: number;
      sender_count: number;
      first_seen: number | null;
      last_seen: number | null;
    };

  const now = Math.floor(Date.now() / 1000);
  d.prepare(
    `UPDATE vendors SET
      message_count = ?, sender_count = ?, first_seen = ?, last_seen = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(
    row.message_count,
    row.sender_count,
    row.first_seen,
    row.last_seen,
    now,
    vendorId
  );

  // Improve inferred vendor name from most recent sender display name,
  // but only for vendors not matched to companies.db.
  const senderRow = d
    .prepare(
      `SELECT sender_name FROM messages
       WHERE vendor_id = ? AND sender_name IS NOT NULL AND sender_name != ''
       ORDER BY CASE WHEN type = 'bulk' THEN 0 ELSE 1 END, date DESC
       LIMIT 1`
    )
    .get(vendorId) as { sender_name: string } | undefined;

  if (senderRow?.sender_name) {
    d.prepare(
      `UPDATE vendors SET name = ? WHERE id = ? AND company_slug IS NULL`
    ).run(senderRow.sender_name, vendorId);
  }
}

export function updateVendorFlags(vendorId: number) {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT
        MAX(CASE WHEN type = 'bulk' THEN 1 ELSE 0 END) as has_marketing,
        MAX(CASE WHEN type IN ('transactional', 'order') THEN 1 ELSE 0 END) as has_account
       FROM messages WHERE vendor_id = ?`
    )
    .get(vendorId) as { has_marketing: number; has_account: number };

  d.prepare(
    `UPDATE vendors SET has_marketing = ?, has_account = ? WHERE id = ?`
  ).run(row.has_marketing ?? 0, row.has_account ?? 0, vendorId);
}

export function recomputeAllVendorFlags() {
  const d = getDb();
  d.prepare(
    `UPDATE vendors SET
      has_marketing = COALESCE((SELECT MAX(CASE WHEN type = 'bulk' THEN 1 ELSE 0 END) FROM messages WHERE vendor_id = vendors.id), 0),
      has_account = COALESCE((SELECT MAX(CASE WHEN type IN ('transactional', 'order') THEN 1 ELSE 0 END) FROM messages WHERE vendor_id = vendors.id), 0)
     WHERE id IN (SELECT DISTINCT vendor_id FROM messages)`
  ).run();
}

export function matchVendorCompanies() {
  const d = getDb();

  const attached = d
    .prepare("SELECT name FROM pragma_database_list WHERE name = 'companies'")
    .get();
  if (!attached) {
    dbLog.info("companies.db not attached — vendors use inferred names only");
    return;
  }

  const vendors = d
    .prepare("SELECT id, root_domain, name FROM vendors WHERE company_slug IS NULL AND root_domain IS NOT NULL")
    .all() as Array<{ id: number; root_domain: string; name: string }>;

  if (vendors.length === 0) return;

  const domainMatchStmt = d.prepare(
    `SELECT slug FROM companies.companies
     WHERE ',' || COALESCE(domains,'') || ',' LIKE '%,' || ? || ',%'
     LIMIT 1`
  );
  const nameMatchStmt = d.prepare(
    `SELECT slug FROM companies.companies
     WHERE name LIKE '%' || ? || '%' OR runs LIKE '%' || ? || '%'
     LIMIT 1`
  );
  const updateStmt = d.prepare("UPDATE vendors SET company_slug = ? WHERE id = ?");

  let matched = 0;
  for (const v of vendors) {
    if (APP_CONFIG.PERSONAL_DOMAINS.includes(v.root_domain)) continue;

    const domainRow = domainMatchStmt.get(v.root_domain) as { slug: string } | undefined;
    if (domainRow) {
      updateStmt.run(domainRow.slug, v.id);
      matched++;
      continue;
    }

    if (v.name && v.name.length >= 3) {
      const nameRow = nameMatchStmt.get(v.name, v.name) as { slug: string } | undefined;
      if (nameRow) {
        updateStmt.run(nameRow.slug, v.id);
        matched++;
      }
    }
  }
}

const RISK_PRIORITY: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function categorizeVendors() {
  const d = getDb();

  const sourceCatMap = new Map<string, { category: string; risk: string }>();
  for (const [category, info] of Object.entries(RISK_CATEGORIES)) {
    for (const sc of info.sourceCategories) {
      sourceCatMap.set(sc.toLowerCase(), { category, risk: info.risk });
    }
  }

  const attached = d
    .prepare("SELECT name FROM pragma_database_list WHERE name = 'companies'")
    .get();

  if (attached) {
    const companyMatched = d
      .prepare(
        `SELECT v.id, c.categories
         FROM vendors v
         JOIN companies.companies c ON v.company_slug = c.slug
         WHERE v.company_slug IS NOT NULL`
      )
      .all() as Array<{ id: number; categories: string | null }>;

    const updateStmt = d.prepare(
      "UPDATE vendors SET category_id = ?, risk_level = ? WHERE id = ?"
    );

    for (const { id, categories } of companyMatched) {
      if (!categories) continue;

      let parsed: string[];
      try {
        parsed = JSON.parse(categories);
      } catch {
        continue;
      }

      let bestCategory: string | undefined;
      let bestRisk = 0;

      for (const compCat of parsed) {
        const match = sourceCatMap.get(compCat.toLowerCase());
        if (match && (RISK_PRIORITY[match.risk] ?? 0) > bestRisk) {
          bestCategory = match.category;
          bestRisk = RISK_PRIORITY[match.risk] ?? 0;
        }
      }

      if (bestCategory) {
        const riskLabel =
          Object.entries(RISK_PRIORITY).find(([, v]) => v === bestRisk)?.[0] ??
          "unknown";
        updateStmt.run(bestCategory, riskLabel, id);
      }
    }
  }

  const keywordEntries: Array<{
    category: string;
    risk: string;
    keywords: string[];
  }> = [];
  for (const [category, info] of Object.entries(RISK_CATEGORIES)) {
    const allKeywords: string[] = [];
    for (const langKeywords of Object.values(info.keywords)) {
      allKeywords.push(...langKeywords);
    }
    keywordEntries.push({ category, risk: info.risk, keywords: allKeywords });
  }
  keywordEntries.sort(
    (a, b) => (RISK_PRIORITY[b.risk] ?? 0) - (RISK_PRIORITY[a.risk] ?? 0)
  );

  const unmatched = d
    .prepare(
      "SELECT id, name, root_domain FROM vendors WHERE company_slug IS NULL"
    )
    .all() as Array<{ id: number; name: string | null; root_domain: string | null }>;

  const subjectsStmt = d.prepare(
    `SELECT subject FROM messages WHERE vendor_id = ? AND subject IS NOT NULL LIMIT 10`
  );
  const updateStmt2 = d.prepare(
    "UPDATE vendors SET category_id = ?, risk_level = ? WHERE id = ?"
  );

  for (const v of unmatched) {
    const subjects = (
      subjectsStmt.all(v.id) as Array<{ subject: string }>
    )
      .map((r) => r.subject)
      .join(" ");
    const haystack = `${v.name ?? ""} ${v.root_domain ?? ""} ${subjects}`.toLowerCase();

    let found = false;
    for (const entry of keywordEntries) {
      for (const kw of entry.keywords) {
        if (haystack.includes(kw.toLowerCase())) {
          updateStmt2.run(entry.category, entry.risk, v.id);
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      updateStmt2.run(DEFAULT_CATEGORY, DEFAULT_RISK, v.id);
    }
  }
}

const VENDOR_SORT_COLUMNS = [
  "message_count",
  "last_seen",
  "name",
  "root_domain",
  "risk",
];

// For risk sort: a single searched CASE returning a priority integer (1=high, 2=medium, 3=low).
// Mirrors COMPUTED_RISK_CASE logic directly — avoids nesting one CASE inside another.
const RISK_SORT_EXPR = `
  CASE
    WHEN category_id IN ('financial','healthcare','government') THEN 1
    WHEN EXISTS (
      SELECT 1 FROM messages m WHERE m.vendor_id = vendors.id AND m.type = 'order' LIMIT 1
    ) THEN 1
    WHEN category_id IN ('shopping','communication','services') THEN 2
    WHEN category_id = 'social' AND has_account = 1 THEN 2
    WHEN category_id = 'marketing' AND has_account = 1 THEN 2
    WHEN category_id = 'social' THEN 3
    WHEN category_id = 'marketing' THEN 3
    WHEN category_id = 'entertainment' THEN 3
    ELSE 2
  END`;

export function queryVendors(
  query: VendorQuery
): { vendors: Vendor[]; total: number } {
  const d = getDb();

  const {
    page,
    limit,
    sortBy = "message_count",
    sortDir = "DESC",
    search,
    category,
    risk,
    showReviewed = false,
  } = query;

  const conditions: string[] = ["1=1"];
  const params: (string | number)[] = [];

  if (category) {
    conditions.push("category_id = ?");
    params.push(category);
  }
  if (risk) {
    conditions.push(riskWhereClause(risk));
  }
  if (showReviewed) {
    conditions.push("status = 'reviewed'");
  } else {
    conditions.push("(status IS NULL OR status != 'reviewed')");
  }
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push("(name LIKE ? OR root_domain LIKE ?)");
    params.push(term, term);
  }
  if (query.hasAccount || query.filter === "accounts") {
    conditions.push("has_account = 1");
  }
  if (query.filter === "lists") {
    conditions.push("has_marketing = 1");
    conditions.push(`EXISTS (
      SELECT 1 FROM messages m_active
      WHERE m_active.vendor_id = vendors.id
        AND m_active.type = 'bulk'
        AND (m_active.status IS NULL OR m_active.status != 'unsubscribed')
    )`);
  }
  if (query.activity) {
    const range = ACTIVITY_RANGES[query.activity];
    if (range) {
      const [min, max] = range;
      if (max === null) {
        conditions.push(`(strftime('%s','now') * 1000 - last_seen) / 86400000.0 >= ?`);
        params.push(min);
      } else {
        conditions.push(`(strftime('%s','now') * 1000 - last_seen) / 86400000.0 BETWEEN ? AND ?`);
        params.push(min, max);
      }
    }
  }
  if (query.dataType) {
    if (query.dataType === "has_orders") {
      conditions.push(`EXISTS (SELECT 1 FROM messages m WHERE m.vendor_id = vendors.id AND m.type = 'order' LIMIT 1)`);
    } else if (query.dataType === "has_account") {
      conditions.push(`has_account = 1`);
    } else if (query.dataType === "marketing_only") {
      conditions.push(`has_marketing = 1 AND has_account = 0`);
    }
  }
  if (query.volume) {
    const range = VOLUME_RANGES[query.volume];
    if (range) {
      const [min, max] = range;
      if (max === null) {
        conditions.push(`message_count >= ?`);
        params.push(min);
      } else {
        conditions.push(`message_count BETWEEN ? AND ?`);
        params.push(min, max);
      }
    }
  }
  if (query.maxMessages !== undefined) {
    conditions.push(`message_count <= ?`);
    params.push(query.maxMessages);
  }
  if (query.breached && isBreachesAttached()) {
    conditions.push(HAS_BREACH_SQL);
  }
  if (query.onBreachList && isBreachesAttached()) {
    conditions.push(ON_BREACH_LIST_SQL);
  }

  // Exclude vendors on personal/webmail domains (always 1:1 contacts, never vendors)
  if (APP_CONFIG.PERSONAL_DOMAINS.length > 0) {
    const placeholders = APP_CONFIG.PERSONAL_DOMAINS.map(() => "?").join(",");
    conditions.push(`(root_domain IS NULL OR root_domain NOT IN (${placeholders}))`);
    params.push(...APP_CONFIG.PERSONAL_DOMAINS);
  }

  // Vendors the user has explicitly acted on (reviewed or unsubscribed/trashed) are always
  // retained regardless of message state, since deleting emails shouldn't erase the record.
  const actioned = `(status = 'reviewed' OR EXISTS (SELECT 1 FROM action_log al WHERE al.vendor_id = vendors.id LIMIT 1))`;

  // Exclude vendors where every message is personal (1:1 contacts with custom domains)
  conditions.push(`(EXISTS (
    SELECT 1 FROM messages m
    WHERE m.vendor_id = vendors.id
    AND (m.type IS NULL OR m.type != 'personal')
    LIMIT 1
  ) OR ${actioned})`);

  conditions.push(`(EXISTS (
    SELECT 1 FROM messages m
    WHERE m.vendor_id = vendors.id
    AND NOT EXISTS (
      SELECT 1 FROM whitelist w
      WHERE (w.value LIKE '%@%' AND m.sender_email = w.value)
         OR (w.value NOT LIKE '%@%' AND (
               m.sender_email LIKE '%@' || w.value
            OR m.sender_email LIKE '%.' || w.value
         ))
    )
  ) OR ${actioned})`);

  const whereClause = conditions.join(" AND ");
  const col = VENDOR_SORT_COLUMNS.includes(sortBy ?? "") ? sortBy : "message_count";
  const dir = sortDir === "ASC" ? "ASC" : "DESC";
  const orderExpr = col === "risk" ? RISK_SORT_EXPR : col;

  const total = (
    d
      .prepare(`SELECT COUNT(*) as c FROM vendors WHERE ${whereClause}`)
      .get(...params) as { c: number }
  ).c;

  const offset = (page - 1) * limit;
  const vendors = (d
    .prepare(
      `SELECT *,
        COALESCE((
          SELECT 1 FROM messages m
          WHERE m.vendor_id = vendors.id
            AND m.unsubscribe_method = 'rfc8058'
          LIMIT 1
        ), 0) AS has_rfc8058,
        COALESCE((
          SELECT 1 FROM messages m WHERE m.vendor_id = vendors.id AND m.type = 'order' LIMIT 1
        ), 0) AS has_orders,
        ${COMPUTED_RISK_CASE} AS computed_risk
       FROM vendors WHERE ${whereClause} ORDER BY ${orderExpr} ${dir}${col === "risk" ? ", message_count DESC" : ""} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Record<string, unknown>[])
    .map(toVendor);

  // Enrich with breach data if breaches.db is attached.
  // Match exact domain OR subdomain of a breached root (e.g. kvibes.substack.com → substack.com).
  const breachesReady = isBreachesAttached();
  const breachStmt = breachesReady
    ? d.prepare(
        `SELECT name, title, domain, breach_date, pwn_count, description, data_classes, is_verified, is_sensitive
         FROM breaches.breaches
         WHERE domain = ? OR ? LIKE '%.' || domain
         ORDER BY breach_date DESC`
      )
    : null;

  const enriched = vendors.map((v) => {
    if (!breachStmt || !v.root_domain) return v;
    const rows = breachStmt.all(v.root_domain, v.root_domain) as BreachRow[];
    if (rows.length === 0) return v;
    return { ...v, breachInfo: rows.map((row) => parseBreachInfo(v, row)) };
  });

  return { vendors: enriched, total };
}

export function updateVendor(id: number, updates: { status?: VendorStatus }): void {
  const d = getDb();
  d.prepare("UPDATE vendors SET status = ? WHERE id = ?").run(
    updates.status ?? null,
    id
  );
}

export function getVendorById(id: number): Vendor | undefined {
  const d = getDb();
  const raw = d.prepare("SELECT * FROM vendors WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return raw ? toVendor(raw) : undefined;
}

export function getVendorByDomain(domain: string): Vendor | undefined {
  const d = getDb();
  const raw = d
    .prepare("SELECT * FROM vendors WHERE root_domain = ?")
    .get(domain) as Record<string, unknown> | undefined;
  return raw ? toVendor(raw) : undefined;
}

export function getVendorByEmail(email: string): Vendor | undefined {
  const d = getDb();
  const raw = d
    .prepare(
      `SELECT v.* FROM vendors v
       JOIN messages m ON m.vendor_id = v.id
       WHERE m.sender_email = ?
       LIMIT 1`
    )
    .get(email) as Record<string, unknown> | undefined;
  return raw ? toVendor(raw) : undefined;
}

export function deleteVendor(id: number): void {
  const d = getDb();
  d.prepare("DELETE FROM vendors WHERE id = ?").run(id);
}

export function getVendorDetail(groupKey: string): VendorDetail {
  const d = getDb();

  const raw = d
    .prepare(
      `SELECT *,
        COALESCE((
          SELECT 1 FROM messages m WHERE m.vendor_id = vendors.id AND m.type = 'order' LIMIT 1
        ), 0) AS has_orders,
        ${COMPUTED_RISK_CASE} AS computed_risk
       FROM vendors WHERE company_slug = ? OR root_domain = ?`
    )
    .get(groupKey, groupKey) as Record<string, unknown> | undefined;

  if (!raw) throw new Error("Vendor not found");
  const vendor = toVendor(raw);

  const senders = d
    .prepare(
      `SELECT sender_email, sender_name, COUNT(*) as message_count
       FROM messages WHERE vendor_id = ? GROUP BY sender_email, sender_name`
    )
    .all(vendor.id) as Array<{ sender_email: string; sender_name?: string; message_count: number }>;

  const bulkMessages = d
    .prepare(
      `SELECT * FROM messages WHERE vendor_id = ? AND type = 'bulk' ORDER BY date DESC LIMIT 50`
    )
    .all(vendor.id) as Message[];

  const accountMessages = d
    .prepare(
      `SELECT * FROM messages WHERE vendor_id = ? AND type IN ('transactional', 'order') ORDER BY date DESC LIMIT 50`
    )
    .all(vendor.id) as Message[];

  const allMessages = d
    .prepare(`SELECT * FROM messages WHERE vendor_id = ? ORDER BY date DESC LIMIT 20`)
    .all(vendor.id) as Message[];

  let company: Company | undefined;
  if (vendor.company_slug) {
    const attached = d
      .prepare("SELECT name FROM pragma_database_list WHERE name = 'companies'")
      .get();
    if (attached) {
      const row = d
        .prepare(
          "SELECT slug, name, address, web, webform, email, phone, categories, runs, comments, suggested_transport_medium FROM companies.companies WHERE slug = ?"
        )
        .get(vendor.company_slug) as Record<string, string | undefined> | undefined;
      if (row) {
        const parseJsonArray = (val?: string): string[] | undefined => {
          if (!val) return undefined;
          try { return JSON.parse(val); } catch { return undefined; }
        };
        company = {
          slug: row.slug ?? "",
          name: row.name ?? "",
          address: row.address,
          web: row.web,
          webform: row.webform,
          email: row.email,
          phone: row.phone,
          categories: parseJsonArray(row.categories),
          runs: parseJsonArray(row.runs),
          comments: parseJsonArray(row.comments),
          suggested_transport_medium: row.suggested_transport_medium,
        };
      }
    }
  }

  // Enrich with breach data if breaches.db is attached.
  // Match exact domain OR subdomain of a breached root (e.g. kvibes.substack.com → substack.com).
  let enrichedVendor = vendor;
  if (vendor.root_domain && isBreachesAttached()) {
    const breachRows = d
      .prepare(
        `SELECT name, title, domain, breach_date, pwn_count, description, data_classes, is_verified, is_sensitive
         FROM breaches.breaches
         WHERE domain = ? OR ? LIKE '%.' || domain
         ORDER BY breach_date DESC`
      )
      .all(vendor.root_domain, vendor.root_domain) as BreachRow[];
    if (breachRows.length > 0) {
      enrichedVendor = { ...vendor, breachInfo: breachRows.map((row) => parseBreachInfo(vendor, row)) };
    }
  }

  const activityRows = d
    .prepare(
      `SELECT id, vendor_id, action_type, message_count, size_bytes, actioned_at
       FROM action_log WHERE vendor_id = ? ORDER BY actioned_at DESC`
    )
    .all(vendor.id) as Array<{
      id: number; vendor_id: number; action_type: string;
      message_count: number; size_bytes: number; actioned_at: number;
    }>;
  const activityLog: ActivityEntry[] = activityRows.map((r) => ({
    id: r.id,
    vendorId: r.vendor_id,
    vendorName: enrichedVendor.name || enrichedVendor.root_domain || "Unknown",
    vendorDomain: enrichedVendor.root_domain ?? undefined,
    vendorSlug: enrichedVendor.company_slug ?? undefined,
    actionType: r.action_type as ActivityEntry["actionType"],
    messageCount: r.message_count,
    sizeBytes: r.size_bytes,
    actionedAt: r.actioned_at,
  }));

  return { vendor: enrichedVendor, company, senders, bulkMessages, accountMessages, allMessages, activityLog };
}
