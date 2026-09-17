import { existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import {
  configureAccountRegistryPath,
  emailToFileKey,
  listAccounts,
} from "../main/credentials";
import type { AccountEntry } from "../main/credentials";
import { initDb, reconnectDb } from "../main/db";
import { configureGlobalDbPath } from "../main/globalDb";
import { getGlobalSetting } from "../main/services/globalSettings";

interface McpPaths {
  userData: string;
  resources: string;
}

interface McpRuntime {
  paths: McpPaths;
  selectedMailbox: string;
}

let runtime: McpRuntime | undefined;

export class McpStartupError extends Error {}

function defaultUserDataPath(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "paperweight");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (!appData) throw new McpStartupError("Could not locate Paperweight data.");
    return join(appData, "paperweight");
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "paperweight");
}

function resolvePaths(): McpPaths {
  const userData = resolve(
    process.env.PAPERWEIGHT_USER_DATA
      ?? process.env.PAPERWEIGHT_SEED
      ?? defaultUserDataPath(),
  );
  const packagedResources = process.resourcesPath;
  const developmentResources = resolve(__dirname, "../../resources");
  const resources = process.env.PAPERWEIGHT_RESOURCES_DIR
    ? resolve(process.env.PAPERWEIGHT_RESOURCES_DIR)
    : existsSync(join(packagedResources, "companies.db"))
      ? packagedResources
      : developmentResources;
  return { userData, resources };
}

function getRuntime(): McpRuntime {
  if (!runtime) throw new Error("Paperweight MCP is not initialized.");
  return runtime;
}

function accountDbPath(paths: McpPaths, email: string): string {
  return join(paths.userData, `${emailToFileKey(email)}.db`);
}

export function hasReadAccess(): boolean {
  const access = getGlobalSetting("agentAccess") ?? "off";
  return access === "read" || access === "actions";
}

export function readAccessError() {
  return {
    content: [{
      type: "text" as const,
      text: "AI Agent access is off. Enable it in Paperweight Settings.",
    }],
    isError: true,
  };
}

export function getSelectedMailbox(): string {
  return getRuntime().selectedMailbox;
}

export function getAppActiveMailbox(): string | undefined {
  return getGlobalSetting("activeAccount");
}

export function getMailboxes(): AccountEntry[] {
  return listAccounts();
}

export function findMailbox(email: string): AccountEntry | undefined {
  const normalizedEmail = email.toLowerCase();
  return listAccounts().find((account) => account.email.toLowerCase() === normalizedEmail);
}

export function isMailboxAvailable(email: string): boolean {
  const current = getRuntime();
  return existsSync(accountDbPath(current.paths, email));
}

export function selectMailbox(email: string): boolean {
  const current = getRuntime();
  if (current.selectedMailbox === email) return false;
  try {
    reconnectDb(accountDbPath(current.paths, email));
  } catch (error) {
    reconnectDb(accountDbPath(current.paths, current.selectedMailbox));
    throw error;
  }
  current.selectedMailbox = email;
  return true;
}

export function withMailboxDatabase<T>(email: string, read: () => T): T {
  const current = getRuntime();
  if (email === current.selectedMailbox) return read();
  try {
    reconnectDb(accountDbPath(current.paths, email));
    return read();
  } finally {
    reconnectDb(accountDbPath(current.paths, current.selectedMailbox));
  }
}

export function initializePaperweight(): void {
  const paths = resolvePaths();
  configureGlobalDbPath(join(paths.userData, "global.db"));
  configureAccountRegistryPath(join(paths.userData, "accounts.json"));

  if (!hasReadAccess()) {
    throw new McpStartupError(
      "AI Agent access is off. Enable it in Paperweight Settings.",
    );
  }

  const activeEmail = getAppActiveMailbox();
  if (!activeEmail) {
    throw new McpStartupError("No active Paperweight account is available.");
  }

  const account = findMailbox(activeEmail);
  if (!account) {
    throw new McpStartupError("The active Paperweight mailbox is not registered.");
  }

  const databasePath = accountDbPath(paths, account.email);
  if (!existsSync(databasePath)) {
    throw new McpStartupError("The active Paperweight mailbox data is unavailable.");
  }

  initDb(
    databasePath,
    join(paths.resources, "companies.db"),
    join(paths.resources, "breaches.db"),
    join(paths.resources, "enforcement.db"),
  );
  runtime = { paths, selectedMailbox: account.email };
}
