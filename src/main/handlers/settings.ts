import { ipcMain, shell } from "electron";
import { IPC } from "@shared/ipc";
import { isLicenseKey, isString } from "@shared/validation";
import { activateLicense, getLicenseStatus, deleteLicense, applyAutoLaunch } from "../services/settings";
import { getSetting, saveSetting } from "../services/settings";
import { applySyncPeriodChange } from "../services/sync";
import { stopSync } from "../sync-manager";
import { getGlobalSetting, saveGlobalSetting } from "../services/globalSettings";
import { loadCredentials } from "../credentials";
import { dataLog } from "../utils/log";

function getSettings() {
  const creds = loadCredentials();
  const registered = !!getSetting("registeredAt");
  const autoLaunchVal = getGlobalSetting("autoLaunch");
  const launchMinimizedVal = getGlobalSetting("launchMinimized");
  return {
    providerType: creds?.providerType || "none",
    autoLaunch: autoLaunchVal !== undefined ? autoLaunchVal : registered,
    launchMinimized: launchMinimizedVal !== undefined ? launchMinimizedVal : registered,
    userName: getSetting("userName") ?? "",
    historySyncDays: getSetting("historySyncDays") !== undefined
      ? parseInt(getSetting("historySyncDays")!, 10)
      : undefined,
  };
}

export function registerSettingsHandlers(): void {
  // --- License ---

  ipcMain.handle(IPC.activateLicense, async (_event, key: unknown) => {
    if (!isLicenseKey(key)) throw new Error("Invalid license key");
    return activateLicense(key);
  });

  ipcMain.handle(IPC.getLicenseStatus, () => getLicenseStatus());

  ipcMain.handle(IPC.deactivateLicense, () => {
    deleteLicense();
  });

  // --- App settings ---

  ipcMain.handle(IPC.getSettings, () => getSettings());

  ipcMain.handle(IPC.saveSettings, (_event, settings: unknown) => {
    if (!settings || typeof settings !== "object") {
      throw new Error("Invalid settings");
    }
    const s = settings as Record<string, unknown>;
    const changedKeys = Object.keys(s).join(", ");
    dataLog.info(`Settings saved: ${changedKeys}`);

    if (s.autoLaunch !== undefined) {
      if (typeof s.autoLaunch !== "boolean") throw new Error("Invalid autoLaunch");
      saveGlobalSetting("autoLaunch", s.autoLaunch);
    }

    if (s.launchMinimized !== undefined) {
      if (typeof s.launchMinimized !== "boolean") throw new Error("Invalid launchMinimized");
      saveGlobalSetting("launchMinimized", s.launchMinimized);
    }

    if (s.autoLaunch !== undefined || s.launchMinimized !== undefined) {
      const autoLaunch = getGlobalSetting("autoLaunch") ?? false;
      const minimized = getGlobalSetting("launchMinimized") ?? false;
      applyAutoLaunch(autoLaunch, minimized);
    }

    if (s.userName !== undefined) {
      if (typeof s.userName !== "string") throw new Error("Invalid userName");
      saveSetting("userName", s.userName);
    }

    if (s.historySyncDays !== undefined) {
      if (typeof s.historySyncDays !== "number" || s.historySyncDays < 0)
        throw new Error("Invalid historySyncDays");
      saveSetting("historySyncDays", String(s.historySyncDays));
    }
  });

  ipcMain.handle(IPC.applySyncPeriod, (_event, days: unknown) => {
    if (typeof days !== "number" || days < 0)
      throw new Error("Invalid days");
    stopSync();
    saveSetting("historySyncDays", String(days));
    applySyncPeriodChange(days);
  });

  // --- Shell ---

  ipcMain.handle(IPC.openExternal, (_event, url: unknown) => {
    if (!isString(url) || url.trim() === "") return;

    try {
      const parsed = new URL(url);
      if (["https:", "http:", "mailto:"].includes(parsed.protocol)) {
        shell.openExternal(url);
      }
    } catch {
      // Invalid URL, ignore
    }
  });
}
