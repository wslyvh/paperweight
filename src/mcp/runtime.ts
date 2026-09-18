import { existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import {
  configureAccountRegistryPath,
  emailToFileKey,
  listAccounts,
} from "../main/credentials";
import type { AccountEntry } from "../main/credentials";
import {
  getDb,
  initDb,
  reconnectDb,
  withAccountDbReadConnection,
} from "../main/db";
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
let activeMailboxActions = 0;

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

export function hasWriteAccess(): boolean {
  return getGlobalSetting("agentAccess") === "actions";
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

export function writeAccessError() {
  return {
    content: [{
      type: "text" as const,
      text: "Read & write AI Agent access is required. Change Access in Paperweight Settings.",
    }],
    isError: true,
  };
}

export function getSelectedMailbox(): string {
  return emailToFileKey(getRuntime().selectedMailbox);
}

export function getSelectedMailboxEmail(): string {
  return getRuntime().selectedMailbox;
}

export function requireSelectedMailbox(mailbox: string): string {
  const selectedMailbox = getSelectedMailbox();
  if (mailbox !== selectedMailbox) {
    throw new Error(
      `This action belongs to ${mailbox}, but the selected mailbox is ${selectedMailbox}.`,
    );
  }
  return selectedMailbox;
}

/**
 * Keep async provider work bound to the mailbox it started on. The account
 * database connection is process-global, so reconnecting it mid-action could
 * otherwise apply the final local write to another mailbox.
 */
export async function withSelectedMailboxAction<T>(
  action: (email: string) => Promise<T>,
): Promise<T> {
  const email = getSelectedMailboxEmail();
  activeMailboxActions += 1;
  try {
    return await action(email);
  } finally {
    activeMailboxActions -= 1;
  }
}

export function getAppActiveMailbox(): string | undefined {
  const email = getGlobalSetting("activeAccount");
  return email ? emailToFileKey(email) : undefined;
}

export function getMailboxes(): AccountEntry[] {
  return listAccounts();
}

export function findMailbox(mailbox: string): AccountEntry | undefined {
  return listAccounts().find((account) => emailToFileKey(account.email) === mailbox);
}

export function isMailboxAvailable(email: string): boolean {
  const current = getRuntime();
  return existsSync(accountDbPath(current.paths, email));
}

export function selectMailbox(mailbox: string): boolean {
  const current = getRuntime();
  const account = findMailbox(mailbox);
  if (!account) throw new Error("That mailbox is not registered in Paperweight.");
  const email = account.email;
  if (current.selectedMailbox === email) return false;
  if (activeMailboxActions > 0) {
    throw new Error("Wait for the current mailbox action to finish before switching mailboxes.");
  }
  try {
    reconnectDb(accountDbPath(current.paths, email));
  } catch (error) {
    reconnectDb(accountDbPath(current.paths, current.selectedMailbox));
    throw error;
  }
  current.selectedMailbox = email;
  return true;
}

export function readMailboxDatabase<T>(
  email: string,
  read: (database: ReturnType<typeof getDb>) => T,
): T {
  const current = getRuntime();
  return withAccountDbReadConnection(accountDbPath(current.paths, email), read);
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

  const activeEmail = getGlobalSetting("activeAccount");
  if (!activeEmail) {
    throw new McpStartupError("No active Paperweight account is available.");
  }

  const account = listAccounts().find(
    (item) => item.email.toLowerCase() === activeEmail.toLowerCase(),
  );
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
  getDb();
  runtime = { paths, selectedMailbox: account.email };
}
