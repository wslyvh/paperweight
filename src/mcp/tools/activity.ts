import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getActivityLog } from "../../main/services/stats";
import {
  getSelectedMailbox,
  hasReadAccess,
  readAccessError,
} from "../runtime";

export function registerActivityTools(server: McpServer): void {
  server.registerTool(
    "get_activity",
    {
      description: "Get the same paginated action history shown in the Paperweight Activity log.",
      inputSchema: z.object({
        page: z.number().int().min(1).max(1_000_000).default(1),
        limit: z.number().int().min(1).max(50).default(50),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        total: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        limit: z.number().int().positive(),
        items: z.array(z.object({
          companyKey: z.string(),
          companyName: z.string(),
          companyDomain: z.string().optional(),
          actionType: z.string(),
          messageCount: z.number().int().nonnegative(),
          sizeBytes: z.number().int().nonnegative(),
          actionedAt: z.number().nonnegative(),
          caseId: z.number().int().positive().optional(),
          caseRequestType: z.enum(["access", "deletion"]).optional(),
          caseOutcome: z.enum(["resolved", "escalated"]).optional(),
        })),
      }),
    },
    async ({ page, limit }) => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const result = getActivityLog(limit, (page - 1) * limit);
        const response = {
          mailbox: getSelectedMailbox(),
          total: result.total,
          page,
          limit,
          items: result.entries.map((entry) => ({
            companyKey: entry.vendorSlug ?? entry.vendorDomain ?? String(entry.vendorId),
            companyName: entry.vendorName,
            companyDomain: entry.vendorDomain,
            actionType: entry.actionType,
            messageCount: entry.messageCount,
            sizeBytes: entry.sizeBytes,
            actionedAt: entry.actionedAt,
            caseId: entry.caseId,
            caseRequestType: entry.caseRequestType,
            caseOutcome: entry.caseOutcome,
          })),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not read activity." }],
          isError: true,
        };
      }
    },
  );
}
