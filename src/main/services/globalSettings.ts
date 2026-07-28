import {
  getGlobalDb,
  hasReadableGlobalState,
  resetGlobalDb,
} from "../globalDb";

interface GlobalSettings {
  autoLaunch?: boolean;
  launchMinimized?: boolean;
  activeAccount?: string;
  colorTheme?: "dim" | "silk";
}

export function getGlobalSetting<K extends keyof GlobalSettings>(key: K): GlobalSettings[K] {
  if (!hasReadableGlobalState()) return undefined;
  const row = getGlobalDb()
    .prepare("SELECT value_json FROM app_settings WHERE key = ?")
    .get(key) as { value_json: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value_json) as GlobalSettings[K];
  } catch {
    return undefined;
  }
}

export function saveGlobalSetting<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]): void {
  const target = getGlobalDb();
  if (value === undefined) {
    target.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
    return;
  }
  target
    .prepare(
      `INSERT INTO app_settings (key, value_json)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
    )
    .run(key, JSON.stringify(value));
}

/** Closes the global connection and clears its configured path (for tests). */
export function resetGlobalSettingsCache(): void {
  resetGlobalDb();
}
