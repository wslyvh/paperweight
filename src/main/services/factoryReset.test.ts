import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mocks = vi.hoisted(() => ({
  paths: {} as Record<string, string>,
  stop: vi.fn(), autoLaunch: vi.fn(), clearData: vi.fn(),
  wipeDatabase: vi.fn(), wipeGlobalDatabase: vi.fn(),
}));
vi.mock("electron", () => ({
  app: { getPath: (name: string) => mocks.paths[name] },
  session: { defaultSession: { clearData: mocks.clearData } },
}));
vi.mock("../sync-manager", () => ({ stopAllSyncs: mocks.stop }));
vi.mock("./settings", () => ({ applyAutoLaunch: mocks.autoLaunch }));
vi.mock("../credentials", () => ({ getActiveEmail: () => { throw new Error("Database is unreadable"); } }));
vi.mock("../db", () => ({ wipeDatabase: mocks.wipeDatabase }));
vi.mock("../globalDb", () => ({ wipeGlobalDatabase: mocks.wipeGlobalDatabase }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});
import { requestFactoryReset } from "./factoryReset";

let directory: string;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAPERWEIGHT_SEED", "");
  directory = fs.mkdtempSync(join(tmpdir(), "paperweight-reset-"));
  mocks.paths = { userData: join(directory, "profile"), logs: join(directory, "logs") };
  fs.mkdirSync(mocks.paths.userData);
  fs.mkdirSync(mocks.paths.logs);
  mocks.wipeGlobalDatabase.mockImplementation(() => fs.rmSync(join(mocks.paths.userData, "global.db"), { force: true }));
  for (const name of ["accounts.json", "settings.json", "license.enc", "__staging__.enc", "orphan.enc", "orphan_abcdef.db", "orphan_abcdef.db-wal", "orphan_abcdef.db-shm", "global.db", `account_${"a".repeat(64)}.db`, `account_${"a".repeat(64)}.db-wal`, `account_${"a".repeat(64)}.db-shm`]) {
    fs.writeFileSync(join(mocks.paths.userData, name), "synthetic data");
  }
  fs.writeFileSync(join(mocks.paths.logs, "main.old.log"), "synthetic log");
  fs.writeFileSync(join(directory, "outside.txt"), "unrelated file");
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

it("stops sync, disables autostart, clears session data and deletes saved app data and logs", async () => {
  await requestFactoryReset();
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.autoLaunch).toHaveBeenCalledWith(false, false);
  expect(mocks.clearData).toHaveBeenCalledOnce();
  expect(mocks.wipeDatabase).toHaveBeenCalledOnce();
  expect(mocks.wipeGlobalDatabase).toHaveBeenCalledOnce();
  expect(fs.readdirSync(mocks.paths.userData)).toEqual([]);
  expect(fs.readdirSync(mocks.paths.logs)).toEqual([]);
  fs.appendFileSync(join(mocks.paths.logs, "main.log"), "new session activity");
  expect(fs.existsSync(join(directory, "outside.txt"))).toBe(true);
});

it("reports deletion failures without a startup marker, and allows another wipe attempt", async () => {
  vi.mocked(fs.rmSync).mockImplementationOnce(() => { throw new Error("EBUSY"); });
  await expect(requestFactoryReset()).rejects.toThrow("EBUSY");
  expect(fs.existsSync(join(mocks.paths.userData, "accounts.json"))).toBe(true);
  expect(fs.existsSync(join(mocks.paths.userData, ".reset-requested"))).toBe(false);
  await requestFactoryReset();
  expect(fs.readdirSync(mocks.paths.userData)).toEqual([]);
});

it("does not delete account files when session cleanup fails", async () => {
  mocks.clearData.mockRejectedValueOnce(new Error("Cleanup failed"));
  await expect(requestFactoryReset()).rejects.toThrow("Cleanup failed");
  expect(mocks.wipeDatabase).not.toHaveBeenCalled();
  expect(fs.existsSync(join(mocks.paths.userData, "accounts.json"))).toBe(true);
});

it("preserves credentials and registry when an inactive database cannot be deleted", async () => {
  const realFs = await vi.importActual<typeof fs>("node:fs");
  vi.mocked(fs.rmSync).mockImplementation((path, options) => {
    if (path === join(mocks.paths.userData, "orphan_abcdef.db")) throw new Error("EBUSY");
    realFs.rmSync(path, options);
  });
  try {
    await expect(requestFactoryReset()).rejects.toThrow("EBUSY");
    expect(mocks.wipeGlobalDatabase).not.toHaveBeenCalled();
    for (const name of ["global.db", "accounts.json", "license.enc", "__staging__.enc", "orphan.enc"]) {
      expect(fs.existsSync(join(mocks.paths.userData, name))).toBe(true);
    }
  } finally {
    vi.mocked(fs.rmSync).mockImplementation(realFs.rmSync);
  }
});

it("leaves Chromium databases to session cleanup", async () => {
  const chromium = join(mocks.paths.userData, "declarative_performance_observer.db");
  fs.writeFileSync(chromium, "Chromium owns this file");
  await requestFactoryReset();
  expect(mocks.clearData).toHaveBeenCalledOnce();
  expect(fs.readFileSync(chromium, "utf8")).toBe("Chromium owns this file");
});
