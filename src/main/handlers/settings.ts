import { ipcMain, shell } from "electron";
import { IPC } from "@shared/ipc";
import { isLicenseKey, isString } from "@shared/validation";
import { activateLicense, getLicenseStatus, deleteLicense } from "../services/settings";
import { getSetting, saveSetting, applyAutoLaunch } from "../services/settings";
import { loadCredentials } from "../credentials";
import { dataLog } from "../utils/log";

function getSettings() {
  const creds = loadCredentials();
  const registered = !!getSetting("registeredAt");
  return {
    providerType: creds?.providerType || "none",
    autoLaunch: getSetting("autoLaunch") === "true" || (registered && getSetting("autoLaunch") === undefined),
    launchMinimized: getSetting("launchMinimized") === "true" || (registered && getSetting("launchMinimized") === undefined),
    userName: getSetting("userName") ?? "",
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
      saveSetting("autoLaunch", String(s.autoLaunch));
      const minimized = s.launchMinimized !== undefined
        ? Boolean(s.launchMinimized)
        : getSetting("launchMinimized") === "true";
      applyAutoLaunch(s.autoLaunch, minimized);
    }

    if (s.launchMinimized !== undefined) {
      if (typeof s.launchMinimized !== "boolean") throw new Error("Invalid launchMinimized");
      saveSetting("launchMinimized", String(s.launchMinimized));
      const autoLaunch = s.autoLaunch !== undefined
        ? Boolean(s.autoLaunch)
        : getSetting("autoLaunch") === "true";
      applyAutoLaunch(autoLaunch, s.launchMinimized);
    }

    if (s.userName !== undefined) {
      if (typeof s.userName !== "string") throw new Error("Invalid userName");
      saveSetting("userName", s.userName);
    }
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
