import { STORAGE_SAVE_ERROR, STORAGE_READ_ERROR } from "../shared/secureStorage";
import { vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mockStorage = vi.hoisted(() => ({
  isAsyncEncryptionAvailable: vi.fn(async () => true),
  encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`test-cipher:${value}`)),
  decryptStringAsync: vi.fn(async (value: Buffer) => {
    if (!value.toString().startsWith("test-cipher:")) throw new Error("Not encrypted");
    return { result: value.toString().slice(12), shouldReEncrypt: false };
  }),
}));
vi.mock("electron", () => ({ safeStorage: mockStorage }));
import { readSecureFile, writeSecureFile, removeLegacyPlaintextFile } from "./secureStorage";

let directory: string;
let file: string;
beforeEach(() => {
  vi.clearAllMocks();
  directory = mkdtempSync(join(tmpdir(), "paperweight-storage-"));
  file = join(directory, "credentials.enc");
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

it("persists only the encryption result and reads through the async decryptor", async () => {
  await writeSecureFile(file, { token: "synthetic" });
  expect(readFileSync(file, "utf8")).toBe('test-cipher:{"token":"synthetic"}');
  await expect(readSecureFile(file)).resolves.toEqual({ token: "synthetic" });
});

it("does not create a plaintext file when encryption is unavailable", async () => {
  mockStorage.isAsyncEncryptionAvailable.mockResolvedValueOnce(false);
  await expect(writeSecureFile(file, { token: "synthetic" })).rejects.toThrow(STORAGE_SAVE_ERROR);
  expect(existsSync(file)).toBe(false);
  expect(mockStorage.encryptStringAsync).not.toHaveBeenCalled();
});

it("preserves the previous file and redacts encryption failures", async () => {
  writeFileSync(file, "previous encrypted bytes");
  mockStorage.encryptStringAsync.mockRejectedValueOnce(new Error("synthetic-secret-input"));
  await expect(writeSecureFile(file, { token: "synthetic" })).rejects.not.toThrow("synthetic-secret-input");
  expect(readFileSync(file, "utf8")).toBe("previous encrypted bytes");
});

it("rejects legacy JSON instead of falling back to plaintext", async () => {
  const legacy = '{"token":"synthetic"}';
  writeFileSync(file, legacy);
  await expect(readSecureFile(file)).rejects.toThrow(STORAGE_READ_ERROR);
  expect(readFileSync(file, "utf8")).toBe(legacy);
});

it("reports persistence failure instead of treating encryption alone as success", async () => {
  const missingParent = join(directory, "missing", "credentials.enc");
  await expect(writeSecureFile(missingParent, { token: "synthetic" })).rejects.toThrow(STORAGE_SAVE_ERROR);
  expect(mockStorage.encryptStringAsync).toHaveBeenCalled();
  expect(existsSync(missingParent)).toBe(false);
});

it("does not mistake unavailable storage for a missing credential", async () => {
  writeFileSync(file, "encrypted");
  mockStorage.isAsyncEncryptionAvailable.mockResolvedValueOnce(false);
  await expect(readSecureFile(file)).rejects.toThrow(STORAGE_READ_ERROR);
});

it("re-encrypts when Electron requests key rotation", async () => {
  writeFileSync(file, "old ciphertext");
  mockStorage.decryptStringAsync.mockResolvedValueOnce({ result: '{"token":"synthetic"}', shouldReEncrypt: true });
  await expect(readSecureFile(file)).resolves.toEqual({ token: "synthetic" });
  expect(mockStorage.encryptStringAsync).toHaveBeenCalledWith('{"token":"synthetic"}');
  expect(readFileSync(file, "utf8")).toBe('test-cipher:{"token":"synthetic"}');
});

it.each(["deleted", "replaced"])("does not overwrite a file %s during re-encryption", async (change) => {
  writeFileSync(file, "old ciphertext");
  mockStorage.decryptStringAsync.mockResolvedValueOnce({ result: '{"token":"synthetic"}', shouldReEncrypt: true });
  const started = Promise.withResolvers<void>();
  const encrypted = Promise.withResolvers<Buffer<ArrayBuffer>>();
  mockStorage.encryptStringAsync.mockImplementationOnce(() => {
    started.resolve();
    return encrypted.promise;
  });

  const reading = readSecureFile(file);
  await started.promise;
  if (change === "deleted") rmSync(file);
  else writeFileSync(file, "newer ciphertext");
  encrypted.resolve(Buffer.from("rotated old ciphertext"));

  await expect(reading).resolves.toEqual({ token: "synthetic" });
  if (change === "deleted") expect(existsSync(file)).toBe(false);
  else expect(readFileSync(file, "utf8")).toBe("newer ciphertext");
});

it("returns undefined only for a missing file without accessing storage", async () => {
  await expect(readSecureFile(file)).resolves.toBeUndefined();
  expect(mockStorage.isAsyncEncryptionAvailable).not.toHaveBeenCalled();
});

it.each([
  { providerType: "imap", imap: { password: "synthetic" } },
  { providerType: "gmail", gmail: { accessToken: "synthetic" } },
  { providerType: "microsoft", microsoft: { accessToken: "synthetic" } },
])("removes recognized legacy credentials without accessing the keyring: $providerType", (credentials) => {
  writeFileSync(file, JSON.stringify(credentials));
  removeLegacyPlaintextFile(file, "credentials");
  expect(existsSync(file)).toBe(false);
  expect(mockStorage.isAsyncEncryptionAvailable).not.toHaveBeenCalled();
});

it("removes a plaintext license without touching other app data", () => {
  const database = join(directory, "mail.db");
  const registry = join(directory, "accounts.json");
  writeFileSync(database, "indexed mail");
  writeFileSync(registry, '{"accounts":[]}');
  writeFileSync(file, '{"key":"synthetic-license"}');
  removeLegacyPlaintextFile(file, "license");
  expect(existsSync(file)).toBe(false);
  expect(readFileSync(database, "utf8")).toBe("indexed mail");
  expect(readFileSync(registry, "utf8")).toBe('{"accounts":[]}');
});

it.each(["encrypted bytes", "{broken json", '{"unrelated":true}', "null"])("leaves encrypted or unrecognized data untouched: %s", (bytes) => {
  writeFileSync(file, bytes);
  removeLegacyPlaintextFile(file, "credentials");
  removeLegacyPlaintextFile(file, "license");
  expect(readFileSync(file, "utf8")).toBe(bytes);
  expect(mockStorage.decryptStringAsync).not.toHaveBeenCalled();
});
