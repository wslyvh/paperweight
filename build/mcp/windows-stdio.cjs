// Run with Electron's bundled Node runtime. The Electron app retains keychain
// access; this process owns stdio because Electron replaces stdin on Windows.
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { randomUUID } = require("node:crypto");

const pipe = `\\\\.\\pipe\\paperweight-mcp-${randomUUID()}`;
let child;
let connection;
let stopping = false;
const server = createServer((socket) => {
  if (connection) { socket.destroy(); return; }
  connection = socket;
  clearTimeout(startupTimeout);
  process.stdin.pipe(socket);
  socket.pipe(process.stdout);
  socket.on("error", () => stop(1));
  socket.on("end", () => process.stdin.pause());
});

function stop(code) {
  if (stopping) return;
  stopping = true;
  clearTimeout(startupTimeout);
  process.stdin.pause();
  connection?.destroy();
  server.close();
  child?.kill();
  process.exitCode = code;
}

const startupTimeout = setTimeout(() => {
  process.stderr.write("paperweight-mcp: Startup timed out.\n");
  stop(1);
}, 30_000);
server.on("error", () => stop(1));
process.stdin.on("error", () => stop(1));
process.stdout.on("error", () => stop(1));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
server.listen(pipe, () => {
  const env = { ...process.env, PAPERWEIGHT_MCP: "1", PAPERWEIGHT_MCP_PIPE: pipe };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(process.execPath, process.argv.slice(2), {
    env,
    stdio: ["ignore", "ignore", "inherit"],
    windowsHide: true,
  });
  child.on("error", () => stop(1));
  child.on("exit", (code) => stop(code ?? 1));
});
