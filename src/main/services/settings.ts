import { join } from "path";
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { getDb } from "../db";
import { APP_CONFIG } from "@shared/config";
import type { WhitelistEntry, LicenseStatus } from "@shared/types";
import { licenseLog } from "../utils/log";

// --- Key-value settings ---

export function getSetting(key: string): string | undefined {
  const d = getDb();
  const row = d.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function saveSetting(key: string, value: string): void {
  const d = getDb();
  d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    key,
    value
  );
}

// --- Whitelist ---

export function addWhitelistEntry(value: string): void {
  const d = getDb();
  d.prepare("INSERT OR IGNORE INTO whitelist (value) VALUES (?)").run(
    value.toLowerCase()
  );
}

export function removeWhitelistEntry(value: string): void {
  const d = getDb();
  d.prepare("DELETE FROM whitelist WHERE value = ?").run(value.toLowerCase());
}

export function getWhitelistEntries(): WhitelistEntry[] {
  const d = getDb();
  return d
    .prepare("SELECT * FROM whitelist ORDER BY created_at")
    .all() as WhitelistEntry[];
}

// --- Auto-launch ---

const DESKTOP_FILE_NAME = "paperweight.desktop";

function getLinuxAutostartPath() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  const configDir =
    process.env["XDG_CONFIG_HOME"] || join(app.getPath("home"), ".config");
  return join(configDir, "autostart", DESKTOP_FILE_NAME);
}

function applyLinuxAutostart(enabled: boolean, minimized: boolean) {
  const filePath = getLinuxAutostartPath();

  if (!enabled) {
    if (existsSync(filePath)) unlinkSync(filePath);
    return;
  }

  const exec = minimized ? `${process.execPath} --hidden` : process.execPath;

  const content = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Paperweight",
    `Exec=${exec}`,
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");

  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, content);
}

export function applyAutoLaunch(enabled: boolean, minimized: boolean): void {
  if (process.platform === "linux") {
    applyLinuxAutostart(enabled, minimized);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: enabled && minimized ? ["--hidden"] : [],
  });
}

export function wasLaunchedAsHidden(launchMinimized: boolean): boolean {
  if (process.argv.includes("--hidden")) return true;
  if (process.platform === "darwin" && launchMinimized) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require("electron") as typeof import("electron");
    return app.getLoginItemSettings().wasOpenedAtLogin;
  }
  return false;
}

// --- License ---

interface LicenseInfo {
  key: string;
  expiresAt?: string;
  validatedAt: number;
  tier: "test" | "lifetime";
  portalUrl?: string;
}

const VALIDATION_CACHE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function getLicensePath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  return join(app.getPath("userData"), "license.enc");
}

function saveLicense(info: LicenseInfo) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { safeStorage } = require("electron") as typeof import("electron");
  const json = JSON.stringify(info);
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json);
    writeFileSync(getLicensePath(), encrypted);
  } else {
    writeFileSync(getLicensePath(), json, "utf-8");
  }
}

function loadLicense(): LicenseInfo | undefined {
  const path = getLicensePath();
  if (!existsSync(path)) return undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { safeStorage } = require("electron") as typeof import("electron");
    const data = readFileSync(path);
    if (safeStorage.isEncryptionAvailable()) {
      const json = safeStorage.decryptString(data);
      return JSON.parse(json) as LicenseInfo;
    } else {
      return JSON.parse(data.toString("utf-8")) as LicenseInfo;
    }
  } catch {
    return undefined;
  }
}

export function deleteLicense() {
  licenseLog.info("License deactivated");
  const path = getLicensePath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

function isExpired(info: LicenseInfo): boolean {
  if (!info.expiresAt) return false;
  return new Date(info.expiresAt).getTime() < Date.now();
}

async function validateLicenseKey(
  key: string,
): Promise<{ valid: boolean; tier?: "test" | "lifetime"; expiresAt?: string; portalUrl?: string }> {
  const body = JSON.stringify({ key });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { net } = require("electron") as typeof import("electron");
  const response = await net.fetch(APP_CONFIG.LICENSE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();

    try {
      const parsed = text ? (JSON.parse(text) as unknown) : undefined;
      if (
        parsed &&
        typeof parsed === "object" &&
        "valid" in parsed &&
        (parsed as { valid?: unknown }).valid === false
      ) {
        return { valid: false };
      }
    } catch {
      // ignore JSON parse errors
    }

    throw new Error(text || `License validation failed (${response.status})`);
  }

  return (await response.json()) as {
    valid: boolean;
    tier?: "test" | "lifetime";
    expiresAt?: string;
    portalUrl?: string;
  };
}

export async function activateLicense(key: string): Promise<LicenseStatus> {
  const result = await validateLicenseKey(key);

  if (!result.valid) {
    licenseLog.info("License activation failed (invalid key)");
    return { active: false };
  }

  const info: LicenseInfo = {
    key,
    expiresAt: result.expiresAt,
    validatedAt: Date.now(),
    tier: result.tier || "lifetime",
    portalUrl: result.portalUrl,
  };
  saveLicense(info);

  licenseLog.info(`License activated (tier: ${info.tier})`);
  return {
    active: true,
    tier: info.tier,
    expiresAt: info.expiresAt,
    key,
    portalUrl: info.portalUrl,
  };
}

export function getLicenseStatus(): LicenseStatus {
  const info = loadLicense();
  if (!info) return { active: false };

  if (isExpired(info)) {
    return { active: false, key: info.key };
  }

  return {
    active: true,
    tier: info.tier,
    expiresAt: info.expiresAt,
    key: info.key,
    portalUrl: info.portalUrl,
  };
}

export async function hasValidLicense(): Promise<boolean> {
  const info = loadLicense();
  if (!info) return false;

  const cacheAge = Date.now() - info.validatedAt;

  if (cacheAge < VALIDATION_CACHE_MS) {
    return !isExpired(info);
  }

  try {
    const result = await validateLicenseKey(info.key);
    if (!result.valid) {
      licenseLog.info("License validation: invalid (remote)");
      deleteLicense();
      return false;
    }
    const updated: LicenseInfo = {
      ...info,
      validatedAt: Date.now(),
      expiresAt: result.expiresAt,
      tier: result.tier || info.tier,
      portalUrl: result.portalUrl ?? info.portalUrl,
    };
    saveLicense(updated);
    const valid = !isExpired(updated);
    licenseLog.info(`License validation (remote): ${valid ? "valid" : "expired"}, tier: ${updated.tier}`);
    return valid;
  } catch (err) {
    // Offline — fall back to local expiration check
    licenseLog.error("License validation network error:", err instanceof Error ? err.message : String(err));
    return !isExpired(info);
  }
}
