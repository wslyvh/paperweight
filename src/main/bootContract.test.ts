import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let userDataDir = "";

jest.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "userData" ? userDataDir : "/tmp"),
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value, "utf-8"),
    decryptString: (data: Buffer) => data.toString("utf-8"),
  },
}));

jest.mock("./services/settings", () => ({
  getSetting: jest.fn(() => {
    throw new Error("Database not initialized: initDb() must be called before accessing the database");
  }),
  saveSetting: jest.fn(),
}));

import { buildAppSettings } from "./services/appSettings";
import { resetGlobalSettingsCache } from "./services/globalSettings";
import { getSetting } from "./services/settings";

const mockedGetSetting = jest.mocked(getSetting);

describe("boot contract (#38)", () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-boot-"));
    resetGlobalSettingsCache();
    jest.clearAllMocks();
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
