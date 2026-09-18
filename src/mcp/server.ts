import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { bindApprovalServer } from "./elicitation";
import { hasWriteAccess, initializePaperweight } from "./runtime";
import { registerActivityTools } from "./tools/activity";
import { registerCaseTools } from "./tools/cases";
import { registerCompanyTools } from "./tools/companies";
import { registerMailboxTools } from "./tools/mailboxes";
import { registerPersonalDataTools } from "./tools/personalData";

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
  initializePaperweight();
  await new Promise<void>((resolve) => {
    serveStdio(() => {
      const server = createServer(hasWriteAccess());
      server.server.onclose = () => {
        onClose?.();
        resolve();
      };
      return server;
    });
  });
}
