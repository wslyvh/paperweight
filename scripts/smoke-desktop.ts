import { emailToFileKey } from "../src/main/credentials";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import type { Page } from "playwright-core";
import { appPaths, encryptProfile, packaged, results, root, withDesktop } from "./lib/desktop-test";

async function captureStorageFlow(page: Page, name: string) {
  const directory = join(results, "storage-flows");
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`), animations: "disabled" });
}

async function main() {
  // Spaces and non-ASCII characters catch path/launcher mistakes on every OS.
  const directory = mkdtempSync(join(tmpdir(), "paperweight desktop ü-"));
  try {
    const fresh = join(directory, "fresh");
    mkdirSync(fresh);
    await withDesktop(fresh, "fresh-start", async (app) => {
      const page = await app.firstWindow();
      await page.waitForFunction(() => window.api && document.querySelector("#root")?.childElementCount);
      await page.getByRole("heading", { name: "Get Started", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.api.getConnectionStatus()), false);
      assert.equal(resolve(await app.evaluate(({ app }) => app.getPath("userData"))), resolve(fresh));
      assert.equal(await app.evaluate(({ app }) => app.isPackaged), packaged);
      await page.getByRole("button", { name: "Connect with Google", exact: true }).waitFor();
      // Test-only unavailable OS storage: force initialization before onboarding.
      await app.evaluate(({ safeStorage }) => { safeStorage.isAsyncEncryptionAvailable = async () => false; });
      unlinkSync(join(fresh, "database-key.enc"));
      await page.reload();
      await page.getByText("Secure storage unavailable", { exact: true }).waitFor();
      assert.equal(await page.locator(".bg-secondary").count(), 1);
      assert.equal(await page.getByRole("heading", { name: "Get Started", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Connect with Google", exact: true }).count(), 0);
      await captureStorageFlow(page, "01-secure-storage-unavailable");
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "Connect with Google", exact: true }).count(), 0);
      await app.evaluate(({ safeStorage }) => { safeStorage.isAsyncEncryptionAvailable = async () => true; });
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await page.getByRole("button", { name: "Connect with Google", exact: true }).waitFor();
      await captureStorageFlow(page, "02-onboarding-after-retry");
    });

    for (const kind of ["runtime", "stored"]) {
      const profile = join(directory, kind);
      if (kind === "stored") cpSync(join(root, "test/fixtures/smoke-account"), profile, { recursive: true });
      else execFileSync(process.execPath, ["--import", "tsx", join(root, "scripts/generate-smoke-fixture.ts"), profile], {
        cwd: root, env: { ...process.env, TSX_TSCONFIG_PATH: join(root, "tsconfig.node.json") }, stdio: "pipe",
      });
      const manifest = JSON.parse(readFileSync(join(profile, "manifest.json"), "utf8")) as { fileKey: string; email: string };
      await encryptProfile(profile, `${kind}-encrypt`, true, kind === "stored");
      const currentKey = emailToFileKey(manifest.email);
      let messageCount = 0;
      await withDesktop(profile, `${kind}-open`, async (app) => {
        const page = await app.firstWindow();
        await page.waitForFunction(() => window.api && document.querySelector("#root")?.childElementCount);
        await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
        const account = await page.evaluate(() => window.api.getAccountInfo());
        assert.equal(account.storageError, undefined, "Paperweight could not decrypt saved credentials");
        assert.equal(account.providerType, "imap");
        assert.ok(account.server?.imap, "Account metadata alone is insufficient: credentials must decrypt");
        assert.equal((await page.evaluate(() => window.api.getLicenseStatus())).active, true);
        messageCount = account.totalMessages;
        await page.evaluate(() => window.api.saveSettings({ colorTheme: "silk" }));
        await page.evaluate(() => window.api.startSync());
        // The synthetic mail host is unreachable, but reaching this error proves
        // the packaged worker loaded SQLite, decrypted credentials and the provider.
        await page.waitForFunction(async () => {
          const status = await window.api.getSyncStatus();
          return !status.running && status.error?.includes("Could not reach the mail server");
        }, undefined, { timeout: 30_000 });
        const info = await page.evaluate(() => window.api.getSupportInfo());
        // macOS can canonicalize /var to /private/var. Compare real paths,
        // and require the reported log to exist rather than just checking a string.
        const logPath = relative(realpathSync(profile), realpathSync(info.logPath));
        assert.ok(!isAbsolute(logPath) && !logPath.startsWith(".."), `Logs escaped the isolated app-data directory: ${info.logPath} (profile: ${profile})`);
        assert.match(readFileSync(info.logPath, "utf8"), /Settings saved: colorTheme/);
        const setup = await page.evaluate(() => window.api.getMcpSetup());
        assert.equal(setup.available, true, "MCP launcher is missing from the app layout");
        assert.ok(setup.server && existsSync(setup.server.command));
        if (kind === "runtime") {
          // Availability can change after startup. Retry the failed credential
          // read itself, without adding a second page-level storage preflight.
          await app.evaluate(({ safeStorage }) => { safeStorage.isAsyncEncryptionAvailable = async () => false; });
          await page.evaluate(() => { window.location.hash = "#/settings"; });
          await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
          await page.getByText("Secure storage unavailable", { exact: true }).waitFor();
          await page.getByRole("button", { name: "Retry", exact: true }).click();
          await page.getByText("Secure storage unavailable", { exact: true }).waitFor();
          await app.evaluate(({ safeStorage }) => { safeStorage.isAsyncEncryptionAvailable = async () => true; });
          await page.getByRole("button", { name: "Retry", exact: true }).click();
          await page.getByText("Secure storage unavailable", { exact: true }).waitFor({ state: "hidden" });
          assert.equal((await page.evaluate(() => window.api.getAccountInfo())).storageError, undefined);
        }
      });
      assert.ok(existsSync(join(profile, `${currentKey}.db`)));
      assert.ok(existsSync(join(profile, "global.db")));
      await withDesktop(profile, `${kind}-reopen`, async (app) => {
        const page = await app.firstWindow();
        await page.waitForFunction(() => Boolean(window.api));
        const account = await page.evaluate(() => window.api.getAccountInfo());
        assert.equal(account.storageError, undefined);
        assert.ok(account.server?.imap);
        assert.equal((await page.evaluate(() => window.api.getLicenseStatus())).active, true);
        assert.equal(account.totalMessages, messageCount, "Restart changed indexed message count");
        assert.equal(await page.evaluate(() => window.api.getSettings().colorTheme), "silk");
      });
      if (kind === "runtime") {
        writeFileSync(join(profile, "orphan.enc"), "synthetic orphan");
        writeFileSync(join(profile, "logs", "main.old.log"), "synthetic old log");
        await withDesktop(profile, "factory-reset-request", async (app) => {
          const page = await app.firstWindow();
          await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
          await page.evaluate(() => { window.location.hash = "#/settings"; });
          await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
          await page.getByRole("button", { name: "Configure", exact: true }).waitFor();
          await page.getByRole("button", { name: "Wipe All Data", exact: true }).click();
          await page.getByRole("heading", { name: "Wipe all data?", exact: true }).waitFor();
          await page.getByRole("button", { name: "Wipe everything", exact: true }).click();
          await page.getByRole("heading", { name: "Get Started", exact: true }).waitFor();
        });
        await withDesktop(profile, "factory-reset-reopen", async (app) => {
          const page = await app.firstWindow();
          await page.getByRole("heading", { name: "Get Started", exact: true }).waitFor();
          assert.equal(await page.evaluate(() => window.api.getConnectionStatus()), false);
          assert.equal((await page.evaluate(() => window.api.getLicenseStatus())).active, false);
          for (const file of ["accounts.json", "license.enc", "orphan.enc", `${currentKey}.db`, `${currentKey}.enc`, "logs/main.old.log", ".reset-requested"]) {
            assert.equal(existsSync(join(profile, file)), false, `Reset left ${file} behind`);
          }
          assert.doesNotMatch(readFileSync(join(profile, "logs/main.log"), "utf8"), /Settings saved: colorTheme/);
        });
      }
    }

    for (const failure of ["missing", "damaged"]) {
      const profile = join(directory, `key-${failure}`);
      cpSync(join(directory, "stored"), profile, { recursive: true });
      const keyPath = join(profile, "database-key.enc");
      const savedKey = readFileSync(keyPath);
      if (failure === "missing") unlinkSync(keyPath);
      else writeFileSync(keyPath, "damaged synthetic key");
      await withDesktop(profile, `key-${failure}-recovery`, async (app) => {
        const page = await app.firstWindow();
        await page.getByText("Couldn't unlock your data", { exact: true }).waitFor();
        assert.equal(await page.locator(".bg-secondary").count(), 1);
        await page.getByRole("button", { name: "Retry", exact: true }).click();
        await page.getByText("Couldn't unlock your data", { exact: true }).waitFor();
        if (failure === "damaged") {
          assert.equal(readFileSync(keyPath, "utf8"), "damaged synthetic key");
          writeFileSync(keyPath, savedKey);
          await page.getByRole("button", { name: "Retry", exact: true }).click();
          await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
          await captureStorageFlow(page, "06-dashboard-after-retry");
        } else {
          assert.equal(existsSync(keyPath), false);
          // Exercise the startup gate as well as onboarding's storage check.
          await app.evaluate(({ safeStorage }) => { safeStorage.isAsyncEncryptionAvailable = async () => false; });
          await page.reload();
          await page.getByText("Secure storage unavailable", { exact: true }).waitFor();
          assert.equal(await page.getByRole("button", { name: "Reset", exact: true }).count(), 0);
          await page.getByRole("button", { name: "Retry", exact: true }).click();
          await page.getByText("Secure storage unavailable", { exact: true }).waitFor();
          await app.evaluate(({ safeStorage }) => { safeStorage.isAsyncEncryptionAvailable = async () => true; });
          await page.getByRole("button", { name: "Retry", exact: true }).click();
          await page.getByText("Couldn't unlock your data", { exact: true }).waitFor();
          await captureStorageFlow(page, "03-data-unlock-failed");
          await page.getByRole("button", { name: "Reset", exact: true }).click();
          await page.getByRole("heading", { name: "Wipe all data?", exact: true }).waitFor();
          await captureStorageFlow(page, "04-reset-confirmation");
          await page.getByRole("button", { name: "Cancel", exact: true }).click();
          assert.equal(existsSync(keyPath), false);
          assert.ok(existsSync(join(profile, "accounts.json")));
          await page.getByRole("button", { name: "Reset", exact: true }).click();
          await page.getByRole("button", { name: "Wipe everything", exact: true }).click();
          await page.getByRole("heading", { name: "Get Started", exact: true }).waitFor();
          await page.getByRole("button", { name: "Connect with Google", exact: true }).waitFor();
          await captureStorageFlow(page, "05-onboarding-after-reset");
          assert.ok(existsSync(keyPath));
          assert.notDeepEqual(readFileSync(keyPath), savedKey);
          assert.equal(existsSync(join(profile, "global.db")), false);
        }
      });
    }

    const recovery = join(directory, "plaintext-recovery");
    cpSync(join(root, "test/fixtures/smoke-account"), recovery, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(recovery, "manifest.json"), "utf8")) as { fileKey: string; email: string };
    const registry = readFileSync(join(recovery, "accounts.json"));
    const recoveryDb = new Database(join(recovery, `${manifest.fileKey}.db`));
    try {
      recoveryDb.exec(`
        INSERT INTO vendors (id, root_domain, name, message_count) VALUES (1, 'example.test', 'Synthetic vendor', 1);
        INSERT INTO messages (id, vendor_id, sender_email, subject, date)
          VALUES ('preserved-message', 1, 'sender@example.test', 'Synthetic saved mail', 1000);
        INSERT OR REPLACE INTO settings (key, value) VALUES ('userName', 'Synthetic saved name');
      `);
    } finally {
      recoveryDb.close();
    }
    writeFileSync(join(recovery, "license.enc"), JSON.stringify({ key: "SYNTHETIC-OLD-LICENSE" }));
    await withDesktop(recovery, "plaintext-recovery", async (app) => {
      const page = await app.firstWindow();
      await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
      assert.equal(existsSync(join(recovery, `${manifest.fileKey}.enc`)), false);
      assert.equal(existsSync(join(recovery, `${emailToFileKey(manifest.email)}.enc`)), false);
      assert.equal(existsSync(join(recovery, "license.enc")), false);
      const accounts = await page.evaluate(() => window.api.listAccounts());
      assert.deepEqual(accounts.map(({ email, providerType }) => ({ email, providerType })),
        JSON.parse(registry.toString()).accounts.map(({ email, providerType }: { email: string; providerType: string }) => ({ email, providerType })));
      assert.equal(readFileSync(join(recovery, "accounts.json"), "utf8").includes("smoke-test@paperweight.test"), false);
      const account = await page.evaluate(() => window.api.getAccountInfo());
      assert.equal(account.providerType, "imap");
      assert.equal(account.credentialsMissing, true);
      assert.equal(account.totalMessages, 1, "Credential cleanup removed indexed mail");
      assert.equal(await page.evaluate(() => window.api.getSettings().userName), "Synthetic saved name");
      assert.match(account.storageError ?? "", /Reconnect this account/);
      await page.getByText("Reconnect your account", { exact: true }).waitFor();
      assert.equal(await page.getByText("Secure storage unavailable", { exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Retry", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Storage help", exact: true }).count(), 0);
      await page.getByRole("button", { name: "Reconnect", exact: true }).click();
      await page.getByRole("heading", { name: "Server Settings", exact: true }).waitFor();
      assert.equal(await page.locator('input[type="password"]').getAttribute("required"), "");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.evaluate(() => { window.location.hash = "#/dashboard"; });
      await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
    });
    assert.ok(existsSync(join(appPaths().resources, "companies.db")));
    assert.ok(existsSync(join(appPaths().resources, "breaches.db")));
    console.info(`Desktop integration passed (${process.platform}/${process.arch}, packaged=${packaged})`);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Desktop integration failed");
  process.exitCode = 1;
});
