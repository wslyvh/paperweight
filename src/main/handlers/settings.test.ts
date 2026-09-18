let saveSettingsHandler: ((event: unknown, settings: unknown) => void) | undefined;

jest.mock("electron", () => ({
  ipcMain: {
    handle: jest.fn((channel: string, handler: (event: unknown, value: unknown) => void) => {
      if (channel === "save-settings") saveSettingsHandler = handler;
    }),
    on: jest.fn(),
  },
  shell: { openExternal: jest.fn() },
}));
jest.mock("../services/settings", () => ({
  activateLicense: jest.fn(),
  applyAutoLaunch: jest.fn(),
  deleteLicense: jest.fn(),
  getLicenseStatus: jest.fn(),
  getMcpSetup: jest.fn(),
  saveSetting: jest.fn(),
}));
jest.mock("../services/appSettings", () => ({ buildAppSettings: jest.fn() }));
jest.mock("../services/globalSettings", () => ({
  getGlobalSetting: jest.fn(),
  saveGlobalSetting: jest.fn(),
}));
jest.mock("../utils/log", () => ({
  dataLog: { info: jest.fn() },
}));

import { getGlobalSetting, saveGlobalSetting } from "../services/globalSettings";
import { registerSettingsHandlers } from "./settings";

const getGlobal = jest.mocked(getGlobalSetting);
const saveGlobal = jest.mocked(saveGlobalSetting);

describe("AI Agent access settings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    saveSettingsHandler = undefined;
    registerSettingsHandlers();
  });

  it("requires explicit confirmation before enabling Read & write", () => {
    getGlobal.mockReturnValue("read");

    expect(() => saveSettingsHandler?.({}, { agentAccess: "actions" }))
      .toThrow("Read & write access requires confirmation");
    expect(saveGlobal).not.toHaveBeenCalledWith("agentAccess", "actions");

    saveSettingsHandler?.({}, {
      agentAccess: "actions",
      confirmAgentActions: true,
    });
    expect(saveGlobal).toHaveBeenCalledWith("agentAccess", "actions");
  });

  it("does not require another confirmation when Read & write is already on", () => {
    getGlobal.mockImplementation((key) => key === "agentAccess" ? "actions" : undefined);

    expect(() => saveSettingsHandler?.({}, { agentAccess: "actions" })).not.toThrow();
    expect(saveGlobal).toHaveBeenCalledWith("agentAccess", "actions");
  });

  it("starts masking when agent access is enabled", () => {
    getGlobal.mockImplementation((key) => key === "agentAccess" ? "off" : false);

    saveSettingsHandler?.({}, { agentAccess: "read" });

    expect(saveGlobal).toHaveBeenCalledWith("agentAccess", "read");
    expect(saveGlobal).toHaveBeenCalledWith("agentMaskPersonalData", true);
  });

  it("requires explicit confirmation before disabling masking", () => {
    getGlobal.mockImplementation((key) =>
      key === "agentMaskPersonalData" ? true : "read"
    );

    expect(() => saveSettingsHandler?.({}, { agentMaskPersonalData: false }))
      .toThrow("Disabling personal-data masking requires confirmation");
    expect(saveGlobal).not.toHaveBeenCalledWith("agentMaskPersonalData", false);

    saveSettingsHandler?.({}, {
      agentMaskPersonalData: false,
      confirmAgentUnmask: true,
    });
    expect(saveGlobal).toHaveBeenCalledWith("agentMaskPersonalData", false);
  });
});
