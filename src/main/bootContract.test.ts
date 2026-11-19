import { vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let userDataDir = vi.hoisted(() => (""));

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "userData" ? userDataDir : "/tmp"),
  },
  safeStorage: {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value: string) => Buffer.from(value, "utf-8"),
    decryptStringAsync: async (data: Buffer) => ({ result: data.toString("utf-8"), shouldReEncrypt: false }),
  },
}));

vi.mock("./services/settings", () => ({
  getSetting: vi.fn(() => {
    throw new Error("Database not initialized: initDb() must be called before accessing the database");
  }),
  saveSetting: vi.fn(),
}));

import { buildAppSettings } from "./services/appSettings";
import { resetGlobalSettingsCache } from "./services/globalSettings";
import { getSetting } from "./services/settings";

const mockedGetSetting = vi.mocked(getSetting);

describe("boot contract (#38)", () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-boot-"));
    resetGlobalSettingsCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it("fresh install does not touch per-account DB when initDb was skipped", () => {
    expect(() => buildAppSettings()).not.toThrow();
    expect(mockedGetSetting).not.toHaveBeenCalled();
    expect(existsSync(join(userDataDir, "global.db"))).toBe(false);
  });

  it("migrates settings.json without touching a per-account DB", () => {
    writeFileSync(join(userDataDir, "settings.json"), JSON.stringify({ colorTheme: "silk" }));
    resetGlobalSettingsCache();

    const settings = buildAppSettings();

    expect(settings.colorTheme).toBe("silk");
    expect(settings.providerType).toBe("none");
    expect(mockedGetSetting).not.toHaveBeenCalled();
    expect(existsSync(join(userDataDir, "global.db"))).toBe(true);
    expect(existsSync(join(userDataDir, "settings.json"))).toBe(false);
  });
});
