import { _electron, type ElectronApplication } from "playwright-core";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const root = resolve(__dirname, "../..");
export const results = join(root, "dist", "test-results");
export const packaged = process.argv.includes("--packaged");

export function appPaths() {
  if (!packaged) return { executable: require("electron") as string, resources: join(root, "resources") };
  if (process.platform === "darwin") {
    const contents = join(root, "dist", process.arch === "arm64" ? "mac-arm64" : "mac", "Paperweight.app", "Contents");
    return { executable: join(contents, "MacOS", "Paperweight"), resources: join(contents, "Resources") };
  }
  const directory = join(root, "dist", process.platform === "win32" ? "win-unpacked" : "linux-unpacked");
  return {
    executable: join(directory, process.platform === "win32" ? "Paperweight.exe" : "paperweight"),
    resources: join(directory, "resources"),
  };
}

export function electronArgs() {
  return [
    "--disable-gpu", "--disable-gpu-shader-disk-cache",
    ...(process.platform === "linux" ? ["--no-sandbox", "--ozone-platform=x11", "--password-store=gnome-libsecret"] : []),
  ];
}

export function desktopEnv(profile: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, PAPERWEIGHT_SEED: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.PAPERWEIGHT_MCP;
  delete env.PAPERWEIGHT_USER_DATA;
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

export async function withDesktop(profile: string, label: string, check: (app: ElectronApplication) => Promise<void>) {
  mkdirSync(results, { recursive: true });
  const app = await _electron.launch({
    executablePath: appPaths().executable,
    args: [...electronArgs(), ...(packaged ? [] : [root])],
    cwd: root,
    env: desktopEnv(profile),
    timeout: 30_000,
  });
  let output = "";
  app.process().stdout?.on("data", (chunk) => { output += String(chunk); });
  app.process().stderr?.on("data", (chunk) => { output += String(chunk); });
  const errors: string[] = [];
  app.on("window", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check(app),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out; check the OS keychain/session and app logs`)), 60_000);
      }),
    ]);
    if (errors.length) throw new Error(`Renderer errors: ${errors.join("; ")}`);
    console.info(`PASS ${label}`);
  } catch (error) {
    const page = app.windows()[0];
    if (page) await page.screenshot({ path: join(results, `${label}.png`) }).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout);
    try {
      await app.close();
    } finally {
      writeFileSync(join(results, `${label}.log`), output);
      const appLog = join(profile, "logs", "main.log");
      if (existsSync(appLog)) copyFileSync(appLog, join(results, `${label}-main.log`));
    }
  }
}

// Fixture preparation runs in the real app executable, using the production
// storage helper. This preserves app identity/keychain access across restarts.
// The source helper is loaded only by the test driver, never shipped in the app.
export async function encryptProfile(profile: string, label: string, license = false, legacy = false) {
  const values = readdirSync(profile).filter((name) => name.endsWith(".enc")).map((name) => ({
    name, value: JSON.parse(readFileSync(join(profile, name), "utf8")) as unknown,
  }));
  if (license) values.push({ name: "license.enc", value: { key: "MCP-SMOKE-TEST", tier: "test", validatedAt: Date.now() } });
  await withDesktop(profile, label, async (app) => {
    await app.firstWindow();
    await app.evaluate(async ({ app, safeStorage }, input) => {
      const require = process.getBuiltinModule("module").createRequire(input.helper);
      if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error("OS secure storage is unavailable");
      if (process.platform === "linux" && safeStorage.getSelectedStorageBackend() !== "gnome_libsecret") {
        throw new Error("Linux integration test requires the real GNOME keyring backend");
      }
      require(input.tsx);
      const { writeSecureFile } = require(input.helper);
      const { join } = require("node:path");
      for (const entry of input.values) {
        const path = join(app.getPath("userData"), entry.name);
        if (input.legacy) {
          // Test-only: reproduce the previous app's ciphertext, never a production fallback.
          if (!safeStorage.isEncryptionAvailable()) throw new Error("Legacy fixture encryption unavailable");
          require("node:fs").writeFileSync(path, safeStorage.encryptString(JSON.stringify(entry.value)));
        } else {
          await writeSecureFile(path, entry.value);
        }
      }
    }, { tsx: require.resolve("tsx/cjs"), helper: join(root, "src/main/secureStorage.ts"), values, legacy });
  });
  for (const { name, value } of values) {
    if (readFileSync(join(profile, name)).includes(Buffer.from(JSON.stringify(value)))) {
      throw new Error(`Fixture was not encrypted: ${name}`);
    }
  }
}
