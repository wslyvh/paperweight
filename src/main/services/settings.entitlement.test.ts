import { vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let mockUserData = vi.hoisted(() => (""));
const mockFetch = vi.hoisted(() => (vi.fn()));
vi.mock("electron", () => ({
  app: { getPath: () => mockUserData },
  safeStorage: {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value: string) => Buffer.from(value),
    decryptStringAsync: async (value: Buffer) => ({ result: value.toString(), shouldReEncrypt: false }),
  },
  net: { fetch: mockFetch },
}));
vi.mock("../utils/log", () => ({
  licenseLog: { info: vi.fn(), error: vi.fn() },
}));
import { activateLicense, deleteLicense, getLicenseStatus, hasValidLicense, requirePro } from "./settings";

beforeEach(() => {
  mockUserData = mkdtempSync(join(tmpdir(), "paperweight-entitlement-"));
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(mockUserData, { recursive: true, force: true });
});

function seedLicense(expiresAt?: string, validatedAt = Date.now()) {
  writeFileSync(join(mockUserData, "license.enc"), JSON.stringify({
    key: "TEST-ONLY", tier: "test", validatedAt, expiresAt,
  }));
}

it("blocks Free and expired licenses, and observes deactivation without a restart", async () => {
  await expect(requirePro()).rejects.toThrow("Paperweight Pro is required");
  seedLicense();
  await expect(requirePro()).resolves.toBeUndefined();
  deleteLicense();
  await expect(requirePro()).rejects.toThrow("Paperweight Pro is required");
  seedLicense(new Date(Date.now() - 1000).toISOString());
  await expect(requirePro()).rejects.toThrow("Paperweight Pro is required");
  expect(mockFetch).not.toHaveBeenCalled();
});

it("keeps cached validation and offline behavior, and drops remotely revoked licenses", async () => {
  seedLicense();
  await expect(hasValidLicense()).resolves.toBe(true);
  expect(mockFetch).not.toHaveBeenCalled();
  seedLicense(undefined, Date.now() - 4 * 86_400_000);
  mockFetch.mockRejectedValueOnce(new Error("Offline"));
  await expect(hasValidLicense()).resolves.toBe(true);
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: false }) });
  await expect(hasValidLicense()).resolves.toBe(false);
  expect((await getLicenseStatus()).active).toBe(false);
});

it("does not restore a removed license or overwrite a replacement from a stale validation", async () => {
  for (const replace of [false, true]) {
    seedLicense(undefined, Date.now() - 4 * 86_400_000);
    const response = Promise.withResolvers<{ ok: boolean; json: () => Promise<{ valid: boolean; tier: string }> }>();
    const started = Promise.withResolvers<void>();
    mockFetch.mockImplementationOnce(() => {
      started.resolve();
      return response.promise;
    });
    const pending = hasValidLicense();
    await started.promise;
    deleteLicense();
    if (replace) {
      writeFileSync(join(mockUserData, "license.enc"), JSON.stringify({
        key: "REPLACEMENT", tier: "test", validatedAt: Date.now(),
      }));
    }
    response.resolve({ ok: true, json: async () => ({ valid: true, tier: "test" }) });
    await expect(pending).resolves.toBe(replace);
    expect((await getLicenseStatus()).key).toBe(replace ? "REPLACEMENT" : undefined);
  }
});

it("falls back to local entitlement when remote validation stalls", async () => {
  vi.useFakeTimers();
  seedLicense(undefined, Date.now() - 4 * 86_400_000);
  mockFetch.mockImplementationOnce(() => new Promise(() => undefined));
  const pending = hasValidLicense();
  await vi.advanceTimersByTimeAsync(8_000);
  await expect(pending).resolves.toBe(true);
  expect((await getLicenseStatus()).active).toBe(true);
  vi.useRealTimers();
});

it("times out if the validation response body stalls", async () => {
  vi.useFakeTimers();
  seedLicense(undefined, Date.now() - 4 * 86_400_000);
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => new Promise(() => undefined),
    text: () => new Promise(() => undefined),
  });
  const pending = hasValidLicense();
  await vi.advanceTimersByTimeAsync(8_000);
  await expect(pending).resolves.toBe(true);
  expect((await getLicenseStatus()).active).toBe(true);
  vi.useRealTimers();
});

it.each(["pro", "annual", "cleanup", "lifetime", "test"])("preserves full Pro access and expiry for %s keys", async (tier) => {
  vi.useFakeTimers();
  const expiresAt = new Date(Date.now() + 1000).toISOString();
  writeFileSync(join(mockUserData, "license.enc"), JSON.stringify({
    key: "TEST-ONLY", tier, expiresAt, validatedAt: Date.now(),
  }));
  expect(await getLicenseStatus()).toMatchObject({ active: true, tier: tier === "annual" || tier === "test" ? "pro" : tier, expiresAt });
  await expect(requirePro()).resolves.toBeUndefined();
  vi.advanceTimersByTime(1000);
  await expect(requirePro()).rejects.toThrow("Paperweight Pro is required");
});


it("rejects a successful validation response without a tier", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true }) });
  await expect(activateLicense("MISSING-TIER")).rejects.toThrow("Invalid license response");
  expect((await getLicenseStatus()).active).toBe(false);
});

it("refreshes a renewed key when its cached expiry is reached", async () => {
  vi.useFakeTimers();
  const now = Date.now();
  const expiresAt = new Date(now + 365 * 86400000).toISOString();
  writeFileSync(join(mockUserData, "license.enc"), JSON.stringify({
    key: "RENEWAL-TEST", tier: "pro", validatedAt: now,
    expiresAt: new Date(now + 1000).toISOString(),
  }));
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true, tier: "pro", expiresAt }) });
  vi.advanceTimersByTime(1000);
  await expect(hasValidLicense()).resolves.toBe(true);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(await getLicenseStatus()).toMatchObject({ active: true, expiresAt });
});


it.each([
  { valid: true, tier: "unknown" },
  { valid: true, tier: "cleanup" },
  { valid: true, tier: "pro", expiresAt: "invalid" },
  { valid: "true", tier: "lifetime" },
])("rejects malformed activation responses without replacing a saved key: %j", async (response) => {
  seedLicense();
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => response });
  await expect(activateLicense("MALFORMED")).rejects.toThrow("Invalid license response");
  expect(await getLicenseStatus()).toMatchObject({ active: true, key: "TEST-ONLY" });
});

it("does not remove a saved expiry when refresh omits the tier", async () => {
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  seedLicense(expiresAt, Date.now() - 4 * 86400000);
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true }) });
  await expect(hasValidLicense()).resolves.toBe(true);
  expect(await getLicenseStatus()).toMatchObject({ active: true, expiresAt });
});

it("keeps an expired license inactive when renewal cannot be checked offline", async () => {
  seedLicense(new Date(Date.now() - 1000).toISOString());
  mockFetch.mockRejectedValueOnce(new Error("Offline"));
  await expect(hasValidLicense()).resolves.toBe(false);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(await getLicenseStatus()).toMatchObject({ active: false, key: "TEST-ONLY" });
});

it.each(["pro", "cleanup", "lifetime", "annual", "test"])("activates an explicitly identified %s license", async (tier) => {
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true, tier, expiresAt }) });
  await expect(activateLicense("EXPLICIT-TIER")).resolves.toMatchObject({
    active: true, tier: tier === "annual" || tier === "test" ? "pro" : tier, expiresAt,
  });
});


it("accepts non-expiring Pro responses used by subscriptions", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true, tier: "pro" }) });
  await expect(activateLicense("SUBSCRIPTION")).resolves.toMatchObject({ active: true, tier: "pro" });
  expect((await getLicenseStatus()).expiresAt).toBeUndefined();
});


it("revalidates after 24 hours without calling the API on every startup or refresh", async () => {
  vi.useFakeTimers();
  seedLicense();
  vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1);
  await expect(hasValidLicense()).resolves.toBe(true);
  expect(mockFetch).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true, tier: "pro" }) });
  await expect(hasValidLicense()).resolves.toBe(true);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  await expect(hasValidLicense()).resolves.toBe(true);
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it.each([429, 500, 502, 503])("keeps a saved license during an HTTP %s service failure", async (status) => {
  seedLicense(undefined, Date.now() - 2 * 86400000);
  mockFetch.mockResolvedValueOnce({ ok: false, status, text: async () => JSON.stringify({ valid: false, error: "Service unavailable" }) });
  await expect(hasValidLicense()).resolves.toBe(true);
  expect(await getLicenseStatus()).toMatchObject({ active: true, key: "TEST-ONLY" });
});
