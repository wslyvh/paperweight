import { app, BrowserWindow, dialog, shell } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { registerIpcHandlers } from "./ipc";
import { startSync } from "./sync-manager";
import { APP_CONFIG } from "@shared/config";
import { getSetting, applyAutoLaunch, wasLaunchedAsHidden } from "./services/settings";
import { initDb } from "./db";
import { appLog } from "./utils/log";
import { initFileLog } from "./utils/file-log";

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
  initFileLog(join(app.getPath("logs"), "main.log"));

  appLog.info(`Starting ${APP_CONFIG.NAME} v${app.getVersion()} (Electron ${process.versions.electron})`);

  // Pre-compute paths using Electron APIs and store them so db.ts never needs to
  // call Electron APIs itself (enabling worker thread usage without Electron in scope).
  const dbPath = join(app.getPath("userData"), `${APP_CONFIG.DOMAIN}.db`);
  const companiesDbPath = is.dev
    ? join(app.getAppPath(), "resources", "companies.db")
    : join(process.resourcesPath, "companies.db");
  const breachesDbPath = is.dev
    ? join(app.getAppPath(), "resources", "breaches.db")
    : join(process.resourcesPath, "breaches.db");
  initDb(dbPath, companiesDbPath, breachesDbPath);

  electronApp.setAppUserModelId(APP_CONFIG.DOMAIN);

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();

  // Ensure OS login item state matches saved settings
  const autoLaunch = getSetting("autoLaunch") === "true";
  const launchMinimized = getSetting("launchMinimized") === "true";
  applyAutoLaunch(autoLaunch, launchMinimized);

  // Determine if we should start hidden (must be after DB is available)
  startHidden = wasLaunchedAsHidden(launchMinimized);

  createWindow();
  appLog.info("Window created");

  // Sync on launch (delayed to let the window render)
  setTimeout(() => {
    appLog.info("Initial sync scheduled");
    startSync();
  }, 3000);

  // Background sync every 20 minutes
  appLog.info("Background sync interval set (20 min)");
  setInterval(() => {
    startSync();
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
