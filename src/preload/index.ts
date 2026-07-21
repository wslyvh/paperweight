import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "@shared/ipc";
import type { ElectronAPI, SyncStatus, UpdateInfo } from "@shared/ipc";

export type { ElectronAPI } from "@shared/ipc";

const api: ElectronAPI = {
  getLastUpdateInfo: () => ipcRenderer.invoke(IPC.getLastUpdateInfo),

  getConnectionStatus: () => ipcRenderer.invoke(IPC.getConnectionStatus),

  startGmailAuth: (openInBrowser) =>
    ipcRenderer.invoke(IPC.startGmailAuth, openInBrowser),

  startMicrosoftAuth: (openInBrowser) =>
    ipcRenderer.invoke(IPC.startMicrosoftAuth, openInBrowser),

  saveImapConfig: (config) => ipcRenderer.invoke(IPC.saveImapConfig, config),

  updateServerConfig: (server) =>
    ipcRenderer.invoke(IPC.updateServerConfig, server),

  testConnection: () => ipcRenderer.invoke(IPC.testConnection),

  getAccountInfo: () => ipcRenderer.invoke(IPC.getAccountInfo),

  startSync: () => ipcRenderer.invoke(IPC.startSync),

  getSyncStatus: () => ipcRenderer.invoke(IPC.getSyncStatus),

  getDashboardStats: () => ipcRenderer.invoke(IPC.getDashboardStats),

  getDashboardTrend: () => ipcRenderer.invoke(IPC.getDashboardTrend),

  queryVendors: (query) => ipcRenderer.invoke(IPC.queryVendors, query),

  getSettings: () => ipcRenderer.sendSync(IPC.getSettings),

  saveSettings: (settings) => ipcRenderer.invoke(IPC.saveSettings, settings),

  resyncData: () => ipcRenderer.invoke(IPC.resyncData),

  wipeData: () => ipcRenderer.invoke(IPC.wipeData),

  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),

  onAuthUrl: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string): void => {
      callback(url);
    };
    ipcRenderer.on(IPC.authUrl, handler);
    return () => ipcRenderer.removeListener(IPC.authUrl, handler);
  },

  onSyncProgress: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: SyncStatus
    ): void => {
      callback(status);
    };
    ipcRenderer.on(IPC.syncProgress, handler);
    return () => ipcRenderer.removeListener(IPC.syncProgress, handler);
  },

  markUnsubscribed: (email) => ipcRenderer.invoke(IPC.markUnsubscribed, email),

  markVendorUnsubscribed: (vendorId) =>
    ipcRenderer.invoke(IPC.markVendorUnsubscribed, vendorId),

  markVendorReviewed: (vendorId, reviewed) =>
    ipcRenderer.invoke(IPC.markVendorReviewed, vendorId, reviewed),

  setVendorAccountEmail: (vendorId, email) =>
    ipcRenderer.invoke(IPC.setVendorAccountEmail, vendorId, email),

  addWhitelistEntry: (value) =>
    ipcRenderer.invoke(IPC.addWhitelistEntry, value),

  removeWhitelistEntry: (value) =>
    ipcRenderer.invoke(IPC.removeWhitelistEntry, value),

  getWhitelistEntries: () => ipcRenderer.invoke(IPC.getWhitelistEntries),

  getMessagesByEmail: (email, limit) =>
    ipcRenderer.invoke(IPC.getMessagesByEmail, email, limit),

  getVendorMessages: (vendorId, limit) =>
    ipcRenderer.invoke(IPC.getVendorMessages, vendorId, limit),

  trashMessage: (messageId) =>
    ipcRenderer.invoke(IPC.trashMessage, messageId),

  markMessageAsSpam: (messageId) =>
    ipcRenderer.invoke(IPC.markMessageAsSpam, messageId),

  markMessageAsRead: (messageId, isRead) =>
    ipcRenderer.invoke(IPC.markMessageAsRead, messageId, isRead),

  getEmailConnection: () => ipcRenderer.invoke(IPC.getEmailConnection),

  activateLicense: (key) => ipcRenderer.invoke(IPC.activateLicense, key),

  getLicenseStatus: () => ipcRenderer.invoke(IPC.getLicenseStatus),

  deactivateLicense: () => ipcRenderer.invoke(IPC.deactivateLicense),

  getSupportInfo: () => ipcRenderer.invoke(IPC.getSupportInfo),
  getStorageBreakdown: () => ipcRenderer.invoke(IPC.getStorageBreakdown),

  readLogFile: () => ipcRenderer.invoke(IPC.readLogFile),

  getVendorDetail: (groupKey) =>
    ipcRenderer.invoke(IPC.getVendorDetail, groupKey),

  deleteVendor: (vendorId) =>
    ipcRenderer.invoke(IPC.deleteVendor, vendorId),

  getAllUnsubscribeMethods: (vendorId) =>
    ipcRenderer.invoke(IPC.getAllUnsubscribeMethods, vendorId),

  executeRfc8058: (url) =>
    ipcRenderer.invoke(IPC.executeRfc8058, url),

  trashVendorMessages: (vendorId, types) =>
    ipcRenderer.invoke(IPC.trashVendorMessages, vendorId, types),

  reportSpamVendor: (vendorId) =>
    ipcRenderer.invoke(IPC.reportSpamVendor, vendorId),

  getImpactStats: () => ipcRenderer.invoke(IPC.getImpactStats),

  getRiskCounts: () => ipcRenderer.invoke(IPC.getRiskCounts),

  getActivityLog: (limit, offset) =>
    ipcRenderer.invoke(IPC.getActivityLog, limit, offset),

  listAccounts: () => ipcRenderer.sendSync(IPC.listAccounts),

  addAccount: () => ipcRenderer.invoke(IPC.addAccount),

  switchAccount: (email) => ipcRenderer.invoke(IPC.switchAccount, email),

  removeAccount: (email) => ipcRenderer.invoke(IPC.removeAccount, email),

  onAccountSwitched: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, email: string): void => {
      callback(email);
    };
    ipcRenderer.on(IPC.accountSwitched, handler);
    return () => ipcRenderer.removeListener(IPC.accountSwitched, handler);
  },

  onNoAccountsRemaining: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent): void => {
      callback();
    };
    ipcRenderer.on(IPC.noAccountsRemaining, handler);
    return () => ipcRenderer.removeListener(IPC.noAccountsRemaining, handler);
  },

  onUpdateDownloaded: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, info: UpdateInfo): void => {
      callback(info);
    };
    ipcRenderer.on(IPC.updateDownloaded, handler);
    return () => ipcRenderer.removeListener(IPC.updateDownloaded, handler);
  },

  installUpdate: () => ipcRenderer.invoke(IPC.installUpdate),

  sendEmail: (to, subject, body, inReplyTo) =>
    ipcRenderer.invoke(IPC.sendEmail, to, subject, body, inReplyTo),

  createGdprCase: (input) => ipcRenderer.invoke(IPC.createGdprCase, input),

  getGdprCase: (id) => ipcRenderer.invoke(IPC.getGdprCase, id),

  queryGdprCases: (filter) => ipcRenderer.invoke(IPC.queryGdprCases, filter),

  closeGdprCase: (id) => ipcRenderer.invoke(IPC.closeGdprCase, id),

  reopenGdprCase: (id) => ipcRenderer.invoke(IPC.reopenGdprCase, id),

  escalateGdprCase: (id) => ipcRenderer.invoke(IPC.escalateGdprCase, id),

  addGdprCaseEvent: (caseId, actionType, details) =>
    ipcRenderer.invoke(IPC.addGdprCaseEvent, caseId, actionType, details),

  getGdprCaseReplies: (caseId) =>
    ipcRenderer.invoke(IPC.getGdprCaseReplies, caseId),

  linkGdprCaseMessage: (caseId, messageId) =>
    ipcRenderer.invoke(IPC.linkGdprCaseMessage, caseId, messageId),

  unlinkGdprCaseMessage: (caseId, messageId) =>
    ipcRenderer.invoke(IPC.unlinkGdprCaseMessage, caseId, messageId),

  markGdprCaseViewed: (caseId) => ipcRenderer.invoke(IPC.markGdprCaseViewed, caseId),

  getUnseenCaseReplyCount: () => ipcRenderer.invoke(IPC.getUnseenCaseReplyCount),
};

contextBridge.exposeInMainWorld("api", api);
