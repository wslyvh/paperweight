import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
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
    });
  });
}
