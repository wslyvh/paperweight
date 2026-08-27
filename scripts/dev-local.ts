import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync, spawn } from "child_process";

const root = process.cwd();
const userDataDir = join(tmpdir(), "paperweight-local");
mkdirSync(userDataDir, { recursive: true });

execFileSync("yarn", ["seed:test-account", userDataDir], {
  cwd: root,
  stdio: "inherit",
});

const child = spawn("yarn", ["exec", "electron-vite", "dev"], {
  cwd: root,
  env: {
    ...process.env,
    PAPERWEIGHT_SEED: userDataDir,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
