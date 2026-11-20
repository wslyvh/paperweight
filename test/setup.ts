import { vi } from "vitest";

vi.mock("electron", () => ({}));

// Preserve lazy Electron loading in production while using each suite's
// ordinary Electron mock for the main-process boundary.
vi.mock("../src/main/electronRuntime", async () => {
  const electron = await import("electron");
  return { getElectron: () => electron };
});

// Domain tests exercise ordinary SQLite. Encryption and OS-key tests explicitly
// unmock this boundary; production never falls back to plaintext databases.
vi.mock("../src/main/databaseEncryption", async () => {
  const { default: Database } = await import("better-sqlite3");
  return {
    openDatabase: (path: string, options?: import("better-sqlite3").Options) => new Database(path, options),
    attachDatabase: (database: import("better-sqlite3").Database, path: string, schema: string) => {
      database.prepare(`ATTACH DATABASE ? AS ${schema}`).run(path);
    },
    getDatabaseKey: vi.fn(),
    setDatabaseKey: vi.fn(),
    initializeDatabaseEncryption: vi.fn(),
    encryptAccountRegistry: (value: string) => value,
    decryptAccountRegistry: (value: string) => value,
  };
});
