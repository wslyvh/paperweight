import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

interface GlobalSettings {
  autoLaunch?: boolean;
  launchMinimized?: boolean;
  activeAccount?: string;
}

export function getSettingsPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron") as typeof import("electron");
  return join(app.getPath("userData"), "settings.json");
}

let _cache: GlobalSettings | undefined;

function loadSettings(): GlobalSettings {
  if (_cache) return _cache;
  const path = getSettingsPath();
  if (!existsSync(path)) return (_cache = {});
  try {
    _cache = JSON.parse(readFileSync(path, "utf-8")) as GlobalSettings;
    return _cache;
  } catch {
    return (_cache = {});
  }
}

function saveSettings(settings: GlobalSettings): void {
  _cache = settings;
  writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), "utf-8");
}

export function getGlobalSetting<K extends keyof GlobalSettings>(key: K): GlobalSettings[K] {
  return loadSettings()[key];
}

export function saveGlobalSetting<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]): void {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
}
