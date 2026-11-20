import { vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let mockUserData = vi.hoisted(() => (""));
vi.mock("../sync-manager", () => ({ startAllSyncs: vi.fn() }));
let saveSettingsHandler: ((event: unknown, settings: unknown) => Promise<void>) | undefined;

vi.mock("electron", () => ({
  app: { getPath: () => mockUserData },
  safeStorage: {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value: string) => Buffer.from(value),
    decryptStringAsync: async (value: Buffer) => ({ result: value.toString(), shouldReEncrypt: false }),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, value: unknown) => Promise<void>) => {
      if (channel === "save-settings") saveSettingsHandler = handler;
    }),
    on: vi.fn(),
  },
  shell: { openExternal: vi.fn() },
}));
vi.mock("../services/settings", async () => ({
  activateLicense: vi.fn(),
  requirePro: (await vi.importActual<typeof import("../services/settings")>("../services/settings")).requirePro,
  applyAutoLaunch: vi.fn(),
  deleteLicense: vi.fn(),
  getLicenseStatus: vi.fn(),
  getMcpSetup: vi.fn(),
  saveSetting: vi.fn(),
}));
vi.mock("../services/appSettings", () => ({ buildAppSettings: vi.fn() }));
vi.mock("../services/globalSettings", () => ({
  getGlobalSetting: vi.fn(),
  saveGlobalSetting: vi.fn(),
}));
vi.mock("../utils/log", () => ({
  dataLog: { info: vi.fn() },
}));

import { getGlobalSetting, saveGlobalSetting } from "../services/globalSettings";
import { registerSettingsHandlers } from "./settings";

const getGlobal = vi.mocked(getGlobalSetting);
const saveGlobal = vi.mocked(saveGlobalSetting);

describe("AI Agent access settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserData = mkdtempSync(join(tmpdir(), "paperweight-agent-settings-"));
    writeFileSync(join(mockUserData, "license.enc"), JSON.stringify({
      key: "SETTINGS-TEST", tier: "test", validatedAt: Date.now(),
    }));
    saveSettingsHandler = undefined;
    registerSettingsHandlers();
  });

  afterEach(() => rmSync(mockUserData, { recursive: true, force: true }));

  it.each(["read", "actions"])("blocks Free from enabling %s access through the real entitlement guard", async (access) => {
    unlinkSync(join(mockUserData, "license.enc"));
    await expect(saveSettingsHandler?.({}, { agentAccess: access, confirmAgentActions: true }))
      .rejects.toThrow("Paperweight Pro is required");
    expect(saveGlobal).not.toHaveBeenCalled();
  });

  it("allows Free to revoke agent access", async () => {
    unlinkSync(join(mockUserData, "license.enc"));
    getGlobal.mockReturnValue("actions");
    await saveSettingsHandler?.({}, { agentAccess: "off" });
    expect(saveGlobal).toHaveBeenCalledWith("agentAccess", "off");
  });

  it("requires explicit confirmation before enabling Read & write", async () => {
    getGlobal.mockReturnValue("read");

    await expect(saveSettingsHandler?.({}, { agentAccess: "actions" }))
      .rejects.toThrow("Read & write access requires confirmation");
    expect(saveGlobal).not.toHaveBeenCalledWith("agentAccess", "actions");

    await saveSettingsHandler?.({}, {
      agentAccess: "actions",
      confirmAgentActions: true,
    });
    expect(saveGlobal).toHaveBeenCalledWith("agentAccess", "actions");
  });

  it("does not require another confirmation when Read & write is already on", async () => {
    getGlobal.mockImplementation((key) => key === "agentAccess" ? "actions" : undefined);

    await expect(saveSettingsHandler?.({}, { agentAccess: "actions" })).resolves.toBeUndefined();
    expect(saveGlobal).toHaveBeenCalledWith("agentAccess", "actions");
  });

  it("starts masking when agent access is enabled", async () => {
    getGlobal.mockImplementation((key) => key === "agentAccess" ? "off" : false);

    await saveSettingsHandler?.({}, { agentAccess: "read" });

    expect(saveGlobal).toHaveBeenCalledWith("agentAccess", "read");
    expect(saveGlobal).toHaveBeenCalledWith("agentMaskPersonalData", true);
  });

  it("requires explicit confirmation before disabling masking", async () => {
    getGlobal.mockImplementation((key) =>
      key === "agentMaskPersonalData" ? true : "read"
    );

    await expect(saveSettingsHandler?.({}, { agentMaskPersonalData: false }))
      .rejects.toThrow("Disabling personal-data masking requires confirmation");
    expect(saveGlobal).not.toHaveBeenCalledWith("agentMaskPersonalData", false);

    await saveSettingsHandler?.({}, {
      agentMaskPersonalData: false,
      confirmAgentUnmask: true,
    });
    expect(saveGlobal).toHaveBeenCalledWith("agentMaskPersonalData", false);
  });
});
