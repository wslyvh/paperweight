import type { Settings } from "@shared/types";
import { getActiveEmail, loadCredentials } from "../credentials";
import { getGlobalSetting } from "./globalSettings";
import { getSetting } from "./settings";

/** App settings for the renderer. Safe to call before an account is registered. */
export function buildAppSettings(): Settings {
  const hasAccount = !!getActiveEmail();
  const creds = hasAccount ? loadCredentials() : undefined;
  const registered = hasAccount ? !!getSetting("registeredAt") : false;
  const autoLaunchVal = getGlobalSetting("autoLaunch");
  const launchMinimizedVal = getGlobalSetting("launchMinimized");
  const colorTheme = getGlobalSetting("colorTheme");
  const agentAccess = getGlobalSetting("agentAccess");
  return {
    providerType: creds?.providerType || "none",
    autoLaunch: autoLaunchVal !== undefined ? autoLaunchVal : registered,
    launchMinimized: launchMinimizedVal !== undefined ? launchMinimizedVal : registered,
    userName: hasAccount ? (getSetting("userName") ?? "") : "",
    colorTheme: colorTheme === "silk" ? "silk" : "dim",
    agentAccess:
      agentAccess === "read" || agentAccess === "actions"
        ? agentAccess
        : "off",
    agentMaskPersonalData: getGlobalSetting("agentMaskPersonalData") !== false,
  };
}
