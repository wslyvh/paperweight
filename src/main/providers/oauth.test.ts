import { createHash } from "node:crypto";
import { get } from "node:http";
import { vi } from "vitest";
import { saveCredentials } from "../credentials";
import { startLoopbackAuth } from "./gmail";
import { startMicrosoftLoopbackAuth } from "./microsoft";
import { cancelLoopbackAuth, runLoopbackAuth } from "./utils";

const mocks = vi.hoisted(() => {
  vi.stubGlobal("__GOOGLE_CLIENT_ID__", "fixture-google");
  vi.stubGlobal("__GOOGLE_CLIENT_SECRET__", "fixture-secret");
  vi.stubGlobal("__MICROSOFT_CLIENT_ID__", "fixture-microsoft");
  return { open: vi.fn(), copy: vi.fn(), emit: vi.fn() };
});
vi.mock("../electronRuntime", () => ({
  getElectron: () => ({
    shell: { openExternal: mocks.open },
    clipboard: { writeText: mocks.copy },
    BrowserWindow: { getAllWindows: () => [{ webContents: { send: mocks.emit } }] },
  }),
}));
vi.mock("../credentials", () => ({ saveCredentials: vi.fn(), loadCredentials: vi.fn() }));
vi.mock("../utils/log", () => ({ authLog: { error: vi.fn(), info: vi.fn() }, syncLog: {} }));

function callback(authUrl: URL, params: Record<string, string>) {
  const url = new URL(authUrl.searchParams.get("redirect_uri")!);
  // The listener is IPv4 for both providers; avoid OS-dependent localhost resolution.
  url.hostname = "127.0.0.1";
  url.search = new URLSearchParams(params).toString();
  return new Promise<number | undefined>((resolve, reject) => {
    const request = get(url, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
  });
}

function captureAuthUrl() {
  const { promise, resolve } = Promise.withResolvers<URL>();
  const capture = async (url: string) => { resolve(new URL(url)); };
  mocks.open.mockImplementation(capture);
  mocks.copy.mockImplementation(capture);
  return promise;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

it.each([
  { provider: "Google", start: startLoopbackAuth },
  { provider: "Microsoft", start: startMicrosoftLoopbackAuth },
])("binds $provider sign-in to state and PKCE in browser and copy-link flows", async ({ start }) => {
  const fetchMock = vi.fn(async () => Response.json({ access_token: "fixture-token", expires_in: 3600 }));
  vi.stubGlobal("fetch", fetchMock);
  let previousState: string | undefined;
  let previousVerifier: string | undefined;
  for (const browser of [true, false]) {
    fetchMock.mockClear();
    vi.mocked(saveCredentials).mockClear();
    const opened = captureAuthUrl();
    const pending = start(browser);
    const authUrl = await opened;
    const state = authUrl.searchParams.get("state")!;
    expect(state).toBeTruthy();
    expect(state).not.toBe(previousState);
    expect(mocks.emit).toHaveBeenCalledWith(expect.any(String), authUrl.toString());

    try {
      expect(await callback(authUrl, { code: "unrelated" })).toBe(400);
      expect(await callback(authUrl, { code: "unrelated", state: previousState ?? "wrong" })).toBe(400);
      expect(await callback(authUrl, { error: "access_denied", state: "wrong" })).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(saveCredentials).not.toHaveBeenCalled();
    } finally {
      await callback(authUrl, { code: "fixture-code", state });
      await pending;
    }
    expect(await pending).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = new URLSearchParams(String(options.body));
    const verifier = body.get("code_verifier")!;
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(verifier).not.toBe(previousVerifier);
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("code_challenge")).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(authUrl.searchParams.has("code_verifier")).toBe(false);
    expect(body.get("code")).toBe("fixture-code");
    expect(body.get("redirect_uri")).toBe(authUrl.searchParams.get("redirect_uri"));
    expect(saveCredentials).toHaveBeenCalledTimes(1);
    previousState = state;
    previousVerifier = verifier;
  }
});

it("accepts cancellation only with matching state", async () => {
  const opened = captureAuthUrl();
  const pending = runLoopbackAuth("http://127.0.0.1", redirectUri =>
    `https://example.test/auth?redirect_uri=${encodeURIComponent(redirectUri)}`,
  );
  const rejected = expect(pending).rejects.toThrow("access_denied");
  const authUrl = await opened;
  await callback(authUrl, { error: "access_denied", state: authUrl.searchParams.get("state")! });
  await rejected;
  expect(saveCredentials).not.toHaveBeenCalled();
});

it("returns the existing error if opening the browser fails", async () => {
  mocks.open.mockRejectedValue(new Error("fixture failure"));
  await expect(runLoopbackAuth("http://127.0.0.1", () => "https://example.test/auth"))
    .rejects.toThrow("Could not open the browser. Try connecting again.");
});


it.each([
  { provider: "Google", start: startLoopbackAuth },
  { provider: "Microsoft", start: startMicrosoftLoopbackAuth },
])("cancels $provider sign-in and permits an immediate retry", async ({ start }) => {
  const fetchMock = vi.fn(async () => Response.json({ access_token: "fixture-token", expires_in: 3600 }));
  vi.stubGlobal("fetch", fetchMock);
  for (const browser of [true, false]) {
    fetchMock.mockClear();
    vi.mocked(saveCredentials).mockClear();
    const opened = captureAuthUrl();
    const pending = start(browser);
    const authUrl = await opened;
    expect(cancelLoopbackAuth()).toBe(true);
    expect(await pending).toEqual({ success: false, error: "Authorization cancelled" });
    expect(cancelLoopbackAuth()).toBe(false);
    await expect(callback(authUrl, {
      code: "fixture-code", state: authUrl.searchParams.get("state")!,
    })).rejects.toMatchObject({ code: "ECONNREFUSED" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveCredentials).not.toHaveBeenCalled();

    const reopened = captureAuthUrl();
    const retry = start(browser);
    const retryUrl = await reopened;
    await callback(retryUrl, { code: "fixture-code", state: retryUrl.searchParams.get("state")! });
    expect(await retry).toEqual({ success: true });
    expect(saveCredentials).toHaveBeenCalledTimes(1);
  }
});
