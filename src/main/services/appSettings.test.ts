import { vi } from "vitest";
import { buildAppSettings } from "./appSettings";
import { getActiveEmail, listAccounts } from "../credentials";
import { getGlobalSetting } from "./globalSettings";
import { getSetting } from "./settings";

vi.mock("../credentials", () => ({ getActiveEmail: vi.fn(), listAccounts: vi.fn() }));
vi.mock("./globalSettings", () => ({ getGlobalSetting: vi.fn() }));
vi.mock("./settings", () => ({ getSetting: vi.fn() }));

const mockedGetActiveEmail = vi.mocked(getActiveEmail);
const mockedListAccounts = vi.mocked(listAccounts);
const mockedGetGlobalSetting = vi.mocked(getGlobalSetting);
const mockedGetSetting = vi.mocked(getSetting);

describe("buildAppSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fresh install: returns defaults without touching DB or credentials", () => {
    mockedGetActiveEmail.mockReturnValue(undefined);
    mockedGetGlobalSetting.mockReturnValue(undefined);

    const settings = buildAppSettings();

    expect(settings).toEqual({
      providerType: "none",
      autoLaunch: false,
      launchMinimized: false,
      userName: "",
      colorTheme: "dim",
      agentAccess: "off",
      agentMaskPersonalData: true,
    });
    expect(mockedListAccounts).not.toHaveBeenCalled();
    expect(mockedGetSetting).not.toHaveBeenCalled();
  });

  it("global settings only: returns saved theme without per-account DB access", () => {
    mockedGetActiveEmail.mockReturnValue(undefined);
    mockedGetGlobalSetting.mockImplementation((key) => {
      if (key === "colorTheme") return "silk";
      return undefined;
    });

    const settings = buildAppSettings();

    expect(settings).toEqual({
      providerType: "none",
      autoLaunch: false,
      launchMinimized: false,
      userName: "",
      colorTheme: "silk",
      agentAccess: "off",
      agentMaskPersonalData: true,
    });
    expect(mockedListAccounts).not.toHaveBeenCalled();
    expect(mockedGetSetting).not.toHaveBeenCalled();
  });

  it("registered account: reads account metadata and per-account settings", () => {
    mockedGetActiveEmail.mockReturnValue("user@example.com");
    mockedListAccounts.mockReturnValue([{ email: "user@example.com", providerType: "gmail" }]);
    mockedGetGlobalSetting.mockImplementation((key) => {
      if (key === "autoLaunch") return true;
      if (key === "launchMinimized") return false;
      if (key === "agentAccess") return "read";
      return undefined;
    });
    mockedGetSetting.mockImplementation((key) => {
      if (key === "registeredAt") return String(Date.now());
      if (key === "userName") return "Alex";
      return undefined;
    });

    const settings = buildAppSettings();

    expect(settings).toEqual({
      providerType: "gmail",
      autoLaunch: true,
      launchMinimized: false,
      userName: "Alex",
      colorTheme: "dim",
      agentAccess: "read",
      agentMaskPersonalData: true,
    });
    expect(mockedListAccounts).toHaveBeenCalledTimes(1);
    expect(mockedGetSetting).toHaveBeenCalledWith("registeredAt");
    expect(mockedGetSetting).toHaveBeenCalledWith("userName");
  });

  it("registered account without explicit launch prefs falls back to registered flag", () => {
    mockedGetActiveEmail.mockReturnValue("user@example.com");
    mockedListAccounts.mockReturnValue([{ email: "user@example.com", providerType: "imap" }]);
    mockedGetGlobalSetting.mockReturnValue(undefined);
    mockedGetSetting.mockImplementation((key) => {
      if (key === "registeredAt") return String(Date.now());
      return undefined;
    });

    const settings = buildAppSettings();

    expect(settings.autoLaunch).toBe(true);
    expect(settings.launchMinimized).toBe(true);
  });
});
