import type {
  AccountInfo,
  AccountSummary,
  ActionType,
  ActivityEntry,
  CreateGdprCaseInput,
  GdprCase,
  GdprCaseDetail,
  GdprCaseEventInput,
  GdprCaseStatus,
  GdprCaseSummary,
  GdprCaseReplies,
  DashboardStats,
  ChartTrend,
  EmailConnection,
  ImapConfig,
  ImpactStats,
  LicenseStatus,
  Message,
  MessageType,
  RiskCounts,
  ServerConfig,
  Settings,
  StorageBreakdown,
  SupportInfo,
  SyncStatus,
  UnsubscribeEntry,
  Vendor,
  VendorDetail,
  VendorQuery,
  WhitelistEntry,
} from "./types";

export const IPC = {
  getLastUpdateInfo: "get-last-update-info",
  getConnectionStatus: "get-connection-status",
  startGmailAuth: "start-gmail-auth",
  startMicrosoftAuth: "start-microsoft-auth",
  saveImapConfig: "save-imap-config",
  updateServerConfig: "update-server-config",
  testConnection: "test-connection",
  getAccountInfo: "get-account-info",
  startSync: "start-sync",
  getSyncStatus: "get-sync-status",
  getDashboardStats: "get-dashboard-stats",
  getDashboardTrend: "get-dashboard-trend",
  queryVendors: "query-vendors",
  getSettings: "get-settings",
  saveSettings: "save-settings",
  resyncData: "resync-data",
  wipeData: "wipe-data",
  noAccountsRemaining: "no-accounts-remaining",
  openExternal: "open-external",
  authUrl: "auth-url",
  syncProgress: "sync-progress",
  markUnsubscribed: "mark-unsubscribed",
  markVendorUnsubscribed: "mark-vendor-unsubscribed",
  markVendorReviewed: "mark-vendor-reviewed",
  setVendorAccountEmail: "set-vendor-account-email",
  addWhitelistEntry: "add-whitelist-entry",
  removeWhitelistEntry: "remove-whitelist-entry",
  getWhitelistEntries: "get-whitelist-entries",
  getMessagesByEmail: "get-messages-by-email",
  getVendorMessages: "get-vendor-messages",
  trashMessage: "trash-message",
  markMessageAsSpam: "mark-message-as-spam",
  markMessageAsRead: "mark-message-as-read",
  getEmailConnection: "get-email-connection",
  activateLicense: "activate-license",
  getLicenseStatus: "get-license-status",
  deactivateLicense: "deactivate-license",
  getSupportInfo: "get-support-info",
  getStorageBreakdown: "get-storage-breakdown",
  readLogFile: "read-log-file",
  getVendorDetail: "get-vendor-detail",
  deleteVendor: "delete-vendor",
  getAllUnsubscribeMethods: "get-all-unsubscribe-methods",
  executeRfc8058: "execute-rfc8058",
  trashVendorMessages: "trash-vendor-messages",
  reportSpamVendor: "report-spam-vendor",
  getImpactStats: "get-impact-stats",
  getRiskCounts: "get-risk-counts",
  getActivityLog: "get-activity-log",
  listAccounts: "list-accounts",
  addAccount: "add-account",
  switchAccount: "switch-account",
  removeAccount: "remove-account",
  accountSwitched: "account-switched",
  updateDownloaded: "update-downloaded",
  installUpdate: "install-update",
  sendEmail: "send-email",
  createGdprCase: "create-gdpr-case",
  getGdprCase: "get-gdpr-case",
  queryGdprCases: "query-gdpr-cases",
  closeGdprCase: "close-gdpr-case",
  reopenGdprCase: "reopen-gdpr-case",
  escalateGdprCase: "escalate-gdpr-case",
  addGdprCaseEvent: "add-gdpr-case-event",
  getGdprCaseReplies: "get-gdpr-case-replies",
  linkGdprCaseMessage: "link-gdpr-case-message",
  unlinkGdprCaseMessage: "unlink-gdpr-case-message",
  markGdprCaseViewed: "mark-gdpr-case-viewed",
  getUnseenCaseReplyCount: "get-unseen-case-reply-count",
} as const;

export interface UpdateInfo {
  latest: string;
  current: string;
  isMajor: boolean;
}

export interface ElectronAPI {
  getLastUpdateInfo: () => Promise<UpdateInfo | null>;
  getConnectionStatus: () => Promise<boolean>;
  startGmailAuth: (openInBrowser?: boolean) => Promise<{ success: boolean; error?: string }>;
  startMicrosoftAuth: (openInBrowser?: boolean) => Promise<{ success: boolean; error?: string }>;
  saveImapConfig: (
    config: ImapConfig
  ) => Promise<{ success: boolean; error?: string }>;
  updateServerConfig: (
    server: ServerConfig & { smtp: NonNullable<ServerConfig["smtp"]> },
  ) => Promise<{ success: boolean; error?: string }>;
  testConnection: () => Promise<{ success: boolean; error?: string }>;
  getAccountInfo: () => Promise<AccountInfo>;
  startSync: () => Promise<void>;
  getSyncStatus: () => Promise<SyncStatus>;
  getDashboardStats: () => Promise<DashboardStats>;
  getDashboardTrend: () => Promise<ChartTrend>;
  queryVendors: (query: VendorQuery) => Promise<{ vendors: Vendor[]; total: number }>;
  getSettings: () => Settings;
  saveSettings: (settings: Partial<Settings>) => Promise<void>;
  resyncData: () => Promise<void>;
  wipeData: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  onAuthUrl: (callback: (url: string) => void) => () => void;
  onSyncProgress: (callback: (status: SyncStatus) => void) => () => void;
  markUnsubscribed: (email: string) => Promise<void>;
  markVendorUnsubscribed: (vendorId: number) => Promise<void>;
  markVendorReviewed: (vendorId: number, reviewed?: boolean) => Promise<void>;
  setVendorAccountEmail: (vendorId: number, email: string) => Promise<void>;
  addWhitelistEntry: (value: string) => Promise<void>;
  removeWhitelistEntry: (value: string) => Promise<void>;
  getWhitelistEntries: () => Promise<WhitelistEntry[]>;
  getMessagesByEmail: (email: string, limit: number) => Promise<Message[]>;
  getVendorMessages: (vendorId: number, limit: number) => Promise<Message[]>;
  trashMessage: (messageId: string) => Promise<void>;
  markMessageAsSpam: (messageId: string) => Promise<void>;
  markMessageAsRead: (messageId: string, isRead: boolean) => Promise<void>;
  getEmailConnection: () => Promise<EmailConnection | null>;
  activateLicense: (key: string) => Promise<LicenseStatus>;
  getLicenseStatus: () => Promise<LicenseStatus>;
  deactivateLicense: () => Promise<void>;
  getSupportInfo: () => Promise<SupportInfo>;
  getStorageBreakdown: () => Promise<StorageBreakdown>;
  readLogFile: () => Promise<string>;
  getVendorDetail: (groupKey: string) => Promise<VendorDetail>;
  deleteVendor: (vendorId: number) => Promise<void>;
  getAllUnsubscribeMethods: (vendorId: number) => Promise<UnsubscribeEntry[]>;
  executeRfc8058: (url: string) => Promise<{ success: boolean; error?: string }>;
  trashVendorMessages: (vendorId: number, types?: MessageType[]) => Promise<{ success: boolean; error?: string }>;
  reportSpamVendor: (vendorId: number) => Promise<{ success: boolean; error?: string }>;
  getImpactStats: () => Promise<ImpactStats>;
  getRiskCounts: () => Promise<RiskCounts>;
  getActivityLog: (limit: number, offset: number) => Promise<{ entries: ActivityEntry[]; total: number }>;
  listAccounts: () => AccountSummary[];
  addAccount: () => Promise<{ blocked: true; reason: "license_required" } | null>;
  switchAccount: (email: string) => Promise<void>;
  removeAccount: (email: string) => Promise<void>;
  onAccountSwitched: (callback: (email: string) => void) => () => void;
  onNoAccountsRemaining: (callback: () => void) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  installUpdate: () => Promise<void>;
  sendEmail: (
    to: string,
    subject: string,
    body: string,
    inReplyTo?: string,
  ) => Promise<{ success: boolean; error?: string; messageId?: string }>;
  createGdprCase: (input: CreateGdprCaseInput) => Promise<GdprCase>;
  getGdprCase: (id: number) => Promise<GdprCaseDetail | undefined>;
  queryGdprCases: (filter?: { status?: GdprCaseStatus; vendorId?: number }) => Promise<GdprCaseSummary[]>;
  closeGdprCase: (id: number) => Promise<void>;
  reopenGdprCase: (id: number) => Promise<void>;
  escalateGdprCase: (id: number) => Promise<void>;
  addGdprCaseEvent: (caseId: number, actionType: ActionType, details?: GdprCaseEventInput) => Promise<void>;
  getGdprCaseReplies: (caseId: number) => Promise<GdprCaseReplies>;
  linkGdprCaseMessage: (caseId: number, messageId: string) => Promise<void>;
  unlinkGdprCaseMessage: (caseId: number, messageId: string) => Promise<void>;
  markGdprCaseViewed: (caseId: number) => Promise<void>;
  getUnseenCaseReplyCount: () => Promise<number>;
}

export type { SyncStatus };
