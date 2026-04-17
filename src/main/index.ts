import { app, BrowserWindow, dialog, shell, Menu, ipcMain } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { autoUpdater } from "electron-updater";
import { registerIpcHandlers } from "./ipc";
import { startAllSyncs } from "./sync-manager";
import { APP_CONFIG } from "@shared/config";
import { applyAutoLaunch, wasLaunchedAsHidden } from "./services/settings";
import { getGlobalSetting } from "./services/globalSettings";
import { initDb } from "./db";
import { appLog } from "./utils/log";
import { initFileLog } from "./utils/file-log";
import { emailToFileKey, getActiveEmail } from "./credentials";
import { ensureAccountSettingsInDb } from "./services/account";
import { runMigrations } from "./migrations";
import { IPC } from "@shared/ipc";
import type { UpdateInfo } from "@shared/ipc";

let startHidden = false;
let lastUpdateInfo: UpdateInfo | null = null;

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

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  initFileLog(join(app.getPath("logs"), "main.log"));

  appLog.info(`Starting ${APP_CONFIG.NAME} v${app.getVersion()} (Electron ${process.versions.electron})`);

  await runMigrations();

  const companiesDbPath = is.dev
    ? join(app.getAppPath(), "resources", "companies.db")
    : join(process.resourcesPath, "companies.db");
  const breachesDbPath = is.dev
    ? join(app.getAppPath(), "resources", "breaches.db")
    : join(process.resourcesPath, "breaches.db");
  const enforcementDbPath = is.dev
    ? join(app.getAppPath(), "resources", "enforcement.db")
    : join(process.resourcesPath, "enforcement.db");

  // Only open the DB if an account is already registered — onboarding creates it on first auth.
  const activeEmail = getActiveEmail();
  if (activeEmail) {
    const dbPath = join(app.getPath("userData"), `${emailToFileKey(activeEmail)}.db`);
    initDb(dbPath, companiesDbPath, breachesDbPath, enforcementDbPath);
    ensureAccountSettingsInDb();
  }

  electronApp.setAppUserModelId(APP_CONFIG.DOMAIN);

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();
  ipcMain.handle(IPC.getLastUpdateInfo, () => lastUpdateInfo);
  ipcMain.handle(IPC.installUpdate, () => autoUpdater.quitAndInstall());

  // Ensure OS login item state matches saved settings
  const autoLaunch = getGlobalSetting("autoLaunch") ?? false;
  const launchMinimized = getGlobalSetting("launchMinimized") ?? false;
  applyAutoLaunch(autoLaunch, launchMinimized);

  // Determine if we should start hidden (must be after DB is available)
  startHidden = wasLaunchedAsHidden(launchMinimized);

  const win = createWindow();
  appLog.info("Window created");

  const emitUpdateDownloaded = (latest: string) => {
    const current = app.getVersion();
    const isMajor = latest.split(".")[0] !== current.split(".")[0];
    lastUpdateInfo = { latest, current, isMajor };
    win.webContents.send(IPC.updateDownloaded, lastUpdateInfo);
  };

  if (!is.dev) {
    autoUpdater.logger = appLog;
    autoUpdater.allowPrerelease = true;
    autoUpdater.autoDownload = true;
    autoUpdater.on("update-downloaded", (info) => {
      emitUpdateDownloaded(info.version);
    });
    autoUpdater.checkForUpdates().catch((err) => {
      appLog.warn("Auto-update check failed:", err);
    });
  }

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
