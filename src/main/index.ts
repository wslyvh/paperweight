import { app, BrowserWindow, dialog, shell, Menu } from "electron";
import { join } from "path";
import { existsSync, readFileSync, renameSync, unlinkSync } from "fs";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { registerIpcHandlers } from "./ipc";
import { startAllSyncs } from "./sync-manager";
import { APP_CONFIG } from "@shared/config";
import { getSetting, applyAutoLaunch, wasLaunchedAsHidden } from "./services/settings";
import { getGlobalSetting, saveGlobalSetting } from "./services/globalSettings";
import { initDb } from "./db";
import { appLog } from "./utils/log";
import { initFileLog } from "./utils/file-log";
import { emailToFileKey, registerAccount, getActiveEmail, listAccounts } from "./credentials";
import { ensureAccountSettingsInDb } from "./services/account";
import Database from "better-sqlite3";

let startHidden = false;

function handleFatalError(err: Error, context: string): void {
  const message = err.message || String(err);
  const stack = err.stack || "No stack trace";
  const full = `${message}\n\n${stack}`;
  appLog.error(`[${context}]`, full);
  try {
    dialog.showErrorBox("Unexpected Error", full);
  } catch {
    console.error(`[${context}]`, full);
  }
  process.exit(1);
}

process.on("uncaughtException", (err) => handleFatalError(err, "uncaughtException"));
process.on("unhandledRejection", (reason, _promise) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  handleFatalError(err, "unhandledRejection");
});

// Migrate existing single-account data to per-account file layout.
// Handles three cases:
//   1. Fresh install — no-op.
//   2. accounts.json exists but DB is still at legacy path — rename DB only.
//   3. Pre-multi-account install — read email from legacy DB, rename both files.
function migrateToMultiAccount(): void {
  const userData = app.getPath("userData");
  const legacyCredPath = join(userData, "credentials.enc");
  const legacyDbPath = join(userData, `${APP_CONFIG.DOMAIN}.db`);
  const accountsPath = join(userData, "accounts.json");

  // Step 0: migrate activeEmail from old accounts.json format to settings.json (one-time).
  // PR #7 stored activeEmail inside accounts.json; settings.json is now authoritative.
  if (existsSync(accountsPath) && getGlobalSetting("activeAccount") === undefined) {
    try {
      const raw = JSON.parse(readFileSync(accountsPath, "utf-8")) as { accounts?: unknown[]; activeEmail?: string };
      if (raw.activeEmail) {
        saveGlobalSetting("activeAccount", raw.activeEmail);
      }
    } catch {
      // ignore — accounts.json may be corrupt or already in new format
    }
  }

  // Case 1: nothing to migrate
  if (!existsSync(legacyCredPath) && !existsSync(legacyDbPath)) return;

  // Case 2: accounts.json exists (new flow already started), but DB may still be at legacy path.
  // The legacy DB belongs to the FIRST registered account (it was used before any relaunch happened),
  // so rename it to that account's per-account path — not the currently active account's path.
  if (existsSync(accountsPath)) {
    if (existsSync(legacyDbPath)) {
      const accounts = listAccounts();
      const firstAccount = accounts[0]; // first account always used the legacy DB
      if (firstAccount) {
        const newDbPath = join(userData, `${emailToFileKey(firstAccount.email)}.db`);
        if (!existsSync(newDbPath)) {
          try {
            renameSync(legacyDbPath, newDbPath);
            for (const suffix of ["-wal", "-shm"]) {
              const oldP = legacyDbPath + suffix;
              const newP = newDbPath + suffix;
              if (existsSync(oldP)) renameSync(oldP, newP);
            }
            appLog.info(`Migration: renamed legacy DB to ${emailToFileKey(firstAccount.email)}.db`);
          } catch {
            appLog.error("Migration: failed to rename legacy database file");
          }
        } else {
          // First account already has its own DB — legacy DB is orphaned, remove it
          try {
            unlinkSync(legacyDbPath);
            appLog.info("Migration: removed orphaned legacy DB");
          } catch { /* non-fatal */ }
        }
      }
    }
    return;
  }

  // Case 3: full migration — determine email from legacy DB or credentials
  let email: string | undefined;
  let providerType = "unknown";
  let registeredAt: number | undefined;

  if (existsSync(legacyDbPath)) {
    try {
      const tempDb = new Database(legacyDbPath, { readonly: true });
      const emailRow = tempDb.prepare("SELECT value FROM settings WHERE key = 'accountEmail'").get() as { value?: string } | undefined;
      email = emailRow?.value;
      const regRow = tempDb.prepare("SELECT value FROM settings WHERE key = 'registeredAt'").get() as { value?: string } | undefined;
      if (regRow?.value) registeredAt = parseInt(regRow.value, 10) || undefined;
      tempDb.close();
    } catch {
      // Old DB may not have the schema yet — ignore
    }
  }

  if (!email && existsSync(legacyCredPath)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { safeStorage } = require("electron") as typeof import("electron");
      const data = readFileSync(legacyCredPath);
      let json: string;
      try {
        json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString("utf-8");
      } catch {
        json = data.toString("utf-8");
      }
      const creds = JSON.parse(json) as { providerType?: string; imap?: { username?: string } };
      if (creds.providerType) providerType = creds.providerType;
      if (!email && creds.imap?.username) email = creds.imap.username;
    } catch {
      // Ignore — credentials may be corrupt or missing
    }
  }

  if (!email) {
    appLog.warn("Migration: could not determine account email, keeping legacy file layout");
    return;
  }

  registerAccount(email, providerType, registeredAt);

  if (existsSync(legacyCredPath)) {
    const newCredPath = join(userData, `credentials-${emailToFileKey(email)}.enc`);
    try {
      renameSync(legacyCredPath, newCredPath);
    } catch {
      appLog.error("Migration: failed to rename credentials file");
      return;
    }
  }

  if (existsSync(legacyDbPath)) {
    const newDbPath = join(userData, `${emailToFileKey(email)}.db`);
    try {
      renameSync(legacyDbPath, newDbPath);
      for (const suffix of ["-wal", "-shm"]) {
        const oldP = legacyDbPath + suffix;
        const newP = newDbPath + suffix;
        if (existsSync(oldP)) renameSync(oldP, newP);
      }
    } catch {
      appLog.error("Migration: failed to rename database file");
    }
  }

  appLog.info(`Migration: account ${email} migrated to per-account storage`);
}

// One-time migration: copy autoLaunch and launchMinimized from the per-account DB
// settings table into settings.json. Must run after initDb() so getDb() is ready.
function migrateGlobalSettings(): void {
  if (getGlobalSetting("autoLaunch") !== undefined) return;
  const autoLaunch = getSetting("autoLaunch");
  const launchMinimized = getSetting("launchMinimized");
  if (autoLaunch !== undefined) saveGlobalSetting("autoLaunch", autoLaunch === "true");
  if (launchMinimized !== undefined) saveGlobalSetting("launchMinimized", launchMinimized === "true");
}


function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on("ready-to-show", () => {
    if (!startHidden) {
      win.show();
    }
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  initFileLog(join(app.getPath("logs"), "main.log"));

  appLog.info(`Starting ${APP_CONFIG.NAME} v${app.getVersion()} (Electron ${process.versions.electron})`);

  // Run migration before initialising the DB so paths are correct.
  migrateToMultiAccount();

  // Pre-compute paths using Electron APIs and store them so db.ts never needs to
  // call Electron APIs itself (enabling worker thread usage without Electron in scope).
  const activeEmail = getActiveEmail();
  const dbName = activeEmail ? `${emailToFileKey(activeEmail)}.db` : `${APP_CONFIG.DOMAIN}.db`;
  const dbPath = join(app.getPath("userData"), dbName);
  const companiesDbPath = is.dev
    ? join(app.getAppPath(), "resources", "companies.db")
    : join(process.resourcesPath, "companies.db");
  const breachesDbPath = is.dev
    ? join(app.getAppPath(), "resources", "breaches.db")
    : join(process.resourcesPath, "breaches.db");
  initDb(dbPath, companiesDbPath, breachesDbPath);

  // Migrate autoLaunch/launchMinimized from per-account DB to settings.json (one-time)
  migrateGlobalSettings();

  // Ensure per-account DB settings are populated (important after account switch/relaunch)
  ensureAccountSettingsInDb();

  electronApp.setAppUserModelId(APP_CONFIG.DOMAIN);

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();

  // Ensure OS login item state matches saved settings
  const autoLaunch = getGlobalSetting("autoLaunch") ?? false;
  const launchMinimized = getGlobalSetting("launchMinimized") ?? false;
  applyAutoLaunch(autoLaunch, launchMinimized);

  // Determine if we should start hidden (must be after DB is available)
  startHidden = wasLaunchedAsHidden(launchMinimized);

  createWindow();
  appLog.info("Window created");

  // Sync all accounts on launch (delayed to let the window render)
  setTimeout(() => {
    appLog.info("Initial sync scheduled (all accounts)");
    startAllSyncs();
  }, 3000);

  // Background sync every 20 minutes — picks up any accounts whose worker has finished
  appLog.info("Background sync interval set (20 min)");
  setInterval(() => {
    startAllSyncs();
  }, 20 * 60 * 1000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
