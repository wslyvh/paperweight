import { ipcMain } from "electron";
import { IPC } from "@shared/ipc";
import { isEmail, isEmailOrDomain, isIntInRange, isString } from "@shared/validation";
import {
  getAllUnsubscribeMethodsForVendor,
  getMessagesByEmail,
  getMessagesByVendor,
  markUnsubscribed,
  markVendorUnsubscribed,
} from "../services/messages";
import { addWhitelistEntry, removeWhitelistEntry, getWhitelistEntries } from "../services/settings";
import { actionLog } from "../utils/log";

export function registerMessageHandlers(): void {
  ipcMain.handle(IPC.getAllUnsubscribeMethods, (_event, vendorId: unknown) => {
    if (typeof vendorId !== "number") throw new Error("Invalid vendor id");
    return getAllUnsubscribeMethodsForVendor(vendorId);
  });

  ipcMain.handle(IPC.executeRfc8058, async (_event, url: unknown) => {
    if (!isString(url) || !url.startsWith("https://")) {
      throw new Error("Invalid URL: must be https");
    }
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });
      actionLog.info(`RFC 8058 unsubscribe POST: ${resp.status}`);
      if (resp.ok) return { success: true };
      return { success: false, error: `Server returned HTTP ${resp.status}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      actionLog.error("RFC 8058 POST failed:", msg);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle(IPC.markUnsubscribed, (_event, email: unknown) => {
    if (!isEmail(email)) throw new Error("Invalid email");
    markUnsubscribed(email);
  });

  ipcMain.handle(IPC.markVendorUnsubscribed, (_event, vendorId: unknown) => {
    if (typeof vendorId !== "number") throw new Error("Invalid vendor id");
    markVendorUnsubscribed(vendorId);
  });

  ipcMain.handle(
    IPC.getMessagesByEmail,
    (_event, email: unknown, limit: unknown) => {
      if (!isEmail(email)) throw new Error("Invalid email");
      if (!isIntInRange(limit, 1, 100)) throw new Error("Invalid limit");
      return getMessagesByEmail(email, limit);
    }
  );

  ipcMain.handle(
    IPC.getVendorMessages,
    (_event, vendorId: unknown, limit: unknown) => {
      if (typeof vendorId !== "number") throw new Error("Invalid vendor id");
      if (!isIntInRange(limit, 1, 100)) throw new Error("Invalid limit");
      return getMessagesByVendor(vendorId, limit);
    }
  );

  ipcMain.handle(IPC.addWhitelistEntry, (_event, value: unknown) => {
    if (!isEmailOrDomain(value)) throw new Error("Invalid value");
    actionLog.info("Whitelist entry added");
    return addWhitelistEntry(value);
  });

  ipcMain.handle(IPC.removeWhitelistEntry, (_event, value: unknown) => {
    if (!isEmailOrDomain(value)) throw new Error("Invalid value");
    actionLog.info("Whitelist entry removed");
    return removeWhitelistEntry(value);
  });

  ipcMain.handle(IPC.getWhitelistEntries, () => getWhitelistEntries());
}
