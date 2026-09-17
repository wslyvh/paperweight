import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { initializePaperweight } from "./runtime";
import { registerActivityTools } from "./tools/activity";
import { registerCaseTools } from "./tools/cases";
import { registerCompanyTools } from "./tools/companies";
import { registerMailboxTools } from "./tools/mailboxes";
import { registerPersonalDataTools } from "./tools/personalData";

export { McpStartupError } from "./runtime";

function createServer(): McpServer {
  const server = new McpServer({
    name: "paperweight",
    version: "0.1.0",
  });
  registerMailboxTools(server);
  registerCompanyTools(server);
  registerCaseTools(server);
  registerPersonalDataTools(server);
  registerActivityTools(server);
  return server;
}

export async function runMcpServer(): Promise<void> {
  initializePaperweight();
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
