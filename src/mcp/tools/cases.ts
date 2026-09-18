import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { READ_ONLY_TOOL_ANNOTATIONS } from "../annotations";
import { agentToolResult } from "../payload";
import {
  mailboxReference,
  parseMailboxNumberReference,
  parseMailboxReference,
} from "../identifiers";
import { LANGUAGES } from "../../shared/gdpr/resolution";
import { CASE_TIMELINE_EVENT_TYPES } from "../../shared/cases";
import { queryCaseSummaries } from "../../shared/case-query";
import {
  closeGdprCase,
  escalateGdprCase,
  getGdprCaseById,
  getGdprCaseReplies,
  linkGdprCaseMessage,
  queryGdprCases,
  reopenGdprCase,
  unlinkGdprCaseMessage,
} from "../../main/services/cases";
import {
  sendCaseMessage,
  sendPrivacyRequest,
} from "../../main/services/gdprActions";
import { getVendorDetail } from "../../main/services/vendors";
import { withCredentialAccount } from "../../main/credentials";
import {
  OUTBOUND_EMAIL_UNAVAILABLE_REASON,
  requestOutboundEmailApproval,
  UserInputRequired,
} from "../elicitation";
import {
  getSelectedMailbox,
  hasReadAccess,
  hasWriteAccess,
  readAccessError,
  requireSelectedMailbox,
  withSelectedMailboxAction,
  writeAccessError,
} from "../runtime";

const languageValues = Object.keys(LANGUAGES) as [string, ...string[]];
const mailboxSchema = z.string().trim().min(1).max(200)
  .describe("The mailbox key currently selected in this MCP session.");

const caseSummarySchema = z.object({
  id: z.string(),
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
    id: mailboxReference(item.id),
    companyKey: mailboxReference(item.vendorDomain ?? String(item.vendorId)),
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

export function registerCaseTools(server: McpServer, includeWrites: boolean): void {
  server.registerTool(
    "search_cases",
    {
      description: "Search and filter the same privacy cases shown on the Paperweight Cases page.",
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
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
        return agentToolResult(response);
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
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        id: z.string().describe("An opaque case ref returned by search_cases."),
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
          ref: z.string(),
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
        const caseId = parseMailboxNumberReference(id);
        const detail = getGdprCaseById(caseId);
        if (!detail) {
          return {
            content: [{ type: "text" as const, text: "Paperweight could not find that case." }],
            isError: true,
          };
        }
        const replies = getGdprCaseReplies(caseId);
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
            ref: mailboxReference(message.id),
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
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not read that case." }],
          isError: true,
        };
      }
    },
  );

  if (includeWrites) server.registerTool(
    "send_privacy_request",
    {
      description: "Send Paperweight's standard personal-data access or deletion request and open a tracked case. This sends an external email.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: z.object({
        mailbox: mailboxSchema,
        key: z.string().trim().min(1).max(500)
          .describe("The company key returned by search_companies."),
        requestType: z.enum(["access", "deletion"]),
        recipientEmail: z.string().trim().email().max(320).optional()
          .describe("Optional company contact override. Paperweight otherwise selects the same contact as the App."),
        accountIdentifier: z.string().trim().min(1).max(200).optional()
          .describe("Optional account reference included in the standard request template."),
        language: z.enum(languageValues).optional()
          .describe("Optional request language. Paperweight otherwise uses the same domain-based default as the App."),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        companyKey: z.string(),
        requestType: z.enum(["access", "deletion"]),
        status: z.enum([
          "sent",
          "failed",
          "sent_case_failed",
          "no_recipient",
          "active_case_exists",
          "declined",
          "cancelled",
          "approval_unavailable",
        ]),
        caseId: z.string().optional(),
        reason: z.string().optional(),
      }),
    },
    async ({ mailbox: requestedMailbox, key, requestType, recipientEmail, accountIdentifier, language }, context) => {
      if (!hasWriteAccess()) return writeAccessError();
      try {
        requireSelectedMailbox(requestedMailbox);
        const companyReference = parseMailboxReference(key);
        const { companyKey, result } = await withSelectedMailboxAction(
          async (selectedMailbox) => {
            const detail = getVendorDetail(companyReference);
            const selectedResult = await withCredentialAccount(
              selectedMailbox,
              () => sendPrivacyRequest(
                detail.vendor.id,
                companyReference,
                requestType,
                selectedMailbox,
                recipientEmail,
                accountIdentifier,
                language,
                async (approval) => requestOutboundEmailApproval(
                  context,
                  `Send a ${approval.action} request to ${approval.companyName} at ${approval.recipient}?`,
                ),
              ),
            );
            return {
              companyKey: detail.vendor.company_slug
                ?? detail.vendor.root_domain
                ?? String(detail.vendor.id),
              result: selectedResult,
            };
          },
        );
        const response = {
          mailbox: requestedMailbox,
          companyKey: mailboxReference(companyKey, requestedMailbox),
          requestType,
          status: result.status,
          caseId: result.caseId
            ? mailboxReference(result.caseId, requestedMailbox)
            : undefined,
          reason: result.status === "approval_unavailable"
            ? OUTBOUND_EMAIL_UNAVAILABLE_REASON
            : undefined,
        };
        return agentToolResult(
          response,
          !["sent", "sent_case_failed"].includes(result.status),
        );
      } catch (error) {
        if (error instanceof UserInputRequired) return error.result;
        return {
          content: [{ type: "text" as const, text: "Paperweight could not send that privacy request." }],
          isError: true,
        };
      }
    },
  );

  if (includeWrites) server.registerTool(
    "send_case_message",
    {
      description: "Send the reminder or formal follow-up currently due for a Paperweight privacy case. This sends an external email and records it on the case.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: z.object({
        mailbox: mailboxSchema,
        id: z.string().describe("An opaque case ref returned by search_cases."),
        action: z.enum(["reminder", "followup"]),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        caseId: z.string(),
        action: z.enum(["reminder", "followup"]),
        status: z.enum([
          "sent",
          "failed",
          "sent_event_failed",
          "not_available",
          "declined",
          "cancelled",
          "approval_unavailable",
        ]),
        reason: z.string().optional(),
      }),
    },
    async ({ mailbox: requestedMailbox, id, action }, context) => {
      if (!hasWriteAccess()) return writeAccessError();
      try {
        requireSelectedMailbox(requestedMailbox);
        const caseId = parseMailboxNumberReference(id);
        const result = await withSelectedMailboxAction(
          async (selectedMailbox) =>
            withCredentialAccount(
              selectedMailbox,
              () => sendCaseMessage(
                caseId,
                action,
                selectedMailbox,
                async (approval) => requestOutboundEmailApproval(
                  context,
                  `Send a ${approval.action === "followup" ? "follow-up" : approval.action} to ${approval.companyName} at ${approval.recipient}?`,
                ),
              ),
            ),
        );
        const response = {
          mailbox: requestedMailbox,
          caseId: id,
          action,
          status: result.status,
          reason: result.status === "approval_unavailable"
            ? OUTBOUND_EMAIL_UNAVAILABLE_REASON
            : undefined,
        };
        return agentToolResult(
          response,
          !["sent", "sent_event_failed"].includes(result.status),
        );
      } catch (error) {
        if (error instanceof UserInputRequired) return error.result;
        return {
          content: [{ type: "text" as const, text: "Paperweight could not send that case message." }],
          isError: true,
        };
      }
    },
  );

  if (includeWrites) server.registerTool(
    "update_case_status",
    {
      description: "Close, reopen, or record escalation of a Paperweight privacy case.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        mailbox: mailboxSchema,
        id: z.string().describe("An opaque case ref returned by search_cases."),
        action: z.enum(["close", "reopen", "escalate"]),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        caseId: z.string(),
        status: z.enum(["active", "closed"]),
        outcome: z.enum(["resolved", "escalated"]).optional(),
      }),
    },
    async ({ mailbox, id, action }) => {
      if (!hasWriteAccess()) return writeAccessError();
      try {
        requireSelectedMailbox(mailbox);
        const caseId = parseMailboxNumberReference(id);
        if (!getGdprCaseById(caseId)) throw new Error("Case not found");
        if (action === "close") closeGdprCase(caseId);
        else if (action === "reopen") reopenGdprCase(caseId);
        else escalateGdprCase(caseId);
        const detail = getGdprCaseById(caseId);
        if (!detail) throw new Error("Case not found");
        const response = {
          mailbox,
          caseId: id,
          status: detail.status,
          outcome: detail.outcome,
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not update that case." }],
          isError: true,
        };
      }
    },
  );

  if (includeWrites) server.registerTool(
    "set_case_message_link",
    {
      description: "Link or unlink one message preview from a Paperweight privacy case using the opaque ref returned by get_case.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        mailbox: mailboxSchema,
        id: z.string().describe("An opaque case ref returned by search_cases."),
        messageRef: z.string().min(1).max(1_000)
          .describe("The opaque message ref returned by get_case."),
        linked: z.boolean(),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        caseId: z.string(),
        messageRef: z.string(),
        linked: z.boolean(),
      }),
    },
    async ({ mailbox, id, messageRef, linked }) => {
      if (!hasWriteAccess()) return writeAccessError();
      try {
        requireSelectedMailbox(mailbox);
        const caseId = parseMailboxNumberReference(id);
        const messageId = parseMailboxReference(messageRef);
        if (linked) linkGdprCaseMessage(caseId, messageId);
        else unlinkGdprCaseMessage(caseId, messageId);
        const response = {
          mailbox,
          caseId: id,
          messageRef,
          linked,
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not update that case message." }],
          isError: true,
        };
      }
    },
  );
}
