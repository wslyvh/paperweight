import { McpStartupError, runMcpServer } from "./server";

process.env.PAPERWEIGHT_MCP = "1";

void runMcpServer().catch((error: unknown) => {
  const message = error instanceof McpStartupError
    ? error.message
    : "Could not start. Check Paperweight data and settings.";
  process.stderr.write(`paperweight-mcp: ${message}\n`);
  process.exitCode = 1;
});
