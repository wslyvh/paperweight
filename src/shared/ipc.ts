import type {
  AccountInfo,
  ActivityEntry,
  DashboardStats,
  ChartTrend,
  EmailConnection,
  ImapConfig,
  ImpactStats,
  LicenseStatus,
  Message,
  MessageType,
  RiskCounts,
  Settings,
  SupportInfo,
  SyncStatus,
  UnsubscribeEntry,
  Vendor,
  VendorDetail,
  VendorQuery,
  WhitelistEntry,
} from "./types";

export const IPC = {
  getConnectionStatus: "get-connection-status",
  startGmailAuth: "start-gmail-auth",
  startMicrosoftAuth: "start-microsoft-auth",
  saveImapConfig: "save-imap-config",
  testConnection: "test-connection",
  getAccountInfo: "get-account-info",
  startSync: "start-sync",
  getSyncStatus: "get-sync-status",
  getDashboardStats: "get-dashboard-stats",
  getDashboardTrend: "get-dashboard-trend",
  queryVendors: "query-vendors",
  getSettings: "get-settings",
  saveSettings: "save-settings",
  clearSyncData: "clear-sync-data",
  wipeData: "wipe-data",
  openExternal: "open-external",
  syncProgress: "sync-progress",
  markUnsubscribed: "mark-unsubscribed",
  markVendorUnsubscribed: "mark-vendor-unsubscribed",
  markVendorReviewed: "mark-vendor-reviewed",
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
} as const;

export interface ElectronAPI {
  getConnectionStatus: () => Promise<boolean>;
  startGmailAuth: () => Promise<{ success: boolean; error?: string }>;
  startMicrosoftAuth: () => Promise<{ success: boolean; error?: string }>;
  saveImapConfig: (
    config: ImapConfig
  ) => Promise<{ success: boolean; error?: string }>;
  testConnection: () => Promise<{ success: boolean; error?: string }>;
  getAccountInfo: () => Promise<AccountInfo>;
  startSync: () => Promise<void>;
  getSyncStatus: () => Promise<SyncStatus>;
  getDashboardStats: () => Promise<DashboardStats>;
  getDashboardTrend: () => Promise<ChartTrend>;
  queryVendors: (query: VendorQuery) => Promise<{ vendors: Vendor[]; total: number }>;
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Partial<Settings>) => Promise<void>;
  clearSyncData: () => Promise<void>;
  wipeData: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  onSyncProgress: (callback: (status: SyncStatus) => void) => () => void;
  markUnsubscribed: (email: string) => Promise<void>;
  markVendorUnsubscribed: (vendorId: number) => Promise<void>;
  markVendorReviewed: (vendorId: number, reviewed?: boolean) => Promise<void>;
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
}

export type { SyncStatus };
