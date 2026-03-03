import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "@shared/ipc";
import type { ElectronAPI, SyncStatus } from "@shared/ipc";

export type { ElectronAPI } from "@shared/ipc";

const api: ElectronAPI = {
  getConnectionStatus: () => ipcRenderer.invoke(IPC.getConnectionStatus),

  startGmailAuth: () => ipcRenderer.invoke(IPC.startGmailAuth),

  startMicrosoftAuth: () => ipcRenderer.invoke(IPC.startMicrosoftAuth),

  saveImapConfig: (config) => ipcRenderer.invoke(IPC.saveImapConfig, config),

  testConnection: () => ipcRenderer.invoke(IPC.testConnection),

  getAccountInfo: () => ipcRenderer.invoke(IPC.getAccountInfo),

  startSync: () => ipcRenderer.invoke(IPC.startSync),

  getSyncStatus: () => ipcRenderer.invoke(IPC.getSyncStatus),

  getDashboardStats: () => ipcRenderer.invoke(IPC.getDashboardStats),

  getDashboardTrend: () => ipcRenderer.invoke(IPC.getDashboardTrend),

  getAttentionStats: () => ipcRenderer.invoke(IPC.getAttentionStats),

  queryVendors: (query) => ipcRenderer.invoke(IPC.queryVendors, query),

  getSettings: () => ipcRenderer.invoke(IPC.getSettings),

  saveSettings: (settings) => ipcRenderer.invoke(IPC.saveSettings, settings),

  clearSyncData: () => ipcRenderer.invoke(IPC.clearSyncData),

  wipeData: () => ipcRenderer.invoke(IPC.wipeData),

  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),

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

  requestModifyAccess: () => ipcRenderer.invoke(IPC.requestModifyAccess),

  getEmailConnection: () => ipcRenderer.invoke(IPC.getEmailConnection),

  activateLicense: (key) => ipcRenderer.invoke(IPC.activateLicense, key),

  getLicenseStatus: () => ipcRenderer.invoke(IPC.getLicenseStatus),

  deactivateLicense: () => ipcRenderer.invoke(IPC.deactivateLicense),

  getSupportInfo: () => ipcRenderer.invoke(IPC.getSupportInfo),

  readLogFile: () => ipcRenderer.invoke(IPC.readLogFile),

  getVendorDetail: (groupKey) =>
    ipcRenderer.invoke(IPC.getVendorDetail, groupKey),

  deleteVendor: (vendorId) =>
    ipcRenderer.invoke(IPC.deleteVendor, vendorId),

  getAllUnsubscribeMethods: (vendorId) =>
    ipcRenderer.invoke(IPC.getAllUnsubscribeMethods, vendorId),

  executeRfc8058: (url) =>
    ipcRenderer.invoke(IPC.executeRfc8058, url),

  trashVendorMessages: (vendorId) =>
    ipcRenderer.invoke(IPC.trashVendorMessages, vendorId),

  reportSpamVendor: (vendorId) =>
    ipcRenderer.invoke(IPC.reportSpamVendor, vendorId),

  getImpactStats: () => ipcRenderer.invoke(IPC.getImpactStats),

  getRiskCounts: () => ipcRenderer.invoke(IPC.getRiskCounts),

  getActivityLog: (limit, offset) =>
    ipcRenderer.invoke(IPC.getActivityLog, limit, offset),
};

contextBridge.exposeInMainWorld("api", api);
