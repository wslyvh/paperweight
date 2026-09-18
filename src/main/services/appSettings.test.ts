import { buildAppSettings } from "./appSettings";
import { getActiveEmail, loadCredentials } from "../credentials";
import { getGlobalSetting } from "./globalSettings";
import { getSetting } from "./settings";

jest.mock("../credentials");
jest.mock("./globalSettings");
jest.mock("./settings");

const mockedGetActiveEmail = jest.mocked(getActiveEmail);
const mockedLoadCredentials = jest.mocked(loadCredentials);
const mockedGetGlobalSetting = jest.mocked(getGlobalSetting);
const mockedGetSetting = jest.mocked(getSetting);

describe("buildAppSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(mockedLoadCredentials).not.toHaveBeenCalled();
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
    expect(mockedLoadCredentials).not.toHaveBeenCalled();
    expect(mockedGetSetting).not.toHaveBeenCalled();
  });

  it("registered account: reads credentials and per-account settings", () => {
    mockedGetActiveEmail.mockReturnValue("user@example.com");
    mockedLoadCredentials.mockReturnValue({ providerType: "gmail" });
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
    expect(mockedLoadCredentials).toHaveBeenCalledTimes(1);
    expect(mockedGetSetting).toHaveBeenCalledWith("registeredAt");
    expect(mockedGetSetting).toHaveBeenCalledWith("userName");
  });

  it("registered account without explicit launch prefs falls back to registered flag", () => {
    mockedGetActiveEmail.mockReturnValue("user@example.com");
    mockedLoadCredentials.mockReturnValue({ providerType: "imap" });
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
