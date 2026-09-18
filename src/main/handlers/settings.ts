import { ipcMain, shell } from "electron";
import { IPC } from "@shared/ipc";
import { isLicenseKey, isString } from "@shared/validation";
import {
  activateLicense,
  applyAutoLaunch,
  deleteLicense,
  getLicenseStatus,
  getMcpSetup,
} from "../services/settings";
import { saveSetting } from "../services/settings";
import { getGlobalSetting, saveGlobalSetting } from "../services/globalSettings";
import { buildAppSettings } from "../services/appSettings";
import { dataLog } from "../utils/log";

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

  ipcMain.on(IPC.getSettings, (event) => {
    event.returnValue = buildAppSettings();
  });

  ipcMain.handle(IPC.saveSettings, (_event, settings: unknown) => {
    if (!settings || typeof settings !== "object") {
      throw new Error("Invalid settings");
    }
    const s = settings as Record<string, unknown>;
    const changedKeys = Object.keys(s)
      .filter((key) => ![
        "agentAccess",
        "agentMaskPersonalData",
        "confirmAgentActions",
        "confirmAgentUnmask",
      ].includes(key))
      .join(", ");
    if (changedKeys) dataLog.info(`Settings saved: ${changedKeys}`);

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

    if (s.colorTheme !== undefined) {
      if (s.colorTheme !== "dim" && s.colorTheme !== "silk") {
        throw new Error("Invalid colorTheme");
      }
      saveGlobalSetting("colorTheme", s.colorTheme);
    }

    if (s.agentAccess !== undefined) {
      if (
        s.agentAccess !== "off"
        && s.agentAccess !== "read"
        && s.agentAccess !== "actions"
      ) {
        throw new Error("Invalid agentAccess");
      }
      if (
        s.agentAccess === "actions"
        && getGlobalSetting("agentAccess") !== "actions"
        && s.confirmAgentActions !== true
      ) {
        throw new Error("Read & write access requires confirmation");
      }
      const previousAgentAccess = getGlobalSetting("agentAccess") ?? "off";
      if (
        previousAgentAccess === "off"
        && s.agentAccess !== "off"
        && s.agentMaskPersonalData === false
      ) {
        throw new Error("Personal-data masking starts on when enabling agent access");
      }
      saveGlobalSetting("agentAccess", s.agentAccess);
      if (previousAgentAccess === "off" && s.agentAccess !== "off") {
        saveGlobalSetting("agentMaskPersonalData", true);
        dataLog.info("Agent personal-data masking: on");
      }
      dataLog.info(`Agent access changed to: ${s.agentAccess}`);
    }

    if (s.agentMaskPersonalData !== undefined) {
      if (typeof s.agentMaskPersonalData !== "boolean") {
        throw new Error("Invalid agentMaskPersonalData");
      }
      if (
        s.agentMaskPersonalData === false
        && getGlobalSetting("agentMaskPersonalData") !== false
        && s.confirmAgentUnmask !== true
      ) {
        throw new Error("Disabling personal-data masking requires confirmation");
      }
      saveGlobalSetting("agentMaskPersonalData", s.agentMaskPersonalData);
      dataLog.info(`Agent personal-data masking: ${s.agentMaskPersonalData ? "on" : "off"}`);
    }
  });

  ipcMain.handle(IPC.getMcpSetup, () => getMcpSetup());

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
