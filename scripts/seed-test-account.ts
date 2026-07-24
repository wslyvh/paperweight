/**
 * Populate a second, throwaway account in the real dev userData dir with a
 * realistic-looking inbox — dozens of vendors, a mix of promotion/social/
 * update/purchase/personal mail, some already unsubscribed/trashed/reported, and GDPR
 * cases on a minority of vendors covering every case-lifecycle stage. Lets
 * you walk through cases, unsubscribe, dashboard and activity flows in the
 * UI without emailing real companies or touching a real inbox.
 *
 * Fake, unreachable IMAP credentials are written (same idea as
 * scripts/generate-smoke-fixture.ts) so the app treats the account as
 * connected instead of redirecting to onboarding. Sync will try once, fail
 * to reach imap.seed.invalid, and show a harmless "sync failed" banner —
 * it fails at the connect step, before touching any seeded data.
 *
 * Data is generated from a fixed seed, so re-running resets the account back
 * to the same set of vendors/messages/cases every time.
 *
 * Run via: yarn seed:test-account
 * Then switch to "test-cases@paperweight.local" from the account switcher.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createAccountDb, initDb, getDb } from "../src/main/db";
import { emailToFileKey } from "../src/main/credentials";
import {
  closeGdprCase,
  createGdprCase,
  escalateGdprCase,
  insertGdprCaseEvent,
} from "../src/main/services/cases";
import type { CategoryId, RiskLevel, MessageType, UnsubscribeMethod } from "../src/shared/types";
import { LIST_MAIL_TYPES } from "../src/shared/types";
import { ENGINE_VERSION } from "@paperweight/analysis";
import type { FindingType } from "@paperweight/analysis/contracts";

const TEST_EMAIL = "test-cases@paperweight.local";
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => Date.now() - Math.round(days) * DAY_MS;

// ── deterministic PRNG so reseeding is reproducible ──
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260415);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const int = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
const weighted = <T extends string>(weights: Record<T, number>): T => {
  const entries = Object.entries(weights) as Array<[T, number]>;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [key, w] of entries) {
    if ((r -= w) <= 0) return key;
  }
  return entries[entries.length - 1][0];
};

function defaultUserDataDir(): string {
  const home = homedir();
  switch (process.platform) {
    case "darwin":
      return join(home, "Library", "Application Support", "paperweight");
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "paperweight");
    default:
      return join(home, ".config", "paperweight");
  }
}

const userDataDir = process.argv[2] ?? defaultUserDataDir();
if (!existsSync(userDataDir)) {
  console.error(`userData dir not found: ${userDataDir} — pass it explicitly as an argument`);
  process.exit(1);
}

// ── 1. Register the account (without touching the existing accounts or activeAccount) ──

const accountsPath = join(userDataDir, "accounts.json");
const registry = existsSync(accountsPath)
  ? (JSON.parse(readFileSync(accountsPath, "utf-8")) as {
      accounts: Array<{ email: string; providerType: string; registeredAt?: number }>;
    })
  : { accounts: [] };

const idx = registry.accounts.findIndex((a) => a.email === TEST_EMAIL);
const entry = { email: TEST_EMAIL, providerType: "imap", registeredAt: Date.now() };
if (idx >= 0) registry.accounts[idx] = entry;
else registry.accounts.push(entry);
writeFileSync(accountsPath, JSON.stringify(registry, null, 2), "utf-8");

// Fake credentials so getConnectionStatus()/hasCredentials() treat this account as
// connected (skips onboarding). Plain-text: dev machines fall back to this when
// safeStorage.decryptString() fails on non-encrypted data (see loadCredentials()).
writeFileSync(
  join(userDataDir, `${emailToFileKey(TEST_EMAIL)}.enc`),
  JSON.stringify({
    providerType: "imap",
    imap: {
      host: "imap.seed.invalid",
      port: 993,
      tls: true,
      username: TEST_EMAIL,
      password: "seed-fixture-not-real",
    },
  }),
  "utf-8",
);

// ── 2. Reset this account's db file ──

const fileKey = emailToFileKey(TEST_EMAIL);
const dbPath = join(userDataDir, `${fileKey}.db`);
for (const suffix of ["", "-wal", "-shm"]) {
  const p = dbPath + suffix;
  if (existsSync(p)) rmSync(p);
}

const resourcesDir = join(process.cwd(), "resources");
initDb(
  dbPath,
  join(resourcesDir, "companies.db"),
  join(resourcesDir, "breaches.db"),
  join(resourcesDir, "enforcement.db"),
);
createAccountDb(dbPath);

const d = getDb();

// Without this marker, migrateScanScopeAllMail() (src/main/migrations.ts) treats this
// as a pre-v0.4 IMAP account on next app start and wipes every seeded message.
d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration:all-mail-scope', '1')").run();

// This seed writes rows already in the engine's vocabulary (types, unsubscribe
// state and pii_findings). Mark the engine switch as done so applyEngineSwitch()
// (migrations.ts) never sets `migration:reclassify`, which would make the next
// sync's runReclassifyPass() re-derive every message from its (synthetic) body
// and flatten the seeded type/unsubscribe distribution the Mailing Lists and
// Accounts views depend on.
d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration:engine-switch', '1')").run();

// Pin the findings version to the current engine so runAnalysisPass() (analysis.ts)
// treats the mailbox as fully analyzed and no-ops — the seeded pii_findings and
// per-message analysis_version below stand in for a completed analysis pass.
d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('analysis:findings-version', ?)").run(ENGINE_VERSION);

const CATEGORY_RISK: Record<CategoryId, RiskLevel> = {
  financial: "high",
  healthcare: "high",
  government: "high",
  social: "medium",
  marketing: "medium",
  communication: "medium",
  shopping: "low",
  entertainment: "low",
  services: "medium",
  unknown: "unknown",
};

// status is left null (unreviewed) by default, same as a freshly synced vendor.
function insertVendor(domain: string, name: string, category: CategoryId): number {
  const result = d
    .prepare(
      `INSERT INTO vendors (root_domain, name, category_id, risk_level, status)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(domain, name, category, CATEGORY_RISK[category], null);
  return Number(result.lastInsertRowid);
}

let messageSeq = 0;
function insertMessage(input: {
  vendorId: number;
  domain: string;
  daysAgo: number;
  from: string;
  fromName: string;
  subject: string;
  preview: string;
  bodyText?: string;
  type: MessageType;
  unsubscribeUrl?: string;
  unsubscribeMethod?: UnsubscribeMethod;
  status?: "unsubscribed" | "reported_spam" | "trashed";
  references?: string;
  id?: string;
}): string {
  const id = input.id ?? `${input.domain}-msg-${++messageSeq}`;
  // body_state='available' + a stored body_text + analysis_version=ENGINE_VERSION
  // mirror a message the analysis pass has already processed: coverage
  // (getVendorPiiCoverage) counts scanned messages by analysis_version, and a
  // stored body means an engine-version bump can re-analyze locally like a real one.
  const bodyText = input.bodyText ?? `${input.subject}\n\n${input.preview}`;
  d.prepare(
    `INSERT INTO messages (id, vendor_id, sender_email, sender_name, subject, date, body_preview, body_text, body_state, analysis_version, raw_headers, type, unsubscribe_url, unsubscribe_method, status, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.vendorId,
    input.from,
    input.fromName,
    input.subject,
    daysAgo(input.daysAgo),
    input.preview,
    bodyText,
    ENGINE_VERSION,
    input.references ? JSON.stringify({ references: input.references }) : null,
    input.type,
    input.unsubscribeUrl ?? null,
    input.unsubscribeMethod ?? null,
    input.status ?? null,
    int(400, 45000),
  );
  return id;
}

// ── Subject/preview templates by message type ──

const BULK_SUBJECTS = [
  "Your weekly digest is here",
  "20% off everything this weekend only",
  "New arrivals just for you",
  "Don't miss our biggest sale of the year",
  "Your monthly newsletter",
  "Here's what you missed",
  "Last chance: offer ends tonight",
  "Introducing our new collection",
];
const TRANSACTIONAL_SUBJECTS = [
  "Your account statement is ready",
  "Security alert: new sign-in detected",
  "Please verify your email address",
  "Your password was changed",
  "Login from a new device",
  "Your subscription will renew soon",
  "Two-factor authentication enabled",
];
const ORDER_SUBJECTS = (n: number) => [
  "Your order has shipped",
  `Order confirmation #${n}`,
  "Your receipt",
  `Delivery update: order #${n}`,
  "Your order is out for delivery",
];
const PERSONAL_SUBJECTS = [
  "Following up on your question",
  "Re: your inquiry",
  "Quick question for you",
  "Thanks for reaching out",
];
const UNKNOWN_SUBJECTS = ["Update", "(no subject)", "Info", "Notice"];

const SENDER_LOCAL_PARTS: Record<MessageType, string[]> = {
  promotion: ["newsletter", "hello", "news"],
  social: ["notify", "updates", "no-reply"],
  update: ["noreply", "security", "account"],
  purchase: ["orders", "shipping", "receipts"],
  personal: ["support", "hello", "team"],
  unknown: ["info", "noreply"],
};

function subjectFor(type: MessageType): string {
  switch (type) {
    case "promotion":
    case "social":
      return pick(BULK_SUBJECTS);
    case "update":
      return pick(TRANSACTIONAL_SUBJECTS);
    case "purchase":
      return pick(ORDER_SUBJECTS(int(1000, 9999)));
    case "personal":
      return pick(PERSONAL_SUBJECTS);
    default:
      return pick(UNKNOWN_SUBJECTS);
  }
}

const PREVIEW_SNIPPETS: Record<MessageType, string[]> = {
  promotion: [
    "Hi there — here's what's new this week. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Tap below to shop the collection.",
    "Don't miss out: limited-time offers inside. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    "Your curated picks are ready. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
  ],
  update: [
    "We noticed a new sign-in to your account. If this was you, no action is needed. Otherwise reset your password immediately.",
    "Please verify your email address by clicking the link below. This link expires in 24 hours.",
    "Your security settings were updated. Review recent activity in your account dashboard.",
  ],
  purchase: [
    "Good news — your order is on its way. Track your package using the link below. Estimated delivery: 2–4 business days.",
    "Thanks for your purchase. Your receipt is attached. Items will ship within 1–2 business days.",
    "Your order has been confirmed. We'll email you again when it ships.",
  ],
  personal: [
    "Thanks for reaching out. We're looking into your question and will get back to you shortly.",
    "Following up on your message — could you share a few more details so we can help?",
    "Hi — just checking in regarding your recent inquiry.",
  ],
  social: [
    "You have 3 new notifications waiting. See what you missed while you were away.",
    "Someone you may know just joined. Say hello and grow your network.",
    "Your weekly activity digest is ready — highlights from people you follow.",
  ],
  unknown: [
    "Please see the information below. Contact support if you have questions.",
    "This is an automated notice regarding your account.",
  ],
};

function previewFor(type: MessageType): string {
  return pick(PREVIEW_SNIPPETS[type]);
}

type Profile = "newsletter" | "account" | "shop" | "mixed";

const PROFILE_WEIGHTS: Record<Profile, Record<MessageType, number>> = {
  newsletter: { promotion: 0.85, personal: 0.05, unknown: 0.1, update: 0, purchase: 0, social: 0 },
  account: { update: 0.6, purchase: 0.05, personal: 0.2, unknown: 0.15, promotion: 0, social: 0 },
  shop: { purchase: 0.45, promotion: 0.35, update: 0.1, personal: 0.1, unknown: 0, social: 0 },
  mixed: { personal: 0.4, update: 0.3, promotion: 0.15, social: 0.05, unknown: 0.1, purchase: 0 },
};

const PROFILE_COUNT_RANGE: Record<Profile, [number, number]> = {
  newsletter: [20, 120],
  account: [8, 40],
  shop: [15, 80],
  mixed: [5, 30],
};

const UNSUB_METHOD_WEIGHTS: Record<UnsubscribeMethod, number> = {
  rfc8058: 0.3,
  "list-unsubscribe": 0.4,
  footer: 0.2,
  none: 0.1,
};

// Populates a vendor's inbox and derives its stats/flags from the messages
// actually inserted, same as a real sync would.
function seedInbox(vendorId: number, domain: string, profile: Profile, alreadyActioned: boolean): void {
  const weights = PROFILE_WEIGHTS[profile];
  const [minCount, maxCount] = PROFILE_COUNT_RANGE[profile];
  const count = int(minCount, maxCount);
  const ageDays = int(60, 720);

  const bulkIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const type = weighted(weights);
    const daysBack = rng() * ageDays;
    const from = `${pick(SENDER_LOCAL_PARTS[type])}@${domain}`;
    const hasUnsub = LIST_MAIL_TYPES.includes(type) && rng() < 0.8;
    const method = hasUnsub ? weighted(UNSUB_METHOD_WEIGHTS) : undefined;
    const id = insertMessage({
      vendorId,
      domain,
      daysAgo: daysBack,
      from,
      fromName: pick([domain.split(".")[0], "Support Team", "No Reply"]),
      subject: subjectFor(type),
      preview: previewFor(type),
      type,
      unsubscribeUrl: hasUnsub ? `https://${domain}/unsubscribe?u=${int(1000, 99999)}` : undefined,
      unsubscribeMethod: method,
    });
    if (LIST_MAIL_TYPES.includes(type)) bulkIds.push(id);
  }

  if (alreadyActioned && bulkIds.length > 0) {
    const actionedCount = Math.max(1, Math.floor(bulkIds.length * 0.3));
    const actioned = bulkIds.slice(0, actionedCount);
    for (const id of actioned) {
      d.prepare("UPDATE messages SET status = 'unsubscribed' WHERE id = ?").run(id);
    }
    d.prepare(
      `INSERT INTO action_log (vendor_id, action_type, message_count, actioned_at)
       VALUES (?, 'unsubscribed', ?, ?)`,
    ).run(vendorId, actioned.length, daysAgo(int(1, 20)));
  }

  recomputeVendorStatsAndFlags(vendorId);
}

// Mirrors updateVendorStats/updateVendorFlags in src/main/services/vendors.ts —
// duplicated here to avoid pulling that module's heavier import chain into this script.
// has_marketing must match actionableListMailSql() (messageVocabulary.ts): a list-type
// message only counts when the engine also resolved a concrete unsubscribe action, so
// the Mailing Lists view (has_marketing=1 AND EXISTS actionable list mail) shows the vendor.
function recomputeVendorStatsAndFlags(vendorId: number): void {
  const stats = d
    .prepare(
      `SELECT COUNT(*) as message_count, COUNT(DISTINCT sender_email) as sender_count,
              MIN(date) as first_seen, MAX(date) as last_seen,
              MAX(CASE WHEN type IN ('promotion', 'social')
                        AND unsubscribe_url IS NOT NULL AND unsubscribe_url != ''
                        AND unsubscribe_method IS NOT NULL AND unsubscribe_method != 'none'
                       THEN 1 ELSE 0 END) as has_marketing,
              MAX(CASE WHEN type IN ('purchase', 'update', 'social') THEN 1 ELSE 0 END) as has_account
       FROM messages WHERE vendor_id = ?`,
    )
    .get(vendorId) as {
    message_count: number;
    sender_count: number;
    first_seen: number | null;
    last_seen: number | null;
    has_marketing: number;
    has_account: number;
  };
  d.prepare(
    `UPDATE vendors SET message_count = ?, sender_count = ?, first_seen = ?, last_seen = ?, has_marketing = ?, has_account = ?
     WHERE id = ?`,
  ).run(
    stats.message_count,
    stats.sender_count,
    stats.first_seen,
    stats.last_seen,
    stats.has_marketing ?? 0,
    stats.has_account ?? 0,
    vendorId,
  );
}

// ── Vendors with no GDPR case — just inbox variety ──

const NO_CASE_VENDORS: Array<{ name: string; domain: string; category: CategoryId; profile: Profile; actioned?: boolean }> = [
  { name: "Glowreel Studios", domain: "glowreel-studios.test", category: "entertainment", profile: "newsletter", actioned: true },
  { name: "Popstream Media", domain: "popstream-media.test", category: "entertainment", profile: "newsletter" },
  { name: "Chatterly Social", domain: "chatterly-social.test", category: "social", profile: "newsletter", actioned: true },
  { name: "Looply Network", domain: "looply-network.test", category: "social", profile: "newsletter" },
  { name: "Friendline Connect", domain: "friendline-connect.test", category: "social", profile: "mixed" },
  { name: "Pulse Marketing Co", domain: "pulse-marketing.test", category: "marketing", profile: "newsletter", actioned: true },
  { name: "Brightloop Insights", domain: "brightloop-insights.test", category: "marketing", profile: "newsletter" },
  { name: "Northgate Media Group", domain: "northgate-media.test", category: "marketing", profile: "newsletter" },
  { name: "Reachwell Digital", domain: "reachwell-digital.test", category: "marketing", profile: "newsletter", actioned: true },
  { name: "Ringway Telecom", domain: "ringway-telecom.test", category: "communication", profile: "account" },
  { name: "Signalhouse Mobile", domain: "signalhouse-mobile.test", category: "communication", profile: "account" },
  { name: "Telko Communications", domain: "telko-communications.test", category: "communication", profile: "account" },
  { name: "Meridian Bank", domain: "meridian-bank.test", category: "financial", profile: "account" },
  { name: "Sterling Capital", domain: "sterling-capital.test", category: "financial", profile: "account" },
  { name: "Vault Trust Financial", domain: "vault-trust.test", category: "financial", profile: "account" },
  { name: "Ledger Finance Group", domain: "ledger-finance.test", category: "financial", profile: "account" },
  { name: "Everwell Health", domain: "everwell-health.test", category: "healthcare", profile: "account" },
  { name: "Vitalis Medical", domain: "vitalis-medical.test", category: "healthcare", profile: "account" },
  { name: "Careline Clinic", domain: "careline-clinic.test", category: "healthcare", profile: "mixed" },
  { name: "Cityline Services", domain: "cityline-services.test", category: "government", profile: "account" },
  { name: "Countywide Registry", domain: "countywide-registry.test", category: "government", profile: "account" },
  { name: "Boltwood Market", domain: "boltwood-market.test", category: "shopping", profile: "shop" },
  { name: "Driftwood Goods", domain: "driftwood-goods.test", category: "shopping", profile: "shop", actioned: true },
  { name: "Amberfield Outfitters", domain: "amberfield-outfitters.test", category: "shopping", profile: "shop" },
  { name: "Palewick Store", domain: "palewick-store.test", category: "shopping", profile: "shop" },
  { name: "Thistledown Retail", domain: "thistledown-retail.test", category: "shopping", profile: "shop", actioned: true },
  { name: "Millbrook Goods", domain: "millbrook-goods.test", category: "shopping", profile: "shop" },
  { name: "Rosemont Market", domain: "rosemont-market.test", category: "shopping", profile: "shop" },
  { name: "Oakhollow General Store", domain: "oakhollow-general.test", category: "shopping", profile: "shop" },
  { name: "Wrenfield Supplies", domain: "wrenfield-supplies.test", category: "services", profile: "mixed" },
  { name: "Hollowmere Solutions", domain: "hollowmere-solutions.test", category: "services", profile: "mixed" },
  { name: "Aldergate Logistics", domain: "aldergate-logistics.test", category: "services", profile: "mixed" },
];

for (const v of NO_CASE_VENDORS) {
  const vendorId = insertVendor(v.domain, v.name, v.category);
  seedInbox(vendorId, v.domain, v.profile, v.actioned ?? false);
}

// ── Vendors with a GDPR case — one per lifecycle stage, plus a normal inbox ──

function vendorWithCase(
  name: string,
  domain: string,
  category: CategoryId,
  profile: Profile,
): number {
  const vendorId = insertVendor(domain, name, category);
  seedInbox(vendorId, domain, profile, false);
  return vendorId;
}

// 1. fresh case, too early for any nudge
{
  const vendorId = vendorWithCase("Northstar Cloud", "northstar-cloud.test", "services", "account");
  createGdprCase({
    vendorId,
    requestType: "access",
    recipientEmail: "privacy@northstar-cloud.test",
    subject: "Subject Access Request",
    body: "Please provide a copy of the personal data you hold on me.",
    sentMessageId: "<req-northstar@paperweight>",
    openedAt: daysAgo(5),
  });
}

// 2. reminder due (>=14 days, nothing sent yet)
{
  const vendorId = vendorWithCase("Bramblewood Retail", "bramblewood-retail.test", "shopping", "shop");
  createGdprCase({
    vendorId,
    requestType: "deletion",
    recipientEmail: "support@bramblewood-retail.test",
    subject: "Data Deletion Request",
    body: "Please delete all personal data you hold on me.",
    sentMessageId: "<req-bramblewood@paperweight>",
    openedAt: daysAgo(20),
  });
}

// 3. follow-up due (>=30 days, reminder already sent)
{
  const vendorId = vendorWithCase("Coldharbor Analytics", "coldharbor-analytics.test", "marketing", "newsletter");
  const kase = createGdprCase({
    vendorId,
    requestType: "access",
    recipientEmail: "privacy@coldharbor-analytics.test",
    subject: "Subject Access Request",
    body: "Please provide a copy of the personal data you hold on me.",
    sentMessageId: "<req-coldharbor@paperweight>",
    openedAt: daysAgo(35),
  });
  insertGdprCaseEvent(kase.id, "reminder_sent", { subject: "Reminder: Subject Access Request" });
}

// 4. overdue, escalate (>=60 days)
{
  const vendorId = vendorWithCase("Duskfall Logistics", "duskfall-logistics.test", "services", "mixed");
  createGdprCase({
    vendorId,
    requestType: "deletion",
    recipientEmail: "dpo@duskfall-logistics.test",
    subject: "Data Deletion Request",
    body: "Please delete all personal data you hold on me.",
    sentMessageId: "<req-duskfall@paperweight>",
    openedAt: daysAgo(65),
  });
}

// 5. auto-responder received — informational only (no thread match)
{
  const vendorId = vendorWithCase("Emberlin Health", "emberlin-health.test", "healthcare", "account");
  createGdprCase({
    vendorId,
    requestType: "access",
    recipientEmail: "privacy@emberlin-health.test",
    subject: "Subject Access Request",
    body: "Please provide a copy of the personal data you hold on me.",
    sentMessageId: "<req-emberlin@paperweight>",
    openedAt: daysAgo(10),
  });
  insertMessage({
    vendorId,
    domain: "emberlin-health.test",
    daysAgo: 9,
    from: "privacy@emberlin-health.test",
    fromName: "Emberlin Health Privacy Team",
    subject: "We've received your request",
    preview: "Thank you for contacting us. We've received your request and will respond within 30 days.",
    type: "personal",
    id: "msg-emberlin-ack",
  });
}

// 6. thread-matched reply — auto-added to case file on open
{
  const vendorId = vendorWithCase("Fennimore Media", "fennimore-media.test", "entertainment", "newsletter");
  createGdprCase({
    vendorId,
    requestType: "deletion",
    recipientEmail: "support@fennimore-media.test",
    subject: "Data Deletion Request",
    body: "Please delete all personal data you hold on me.",
    sentMessageId: "<req-fennimore@paperweight>",
    openedAt: daysAgo(12),
  });
  insertMessage({
    vendorId,
    domain: "fennimore-media.test",
    daysAgo: 3,
    from: "support@fennimore-media.test",
    fromName: "Fennimore Media Support",
    subject: "Re: Data Deletion Request",
    preview: "We've located your account and completed the deletion. Let us know if you have questions.",
    type: "personal",
    references: "<req-fennimore@paperweight>",
    id: "msg-fennimore-reply",
  });
}

// 7. closed — resolved
{
  const vendorId = vendorWithCase("Glasswick Insurance", "glasswick-insurance.test", "financial", "account");
  const kase = createGdprCase({
    vendorId,
    requestType: "access",
    recipientEmail: "privacy@glasswick-insurance.test",
    subject: "Subject Access Request",
    body: "Please provide a copy of the personal data you hold on me.",
    sentMessageId: "<req-glasswick@paperweight>",
    openedAt: daysAgo(45),
  });
  closeGdprCase(kase.id, "resolved");
}

// 8. closed — resolved (user gave up waiting)
{
  const vendorId = vendorWithCase("Harrowgate Foods", "harrowgate-foods.test", "shopping", "shop");
  const kase = createGdprCase({
    vendorId,
    requestType: "deletion",
    recipientEmail: "hello@harrowgate-foods.test",
    subject: "Data Deletion Request",
    body: "Please delete all personal data you hold on me.",
    sentMessageId: "<req-harrowgate@paperweight>",
    openedAt: daysAgo(70),
  });
  closeGdprCase(kase.id);
}

// 9. closed — escalated
{
  const vendorId = vendorWithCase("Marrowgate Utilities", "marrowgate-utilities.test", "services", "account");
  const kase = createGdprCase({
    vendorId,
    requestType: "access",
    recipientEmail: "privacy@marrowgate-utilities.test",
    subject: "Subject Access Request",
    body: "Please provide a copy of the personal data you hold on me.",
    sentMessageId: "<req-marrowgate@paperweight>",
    openedAt: daysAgo(90),
  });
  escalateGdprCase(kase.id);
}

// 10. no case yet — starting point for "start a new case"
{
  const vendorId = insertVendor("juniper-outfitters.test", "Juniper Outfitters", "shopping");
  seedInbox(vendorId, "juniper-outfitters.test", "shop", false);
}

// 11. thread-matched reply pending auto-sync on case open
{
  const vendorId = vendorWithCase("Kestrel Finance", "kestrel-finance.test", "financial", "account");
  createGdprCase({
    vendorId,
    requestType: "access",
    recipientEmail: "privacy@kestrel-finance.test",
    subject: "Subject Access Request",
    body: "Please provide a copy of the personal data you hold on me.",
    sentMessageId: "<req-kestrel@paperweight>",
    openedAt: daysAgo(6),
  });
  insertMessage({
    vendorId,
    domain: "kestrel-finance.test",
    daysAgo: 2,
    from: "privacy@kestrel-finance.test",
    fromName: "Kestrel Finance Privacy",
    subject: "Re: Subject Access Request",
    preview: "Attached is the data export you requested.",
    type: "personal",
    references: "<req-kestrel@paperweight>",
    id: "msg-kestrel-candidate",
  });
}

// 12. other vendor email since request — shown in overview only
{
  const vendorId = vendorWithCase("Larkspur Wellness", "larkspur-wellness.test", "healthcare", "mixed");
  createGdprCase({
    vendorId,
    requestType: "deletion",
    recipientEmail: "care@larkspur-wellness.test",
    subject: "Data Deletion Request",
    body: "Please delete all personal data you hold on me.",
    sentMessageId: "<req-larkspur@paperweight>",
    openedAt: daysAgo(9),
  });
  insertMessage({
    vendorId,
    domain: "larkspur-wellness.test",
    daysAgo: 1,
    from: "care@larkspur-wellness.test",
    fromName: "Larkspur Wellness Care Team",
    subject: "Your appointment reminder",
    preview: "This is a reminder about your upcoming appointment.",
    type: "personal",
    id: "msg-larkspur-candidate",
  });
}

// ── Mailing-list showcase: one vendor per unsubscribe configuration ──
//
// The Mailing Lists view keys off actionableListMailSql() (a list-type message
// with a resolved unsubscribe_url and a method other than 'none'). These vendors
// pin down each branch explicitly instead of leaving it to the RNG.

function unsubUrlFor(method: UnsubscribeMethod, domain: string): string {
  switch (method) {
    case "rfc8058":
      return `https://${domain}/one-click?u=${int(10000, 99999)}`;
    case "list-unsubscribe":
      return `mailto:unsubscribe@${domain}?subject=unsubscribe`;
    case "footer":
      return `https://${domain}/preferences?u=${int(10000, 99999)}`;
    case "none":
      return "";
  }
}

function seedListShowcase(opts: {
  name: string;
  domain: string;
  category: CategoryId;
  type: "promotion" | "social";
  method?: UnsubscribeMethod; // omit for mail with no unsubscribe at all
  count?: number;
  actioned?: "unsubscribed" | "spam_reported" | "trashed";
}): number {
  const vendorId = insertVendor(opts.domain, opts.name, opts.category);
  const count = opts.count ?? int(6, 14);
  const hasUnsub = !!opts.method && opts.method !== "none";
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(
      insertMessage({
        vendorId,
        domain: opts.domain,
        daysAgo: rng() * 120,
        from: `${pick(SENDER_LOCAL_PARTS[opts.type])}@${opts.domain}`,
        fromName: opts.name,
        subject: subjectFor(opts.type),
        preview: previewFor(opts.type),
        type: opts.type,
        unsubscribeUrl: hasUnsub ? unsubUrlFor(opts.method!, opts.domain) : undefined,
        unsubscribeMethod: opts.method,
      }),
    );
  }
  if (opts.actioned === "unsubscribed") {
    for (const id of ids) {
      d.prepare("UPDATE messages SET status = 'unsubscribed' WHERE id = ?").run(id);
    }
  }
  if (opts.actioned) {
    d.prepare(
      `INSERT INTO action_log (vendor_id, action_type, message_count, actioned_at)
       VALUES (?, ?, ?, ?)`,
    ).run(vendorId, opts.actioned, ids.length, daysAgo(int(1, 20)));
  }
  recomputeVendorStatsAndFlags(vendorId);
  return vendorId;
}

// Actionable — each resolved unsubscribe method the engine can hand back.
seedListShowcase({ name: "Loopmail Newsletter", domain: "loopmail-news.test", category: "marketing", type: "promotion", method: "rfc8058" });
seedListShowcase({ name: "Brightbox Deals", domain: "brightbox-deals.test", category: "marketing", type: "promotion", method: "list-unsubscribe" });
seedListShowcase({ name: "Trailhead Weekly", domain: "trailhead-weekly.test", category: "entertainment", type: "promotion", method: "footer" });
// Social with a resolved unsubscribe is actionable; social without one is not.
seedListShowcase({ name: "Pingboard Social", domain: "pingboard-social.test", category: "social", type: "social", method: "list-unsubscribe" });
seedListShowcase({ name: "Chirpwire Alerts", domain: "chirpwire-alerts.test", category: "social", type: "social" });
// Promotion with no resolvable unsubscribe — kept out of Mailing Lists.
seedListShowcase({ name: "Deadend Promos", domain: "deadend-promos.test", category: "marketing", type: "promotion", method: "none" });
// Already-actioned states, one per action_type the Activity view renders.
seedListShowcase({ name: "Quietuben Mail", domain: "quietuben-mail.test", category: "marketing", type: "promotion", method: "rfc8058", actioned: "unsubscribed" });
seedListShowcase({ name: "Spamworks Blasts", domain: "spamworks-blasts.test", category: "marketing", type: "promotion", method: "list-unsubscribe", actioned: "spam_reported" });
seedListShowcase({ name: "Junkpile Offers", domain: "junkpile-offers.test", category: "marketing", type: "promotion", method: "footer", actioned: "trashed" });

// ── Breached vendors: real domains present in resources/breaches.db ──
// ON_BREACH_LIST_SQL matches vendors.root_domain against breaches.domain, so
// these exercise the breach badge, the on-breach-list filter and (via Accounts'
// admission rule) breach-only promotion into the Accounts view.
const BREACH_VENDORS: Array<{ name: string; domain: string; category: CategoryId; profile: Profile }> = [
  { name: "LinkedIn", domain: "linkedin.com", category: "social", profile: "mixed" },
  { name: "Adobe", domain: "adobe.com", category: "services", profile: "account" },
  { name: "MyFitnessPal", domain: "myfitnesspal.com", category: "services", profile: "account" },
  { name: "Deezer", domain: "deezer.com", category: "entertainment", profile: "newsletter" },
];
const breachVendorIds: Record<string, number> = {};
for (const v of BREACH_VENDORS) {
  const vendorId = insertVendor(v.domain, v.name, v.category);
  seedInbox(vendorId, v.domain, v.profile, false);
  breachVendorIds[v.domain] = vendorId;
}

// ── Whitelist ──
// The account's own address (the app whitelists it on first run) plus one vendor
// domain, so the activeSubscriptions exclusion has something to skip.
for (const value of [TEST_EMAIL, "glowreel-studios.test"]) {
  d.prepare("INSERT OR IGNORE INTO whitelist (value) VALUES (?)").run(value);
}

// ── PII findings: every finding type across every confidence tier ──
//
// Rows written the way persistFindings() does (masking happens in the main
// process at read time). Confidence in FoundInEmails is derived, not stored:
//   High     — own address (email == vendor.account_email) OR value seen at >1 company
//   Low      — single company AND (foreign-format locale value OR frequent identifier)
//   Possible — single company, home-locale, not frequent
// A home country (NL) is inferred from values that recur across companies, which
// is what turns a DE-format value at one company into a Low "foreign format" row.

const insertFinding = d.prepare(
  `INSERT INTO pii_findings (message_id, type, value_normalized, country, in_quoted_text, in_footer, self_reference)
   VALUES (?, ?, ?, ?, 0, 0, 0)`,
);
const piiCursor = new Map<number, number>();
function pidFor(domain: string): number {
  const row = d.prepare("SELECT id FROM vendors WHERE root_domain = ?").get(domain) as { id: number } | undefined;
  if (!row) throw new Error(`seed: no vendor for PII domain ${domain}`);
  return row.id;
}
function vendorMessageIds(vendorId: number): string[] {
  return (
    d.prepare("SELECT id FROM messages WHERE vendor_id = ? ORDER BY date DESC").all(vendorId) as Array<{ id: string }>
  ).map((r) => r.id);
}
// Attach one finding to the vendor's next message (cursor cycles through its mail).
function addFinding(domain: string, type: FindingType, value: string, country: string | null = null): void {
  const vendorId = pidFor(domain);
  const ids = vendorMessageIds(vendorId);
  if (ids.length === 0) return;
  const i = (piiCursor.get(vendorId) ?? 0) % ids.length;
  piiCursor.set(vendorId, i + 1);
  insertFinding.run(ids[i], type, value, country);
}
// Repeat a value across enough of the vendor's mail to trip the spread rule
// (>=20 messages, or >=5 and >=40% share) → an identifier flagged frequent-at-company.
function addFrequentFinding(domain: string, type: FindingType, value: string, country: string | null = null): void {
  const vendorId = pidFor(domain);
  const ids = vendorMessageIds(vendorId);
  const n = Math.min(ids.length, Math.max(5, Math.ceil(ids.length * 0.5)));
  for (let i = 0; i < n; i++) insertFinding.run(ids[i], type, value, country);
}
function setAccountEmail(domain: string): void {
  d.prepare("UPDATE vendors SET account_email = ? WHERE id = ?").run(TEST_EMAIL, pidFor(domain));
}

// Own address (High, "Exact match") — vendors the user has an account with.
for (const domain of ["meridian-bank.test", "everwell-health.test", "boltwood-market.test", "linkedin.com"]) {
  setAccountEmail(domain);
  addFinding(domain, "email", TEST_EMAIL);
}

// Cross-company values (High, "Found elsewhere") — same value at two companies.
addFinding("meridian-bank.test", "email", "wesley.tenholt@gmail.com");
addFinding("vault-trust.test", "email", "wesley.tenholt@gmail.com");
addFinding("meridian-bank.test", "iban", "NL13INGB0001234567", "NL");
addFinding("ledger-finance.test", "iban", "NL13INGB0001234567", "NL");
addFinding("meridian-bank.test", "phone", "+31612345678", "NL");
addFinding("everwell-health.test", "phone", "+31612345678", "NL");
addFinding("boltwood-market.test", "postal_code", "1054ED", "NL");
addFinding("palewick-store.test", "postal_code", "1054ED", "NL");

// Possible (single company, home locale, not frequent).
addFinding("meridian-bank.test", "credit_card", "4111111111111111");
addFinding("meridian-bank.test", "address", "herengracht 482", "NL");
addFinding("everwell-health.test", "national_id", "891234567", "NL");
addFinding("vitalis-medical.test", "iban", "NL91ABNA0417164300", "NL");
addFinding("vitalis-medical.test", "phone", "+31205551234", "NL");
addFinding("boltwood-market.test", "credit_card", "5555555555554444");

// Low (single company, weaker ownership signal).
addFinding("meridian-bank.test", "phone", "+493055551234", "DE"); // foreign format (home is NL)
addFinding("everwell-health.test", "postal_code", "10115", "DE"); // foreign format
addFrequentFinding("meridian-bank.test", "iban", "NL02RABO0123456789", "NL"); // frequent-at-company

// Accounts admission on observed findings alone — a marketing vendor with no
// account mail, promoted by a single home-locale non-identifier value.
addFinding("pulse-marketing.test", "phone", "+31207001122", "NL");

// A breached vendor also carrying data, so its Accounts row shows both signals.
addFinding("linkedin.com", "phone", "+31612345678", "NL"); // also cross-company (High)
addFinding("adobe.com", "email", "wesley.tenholt@gmail.com"); // cross-company (High)

const totalVendors = (d.prepare("SELECT COUNT(*) c FROM vendors").get() as { c: number }).c;
const totalCases = (d.prepare("SELECT COUNT(*) c FROM gdpr_cases").get() as { c: number }).c;
const totalMessages = (d.prepare("SELECT COUNT(*) c FROM messages").get() as { c: number }).c;
const totalFindings = (d.prepare("SELECT COUNT(*) c FROM pii_findings").get() as { c: number }).c;

console.info(`Seeded ${TEST_EMAIL} [${fileKey}] in ${userDataDir}`);
console.info(`${totalVendors} vendors, ${totalMessages} messages, ${totalCases} GDPR cases, ${totalFindings} PII findings.`);
console.info(`Switch to it from the account switcher — the one sync attempt will fail harmlessly (fake host).`);
console.info(`Re-run this script any time to reset it back to this same data.`);
