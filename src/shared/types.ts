// --- Domain types ---

export type MessageType =
  | "bulk"           // Has List-Unsubscribe or bulk headers
  | "transactional"  // Account activity (password, security, verify, login)
  | "order"          // Purchase activity (orders, invoices, shipping, receipts)
  | "personal"       // 1:1 conversation
  | "unknown";       // Classification failed — needs improvement

export type UnsubscribeMethod =
  | "rfc8058"           // POST with List-Unsubscribe=One-Click
  | "list-unsubscribe"  // GET or mailto from header
  | "footer"            // Link found in body
  | "none";             // No unsubscribe method found

export type MessageStatus =
  | "unsubscribed"
  | "reported_spam"
  | "trashed";

export type VendorStatus =
  | "reviewed"
  | "gdpr_requested"
  | "gdpr_completed";

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
export const DEFAULT_MESSAGE_TYPE: MessageType = "unknown";

// Incremental sync windows
export const FREE_TIER_SYNC_DAYS = 30;    // Free tier: 30-day window
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
  has_orders?: boolean;
  status?: VendorStatus;
  breachInfo?: BreachInfo[];
}

export interface Message {
  id: string;
  vendor_id: number;
  sender_email: string;
  sender_name?: string;
  subject?: string;
  date: number;
  body_preview?: string;
  raw_headers?: string;
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

// Query / filter

export interface SearchFilterQuery {
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
  maxMessages?: number;   // message_count <= N
  breached?: boolean;     // only vendors likely affected by a known breach (first_seen < breach_date)
  onBreachList?: boolean; // any vendor whose domain appears in the breach database
}

export interface MessageQuery extends SearchFilterQuery {
  vendorId?: number;
  type?: MessageType;
  hasUnsubscribe?: boolean;
}

// Stats / UI

export interface DashboardStats {
  totalMessages: number;
  uniqueVendors: number;
  mailingListCount: number;
  breachedCount: number;
}

export interface AttentionStats {
  bulkEmailsToReview: number;
  vendorsToReview: number;
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

export type ActionType = "unsubscribed" | "trashed" | "spam_reported";

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
  accountMessages: Message[];
  allMessages: Message[];
  first_activity?: number;
  user_email?: string;
  activityLog: ActivityEntry[];
}

// Account / settings

export interface AccountInfo {
  email: string;
  providerType: string;
  registeredAt?: number;
  lastSyncAt?: number;
  totalMessages: number;
}

export interface Settings {
  providerType: string;
  autoLaunch?: boolean;
  launchMinimized?: boolean;
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
  dbSizeMb: number;
  logPath: string;
}

// Infrastructure

export interface EmailConnection {
  type: "gmail-oauth" | "imap" | "microsoft-oauth";
  email: string;
  canRead: boolean;
  canModify: boolean;
  canSend: boolean;
}

export interface ImapConfig {
  host: string;
  port: number;
  tls: boolean;
  username: string;
  password: string;
  allowSelfSigned?: boolean;
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
