import { vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

let userDataDir = vi.hoisted(() => (""));

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "userData" ? userDataDir : "/tmp"),
  },
}));

vi.mock("./credentials", () => ({
  emailToFileKey: vi.fn(() => "account"),
}));
vi.mock("./utils/log", () => {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { dbLog: log, syncLog: log, appLog: log };
});

import {
  createAccountDb,
  deleteDbFiles,
  getDb,
  initDb,
  wipeDatabase,
} from "./db";
import { resetGlobalDb } from "./globalDb";

describe("account database global attachment", () => {
  it("uses a busy timeout and attaches the global schema", () => {
    const userData = mkdtempSync(join(tmpdir(), "paperweight-global-attach-"));
    const accountPath = join(userData, "account.db");

    initDb(accountPath, "/nonexistent", "/nonexistent");
    createAccountDb(accountPath);
    const target = getDb();
    expect(target.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(
      target
        .prepare(
          `SELECT 1 FROM global.sqlite_master
           WHERE type = 'table' AND name = 'pii_suppressions'`,
        )
        .get(),
    ).toBeDefined();

    wipeDatabase();
    expect(() => getDb()).toThrow();
    expect(existsSync(accountPath)).toBe(false);

    // Explicit account creation still works after a reset in the same process.
    createAccountDb(accountPath);
    expect(getDb().prepare("SELECT COUNT(*) AS count FROM messages").get()).toEqual({ count: 0 });
    wipeDatabase();
    resetGlobalDb();
    rmSync(userData, { recursive: true, force: true });
  });

  it("surfaces account database deletion failures", () => {
    userDataDir = mkdtempSync(join(tmpdir(), "paperweight-delete-failure-"));
    mkdirSync(join(userDataDir, "account.db"));

    expect(() => deleteDbFiles("user@example.com")).toThrow(
      "Could not delete local database files",
    );

    rmSync(userDataDir, { recursive: true, force: true });
  });
});
