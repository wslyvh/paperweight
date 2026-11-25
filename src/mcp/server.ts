import { McpServer } from "@modelcontextprotocol/server";
import { connect } from "node:net";
import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { bindApprovalServer } from "./elicitation";
import { hasWriteAccess, initializePaperweight } from "./runtime";
import { registerActivityTools } from "./tools/activity";
import { registerCaseTools } from "./tools/cases";
import { registerCompanyTools } from "./tools/companies";
import { registerMailboxTools } from "./tools/mailboxes";
import { registerPersonalDataTools } from "./tools/personalData";

import { hasValidLicense, PRO_REQUIRED_MESSAGE } from "../main/services/settings";
import { McpStartupError } from "./runtime";

export { McpStartupError } from "./runtime";

function createServer(includeWrites: boolean): McpServer {
  const server = new McpServer({
    name: "paperweight",
    version: "0.1.0",
  });
  bindApprovalServer(server);
  registerMailboxTools(server);
  registerCompanyTools(server, includeWrites);
  registerCaseTools(server, includeWrites);
  registerPersonalDataTools(server, includeWrites);
  registerActivityTools(server);
  return server;
}

export async function runMcpServer(onClose?: () => void): Promise<void> {
  const pipe = process.platform === "win32" ? process.env.PAPERWEIGHT_MCP_PIPE : undefined;
  const socket = pipe ? connect(pipe) : undefined;
  if (socket) {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
  }
  const input = socket ?? process.stdin;
  input.once("end", () => onClose?.());
  input.once("close", () => onClose?.());
  if (!await hasValidLicense()) throw new McpStartupError(PRO_REQUIRED_MESSAGE);
  await initializePaperweight();
  await new Promise<void>((resolve) => {
    serveStdio(async () => {
      const server = createServer(await hasWriteAccess());
      server.server.onclose = () => {
        onClose?.();
        resolve();
      };
      return server;
    }, { transport: new StdioServerTransport(input, socket ?? process.stdout) });
  });
}
