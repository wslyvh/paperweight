import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import { appPaths, encryptProfile, packaged, root, withDesktop } from "./lib/desktop-test";

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
      // Test-only unavailable OS storage: block onboarding before provider auth.
      await app.evaluate(({ safeStorage }) => { safeStorage.isAsyncEncryptionAvailable = async () => false; });
      await page.reload();
      await page.getByText("Secure storage unavailable", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Connect with Google", exact: true }).count(), 0);
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "Connect with Google", exact: true }).count(), 0);
      await app.evaluate(({ safeStorage }) => { safeStorage.isAsyncEncryptionAvailable = async () => true; });
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await page.getByRole("button", { name: "Connect with Google", exact: true }).waitFor();
    });

    for (const kind of ["runtime", "stored"]) {
      const profile = join(directory, kind);
      if (kind === "stored") cpSync(join(root, "test/fixtures/smoke-account"), profile, { recursive: true });
      else execFileSync(process.execPath, ["--import", "tsx", join(root, "scripts/generate-smoke-fixture.ts"), profile], {
        cwd: root, env: { ...process.env, TSX_TSCONFIG_PATH: join(root, "tsconfig.node.json") }, stdio: "pipe",
      });
      const manifest = JSON.parse(readFileSync(join(profile, "manifest.json"), "utf8")) as { fileKey: string };
      await encryptProfile(profile, `${kind}-encrypt`, true, kind === "stored");
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
        const logPath = relative(profile, info.logPath);
        assert.ok(!isAbsolute(logPath) && !logPath.startsWith(".."), "Logs escaped the isolated app-data directory");
        const setup = await page.evaluate(() => window.api.getMcpSetup());
        assert.equal(setup.available, true, "MCP launcher is missing from the app layout");
        assert.ok(setup.server && existsSync(setup.server.command));
      });
      assert.ok(existsSync(join(profile, `${manifest.fileKey}.db`)));
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
    }

    const recovery = join(directory, "plaintext-recovery");
    cpSync(join(root, "test/fixtures/smoke-account"), recovery, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(recovery, "manifest.json"), "utf8")) as { fileKey: string };
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
      assert.equal(existsSync(join(recovery, "license.enc")), false);
      assert.deepEqual(readFileSync(join(recovery, "accounts.json")), registry);
      const account = await page.evaluate(() => window.api.getAccountInfo());
      assert.equal(account.providerType, "imap");
      assert.equal(account.credentialsMissing, true);
      assert.equal(account.totalMessages, 1, "Credential cleanup removed indexed mail");
      assert.equal(await page.evaluate(() => window.api.getSettings().userName), "Synthetic saved name");
      assert.match(account.storageError ?? "", /Reconnect this account/);
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
