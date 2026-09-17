import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { CASE_TIMELINE_EVENT_TYPES } from "../../shared/cases";
import { queryCaseSummaries } from "../../shared/case-query";
import {
  getGdprCaseById,
  getGdprCaseReplies,
  queryGdprCases,
} from "../../main/services/cases";
import {
  getSelectedMailbox,
  hasReadAccess,
  readAccessError,
} from "../runtime";

const caseSummarySchema = z.object({
  id: z.number().int().positive(),
  companyKey: z.string(),
  companyName: z.string(),
  companyDomain: z.string().optional(),
  requestType: z.enum(["access", "deletion"]),
  status: z.enum(["active", "closed"]),
  outcome: z.enum(["resolved", "escalated"]).optional(),
  recipientEmail: z.string().optional(),
  openedAt: z.number().nonnegative(),
  closedAt: z.number().nonnegative().optional(),
  nextAction: z.enum(["reminder", "followup", "escalate"]).optional(),
  hasUnseenReply: z.boolean(),
});

const searchCasesInputSchema = z.object({
  search: z.string().trim().max(200).optional()
    .describe("Match the company name shown on the Cases page."),
  status: z.enum(["active", "needs_attention", "closed", "all"])
    .default("active")
    .describe("Use the same status filters as the Cases page."),
  sort: z.enum(["latest", "oldest", "name"])
    .default("latest")
    .describe("Sort using the same options as the Cases page."),
  page: z.number().int().min(1).max(1_000_000).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

function mapCaseSummary(item: ReturnType<typeof queryGdprCases>[number]) {
  return {
    id: item.id,
    companyKey: item.vendorDomain ?? String(item.vendorId),
    companyName: item.vendorName,
    companyDomain: item.vendorDomain,
    requestType: item.requestType,
    status: item.status,
    outcome: item.outcome,
    recipientEmail: item.recipientEmail,
    openedAt: item.openedAt,
    closedAt: item.closedAt,
    nextAction: item.nextAction,
    hasUnseenReply: item.hasUnseenReply,
  };
}

export function registerCaseTools(server: McpServer): void {
  server.registerTool(
    "search_cases",
    {
      description: "Search and filter the same privacy cases shown on the Paperweight Cases page.",
      inputSchema: searchCasesInputSchema,
      outputSchema: z.object({
        mailbox: z.string(),
        total: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        limit: z.number().int().positive(),
        items: z.array(caseSummarySchema),
      }),
    },
    async (input) => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const result = queryCaseSummaries(queryGdprCases(), {
          page: input.page,
          limit: input.limit,
          search: input.search,
          status: input.status === "all" ? "" : input.status,
          sort: input.sort === "oldest"
            ? "opened_asc"
            : input.sort === "name"
              ? "name"
              : "opened_desc",
        });
        const response = {
          mailbox: getSelectedMailbox(),
          total: result.total,
          page: result.page,
          limit: result.limit,
          items: result.items.map(mapCaseSummary),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not search cases." }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_case",
    {
      description: "Get a Paperweight privacy case timeline and bounded message previews. Email bodies and headers are never returned.",
      inputSchema: z.object({
        id: z.number().int().positive().describe("A case ID returned by search_cases."),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        case: caseSummarySchema.extend({
          lastViewedAt: z.number().nonnegative().optional(),
        }),
        events: z.array(z.object({
          actionType: z.string(),
          actionedAt: z.number().nonnegative(),
          subject: z.string().optional(),
          messageCount: z.number().int().nonnegative(),
          sizeBytes: z.number().int().nonnegative(),
        })),
        messages: z.array(z.object({
          senderEmail: z.string(),
          senderName: z.string().optional(),
          subject: z.string().optional(),
          preview: z.string().optional(),
          date: z.number().nonnegative(),
          type: z.string().optional(),
          relation: z.enum(["thread", "linked", "other"]),
        })),
      }),
    },
    async ({ id }) => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const detail = getGdprCaseById(id);
        if (!detail) {
          return {
            content: [{ type: "text" as const, text: "Paperweight could not find that case." }],
            isError: true,
          };
        }
        const replies = getGdprCaseReplies(id);
        const linked = new Set(replies.linkedMessageIds);
        const threadMessages = replies.threadMatches.map((message) => ({
          ...message,
          relation: "thread" as const,
        }));
        const otherMessages = replies.otherReplies.map((message) => ({
          ...message,
          relation: linked.has(message.id) ? "linked" as const : "other" as const,
        }));
        const messages = [...threadMessages, ...otherMessages]
          .sort((a, b) => b.date - a.date)
          .slice(0, 50)
          .map((message) => ({
            senderEmail: message.sender_email,
            senderName: message.sender_name,
            subject: message.subject,
            preview: message.body_preview,
            date: message.date,
            type: message.type,
            relation: message.relation,
          }));
        const response = {
          mailbox: getSelectedMailbox(),
          case: {
            ...mapCaseSummary(detail),
            lastViewedAt: detail.lastViewedAt,
          },
          events: detail.events
            .filter((event) => CASE_TIMELINE_EVENT_TYPES.includes(event.actionType))
            .slice(0, 100)
            .map((event) => ({
              actionType: event.actionType,
              actionedAt: event.actionedAt,
              subject: event.subject,
              messageCount: event.messageCount,
              sizeBytes: event.sizeBytes,
            })),
          messages,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not read that case." }],
          isError: true,
        };
      }
    },
  );
}
