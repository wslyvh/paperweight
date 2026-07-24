// --- Domain types ---

import {
  ACCOUNT_MESSAGE_TYPES,
  FINDING_SENSITIVITY_ORDER,
  FINDING_TYPES,
  LIST_MESSAGE_TYPES,
  MESSAGE_TYPES as ANALYSIS_MESSAGE_TYPES,
} from "@paperweight/analysis/contracts";
import type {
  FindingType,
  MessageType as AnalysisMessageType,
} from "@paperweight/analysis/contracts";

export type MessageType = AnalysisMessageType;
const MESSAGE_TYPES: readonly MessageType[] = ANALYSIS_MESSAGE_TYPES;
export function isMessageType(value: unknown): value is MessageType {
  return typeof value === "string" && (MESSAGE_TYPES as readonly string[]).includes(value);
}

// Product aliases kept for existing callers; the engine owns their membership.
export const LIST_MAIL_TYPES: readonly MessageType[] = LIST_MESSAGE_TYPES;

export const ACCOUNT_TYPES: readonly MessageType[] = ACCOUNT_MESSAGE_TYPES;

// Destructive mailbox actions are deliberately narrower than the Mailing Lists
// view. Social notifications can be unsubscribable, but must not be trained as
// spam or trashed alongside marketing mail.
export const MARKETING_ACTION_TYPES: readonly MessageType[] = ["promotion"];

export type UnsubscribeMethod =
  | "rfc8058"           // POST with List-Unsubscribe=One-Click
  | "list-unsubscribe"  // GET or mailto from header
  | "footer"            // Link found in body
  | "none";             // No unsubscribe method found

type MessageStatus =
  | "unsubscribed"
  | "reported_spam"
  | "trashed";

export type VendorStatus = "reviewed";

export type RiskLevel =
  | "high"     // Financial, healthcare, government
  | "medium"   // Social, shopping, marketing
  | "low"      // Entertainment
  | "unknown"; // Classification failed — needs improvement

export type CategoryId =
  | "financial"
  | "healthcare"
  | "government"
  | "marketing"
  | "social"
  | "communication"
  | "shopping"
  | "entertainment"
  | "services"
  | "unknown"; // Classification failed — needs improvement

// --- Constants ---

// Fallbacks — should be rare, indicate classification needs improvement
export const DEFAULT_CATEGORY: CategoryId = "unknown";
export const DEFAULT_RISK: RiskLevel = "unknown";

// Incremental sync windows
export const FREE_TIER_SYNC_DAYS = 90;    // Free tier: 90-day window
export const LICENSED_SYNC_DAYS = 365;    // Licensed: 1-year window on first run

// Message processing
export const BODY_PREVIEW_LENGTH = 150;

// --- Breach data ---

export interface Breach {
  name: string;
  title: string;
  domain: string;
  breachDate: string;      // ISO date "YYYY-MM-DD"
  pwnCount: number;
  description: string;
  dataClasses: string[];
  isVerified: boolean;
  isSensitive: boolean;
}

export interface BreachInfo {
  breach: Breach;
  likelyAffected: boolean;  // true if vendor.first_seen < breach_date
}

// --- Core entities ---

export interface Company {
  slug: string;
  name: string;
  address?: string;
  web?: string;
  webform?: string;
  email?: string;
  phone?: string;
  categories?: string[];
  runs?: string[];
  comments?: string[];
  suggested_transport_medium?: string;
}

export interface Vendor {
  id: number;
  root_domain?: string;
  company_slug?: string;
  name: string;
  category_id?: CategoryId;
  risk_level?: RiskLevel;
  first_seen?: number;
  last_seen?: number;
  message_count: number;
  sender_count: number;
  has_marketing: boolean;
  has_account: boolean;
  has_rfc8058?: boolean;
  has_mailto_unsub?: boolean;
  has_orders?: boolean;
  status?: VendorStatus;
  /** Email this company knows the user by (e.g. hide-my-email alias). */
  account_email?: string;
  breachInfo?: BreachInfo[];
  /** True when the company holds PII the detail panel classifies High or Possible. */
  hasNotablePii?: boolean;
}

export interface Message {
  id: string;
  vendor_id: number;
  sender_email: string;
  sender_name?: string;
  subject?: string;
  date: number;
  body_preview?: string;
  type?: MessageType;
  unsubscribe_url?: string;
  unsubscribe_method?: UnsubscribeMethod;
  status?: MessageStatus;
}

export interface WhitelistEntry {
  id: number;
  value: string;
  created_at: string;
}

// --- PII findings ---

export type PiiType = FindingType;
export { FINDING_SENSITIVITY_ORDER };
export function isPiiType(value: unknown): value is PiiType {
  return (
    typeof value === "string" &&
    (FINDING_TYPES as readonly string[]).includes(value)
  );
}

// One masked, de-duplicated value found for a vendor. Raw values never leave the
// main process — maskedValue is display-safe. lastSeen is used only as the
// stable tie-breaker after the UI's factual confidence ordering.
export interface VendorPiiValue {
  /** Opaque handle for `Not mine`: a representative pii_findings.id, resolved to
   *  (type, value) in the main process. Carries no meaning in the renderer. */
  ref: number;
  type: PiiType;
  maskedValue: string;
  lastSeen: number;
  /** The user's own address (a connected account, or the alias this company
   *  mails them at) — labelled, never hidden. */
  isOwnAddress?: boolean;
  /** Finding country differs from the locally inferred home country. Display
   *  ordering only: the finding remains visible and revealable. */
  isForeignFormat?: boolean;
  /** Distinct company identities where this exact normalized value occurs. */
  companyCount: number;
  /** Existing within-company spread rule matched. Identifiers remain visible;
   *  this only lowers their display order when confined to one company. */
  isFrequentAtCompany?: boolean;
}

// A full value, handed over only when the user reveals the list to review it.
// Keyed by the same opaque ref the masked row carries. Renderer-side this lives
// in component state for as long as the toggle is on — never stored, never logged.
export interface VendorPiiRevealedValue {
  ref: number;
  value: string;
}

// What the numbers below the findings are counted from: every message stored for
// this company, and how many of those have been through the analysis engine.
export interface VendorPiiCoverage {
  totalMessages: number;
  scannedMessages: number;
}

export interface VendorPiiSummary {
  values: VendorPiiValue[];
  coverage: VendorPiiCoverage;
}

// Query / filter

interface SearchFilterQuery {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir?: "ASC" | "DESC";
  search?: string;
}

export interface VendorQuery extends SearchFilterQuery {
  category?: string;
  risk?: string;
  showReviewed?: boolean;
  hasAccount?: boolean;
  filter?: "all" | "lists" | "accounts";
  activity?: string;      // 'recent' | 'active' | 'inactive' | 'stale' | 'dead'
  dataType?: string;      // 'has_orders' | 'has_account' | 'marketing_only'
  volume?: string;        // 'oneoff' | 'low' | 'medium' | 'high'
  maxMessages?: number;       // message_count <= N
  onBreachList?: boolean;     // vendor whose domain appears in the breach database
  activeSubscriptions?: boolean; // vendors with actionable recent bulk mail (< 2yr, has unsub method, not yet actioned)
  showWhitelisted?: boolean;     // invert whitelist exclusion — show vendors whose senders are all whitelisted
  piiType?: PiiType;             // vendors with at least one visible finding of this type
}

// Stats / UI

export interface DashboardStats {
  totalMessages: number;
  uniqueVendors: number;
  mailingListCount: number;
  breachedCount: number;
  mailingListsActioned: number;
  activeSubscriptions: number;
  reviewedVendors: number;
  highRiskUnreviewed: number;
}

export interface ImpactStats {
  listsUnsubscribed: number;
  emailsDeleted: number;
  dataReclaimedBytes: number;
}

export interface RiskCounts {
  high: number;
  medium: number;
  low: number;
}

export type ActionType =
  | "unsubscribed"
  | "trashed"
  | "spam_reported"
  | "gdpr_request_sent"
  | "reminder_sent"
  | "followup_sent"
  | "reply_received"
  | "case_message_linked"
  | "escalated"
  | "case_closed";

export interface ActivityEntry {
  id: number;
  vendorId: number;
  vendorName: string;
  vendorDomain?: string;
  vendorSlug?: string;
  actionType: ActionType;
  messageCount: number;
  sizeBytes: number;
  actionedAt: number;
  caseId?: number;
  caseRequestType?: GdprRequestType;
  caseOutcome?: GdprCaseOutcome;
  messageId?: string;
  subject?: string;
  body?: string;
}

// GDPR cases

export type GdprRequestType = "access" | "deletion";
// Derived from closed_at, not stored: a case is closed when closed_at is set.
export type GdprCaseStatus = "active" | "closed";
export type GdprCaseOutcome = "resolved" | "escalated";
export type GdprCaseAction = "reminder" | "followup" | "escalate";

export interface GdprCase {
  id: number;
  vendorId: number;
  requestType: GdprRequestType;
  status: GdprCaseStatus;
  outcome?: GdprCaseOutcome;
  recipientEmail?: string;
  sentMessageId?: string;
  openedAt: number;
  closedAt?: number;
}

export interface GdprCaseSummary extends GdprCase {
  vendorName: string;
  vendorDomain?: string;
  /** From vendors.account_email — identity for reminder/follow-up copy. */
  accountEmail?: string;
  nextAction?: GdprCaseAction;
  /** True when a reply/link event landed after the case was last opened. */
  hasUnseenReply: boolean;
}

export interface GdprCaseDetail extends GdprCaseSummary {
  events: ActivityEntry[];
  /** When this case was last opened, before this load (undefined = never viewed). */
  lastViewedAt?: number;
}

export interface CreateGdprCaseInput {
  vendorId: number;
  requestType: GdprRequestType;
  recipientEmail?: string;
  sentMessageId?: string;
  openedAt?: number;
  subject?: string;
  body?: string;
}

export interface GdprCaseEventInput {
  messageId?: string;
  subject?: string;
  body?: string;
}

export interface GdprCaseReplies {
  threadMatches: Message[];
  otherReplies: Message[];
  /** Message IDs the user manually linked to this case. */
  linkedMessageIds: string[];
}

export interface ChartTrend {
  labels: string[]; // YYYY-MM-DD (UTC)
  series: Array<{ key: string; values: number[] }>;
  markers: Array<{ key: string; point: number }>;
}

export interface UnsubscribeEntry {
  url: string;
  method: UnsubscribeMethod;
  senderEmail?: string;
}

export interface VendorDetail {
  vendor: Vendor;
  company?: Company;
  senders: Array<{ sender_email: string; sender_name?: string; message_count: number }>;
  bulkMessages: Message[];
  bulkMessageCount: number;
  accountMessages: Message[];
  allMessages: Message[];
  first_activity?: number;
  user_email?: string;
  activityLog: ActivityEntry[];
}

// Account / settings

export interface AccountSummary {
  email: string;
  providerType: string;
  registeredAt?: number;
  isActive: boolean;
  /** On-disk size of this account's SQLite db (incl. -wal/-shm sidecars). */
  sizeBytes: number;
}

export interface StorageAccount {
  email: string;
  sizeBytes: number;
}

export interface StorageBreakdown {
  /** Per-account SQLite db sizes, incl. -wal/-shm sidecars. */
  accounts: StorageAccount[];
  accountsTotalBytes: number;
  /** Reclaimable Chromium/Electron caches. */
  cacheBytes: number;
  logsBytes: number;
  /** Persistent userData remainder: settings, credentials, Local Storage, etc. */
  appDataBytes: number;
  /** Bundled asar + reference DBs + future embedded models — grows with our changes. */
  resourcesBytes: number;
  /** Private Electron/Chromium framework bundled with the app — fixed baseline. */
  runtimeBytes: number;
  totalBytes: number;
}

export interface ServerConfig {
  imap: {
    host: string;
    port: number;
    tls: boolean;
    allowSelfSigned: boolean;
  };
  smtp?: {
    host: string;
    port: number;
    tls: boolean;
  };
}

export interface AccountInfo {
  email: string;
  providerType: string;
  registeredAt?: number;
  lastSyncAt?: number;
  totalMessages: number;
  /** IMAP+SMTP server config, sans credentials. Present only for IMAP accounts. */
  server?: ServerConfig;
}

export interface Settings {
  providerType: string;
  autoLaunch?: boolean;
  launchMinimized?: boolean;
  userName?: string;
  colorTheme?: "dim" | "silk";
}

export interface LicenseStatus {
  active: boolean;
  tier?: "test" | "lifetime";
  expiresAt?: string;
  key?: string;
  portalUrl?: string;
}

export interface SupportInfo {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  os: string;
  arch: string;
  platform: string;
  providerType: string;
  licenseActive: boolean;
  totalMessages: number;
  lastSyncAt?: number;
  logPath: string;
}

// Infrastructure

export interface EmailConnection {
  type: "gmail-oauth" | "imap" | "microsoft-oauth";
  email: string;
}

export interface ImapConfig {
  host: string;
  port: number;
  tls: boolean;
  username: string;
  password: string;
  allowSelfSigned?: boolean;
  smtp?: {
    host: string;
    port: number;
    tls: boolean;
  };
}

export interface SyncStatus {
  running: boolean;
  progress: number;
  total: number;
  message: string;
  error?: string;
  lastSyncAt?: number;
  phase?: "incremental" | "historical";
  historicalCursor?: number;  // epoch ms of oldest date reached in historical sync
  historicalDone?: boolean;
}
