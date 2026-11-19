import { getElectron } from "../electronRuntime";
import { readSecureFile, writeSecureFile, SecureStorageError } from "../secureStorage";
import { join } from "path";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { getDb } from "../db";
import { APP_CONFIG } from "@shared/config";
import type { LicenseTier, LicenseStatus, McpSetup, WhitelistEntry } from "@shared/types";
import { licenseLog } from "../utils/log";

export const PRO_REQUIRED_MESSAGE = "Paperweight Pro is required. Upgrade in Settings to continue.";

export async function requirePro(): Promise<void> {
  const status = await getLicenseStatus();
  if (status.error) throw new Error(status.error);
  if (!status.active) throw new Error(PRO_REQUIRED_MESSAGE);
}

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
  const { app } = getElectron();
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

  const { app } = getElectron();
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: enabled && minimized ? ["--hidden"] : [],
  });
}

export function wasLaunchedAsHidden(launchMinimized: boolean): boolean {
  if (process.argv.includes("--hidden")) return true;
  if (process.platform === "darwin" && launchMinimized) {
      const { app } = getElectron();
    return app.getLoginItemSettings().wasOpenedAtLogin;
  }
  return false;
}

// --- MCP setup ---

export function getMcpSetup(): McpSetup {
  const { app } = getElectron();
  const launcher = process.platform === "win32"
    ? "paperweight-mcp.cmd"
    : "paperweight-mcp";
  const command = app.isPackaged
    ? join(process.resourcesPath, launcher)
    : join(app.getAppPath(), "build", "mcp", launcher);
  return existsSync(command)
    ? { available: true, server: { command } }
    : { available: false };
}

// --- License ---

// Read old cached licenses and responses without exposing legacy deal labels.
type StoredLicenseTier = LicenseTier | "annual" | "test";

function normalizeLicenseTier(tier: StoredLicenseTier): LicenseTier {
  return tier === "annual" || tier === "test" ? "pro" : tier;
}

interface LicenseInfo {
  key: string;
  expiresAt?: string;
  validatedAt: number;
  tier: StoredLicenseTier;
  portalUrl?: string;
}

const VALIDATION_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours
const VALIDATION_TIMEOUT_MS = 8_000;

function getLicensePath(): string {
  const { app } = getElectron();
  return join(app.getPath("userData"), "license.enc");
}

async function saveLicense(info: LicenseInfo) {
  await writeSecureFile(getLicensePath(), info);
}

async function loadLicense() {
  return readSecureFile<LicenseInfo>(getLicensePath());
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
  return !(new Date(info.expiresAt).getTime() > Date.now());
}

async function validateLicenseKey(
  key: string,
) {
  const body = JSON.stringify({ key });
  const { net } = getElectron();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("License validation timed out"));
    }, VALIDATION_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([
      net.fetch(APP_CONFIG.LICENSE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      }),
      timedOut,
    ]);

    if (!response.ok) {
      // Invalid keys are normal 200 responses with valid:false. Service failures
      // must preserve the cached key so a temporary outage cannot remove it.
      throw new Error(`License validation unavailable (${response.status})`);
    }

    const result = await Promise.race([
      response.json() as Promise<{
        valid: boolean;
        tier?: StoredLicenseTier;
        expiresAt?: string;
        portalUrl?: string;
      }>,
      timedOut,
    ]);
    if (result?.valid === false) return { valid: false as const };
    if (
      result?.valid !== true ||
      !result.tier ||
      !["pro", "cleanup", "lifetime", "annual", "test"].includes(result.tier) ||
      (result.expiresAt !== undefined &&
        (typeof result.expiresAt !== "string" || !Number.isFinite(Date.parse(result.expiresAt)))) ||
      (result.tier === "cleanup" && !result.expiresAt)
    ) {
      throw new Error("Invalid license response");
    }
    return { ...result, valid: true as const, tier: normalizeLicenseTier(result.tier) };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
    tier: result.tier,
    portalUrl: result.portalUrl,
  };
  await saveLicense(info);

  licenseLog.info(`License activated (tier: ${info.tier})`);
  return {
    active: true,
    tier: normalizeLicenseTier(info.tier),
    expiresAt: info.expiresAt,
    key,
    portalUrl: info.portalUrl,
  };
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  let info: LicenseInfo | undefined;
  try {
    info = await loadLicense();
  } catch (error) {
    if (error instanceof SecureStorageError) return { active: false, error: error.message };
    throw error;
  }
  if (!info) return { active: false };

  if (isExpired(info)) {
    return { active: false, key: info.key };
  }

  return {
    active: true,
    tier: normalizeLicenseTier(info.tier),
    expiresAt: info.expiresAt,
    key: info.key,
    portalUrl: info.portalUrl,
  };
}

export async function hasValidLicense(): Promise<boolean> {
  const info = await loadLicense();
  if (!info) return false;

  const cacheAge = Date.now() - info.validatedAt;

  if (cacheAge < VALIDATION_CACHE_MS && !isExpired(info)) {
    return true;
  }

  try {
    const result = await validateLicenseKey(info.key);
    const current = await loadLicense();
    if (!current || current.key !== info.key) {
      return current ? !isExpired(current) : false;
    }
    if (!result.valid) {
      licenseLog.info("License validation: invalid (remote)");
      deleteLicense();
      return false;
    }
    const updated: LicenseInfo = {
      ...current,
      validatedAt: Date.now(),
      expiresAt: result.expiresAt,
      tier: result.tier,
      portalUrl: result.portalUrl ?? current.portalUrl,
    };
    await saveLicense(updated);
    const valid = !isExpired(updated);
    licenseLog.info(`License validation (remote): ${valid ? "valid" : "expired"}, tier: ${updated.tier}`);
    return valid;
  } catch (err) {
    if (err instanceof SecureStorageError) throw err;
    // Offline or timed out — fall back to local expiration check
    licenseLog.error("License validation network error:", err instanceof Error ? err.message : String(err));
    return !isExpired(info);
  }
}
