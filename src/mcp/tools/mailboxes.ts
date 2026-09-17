import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { queryGdprCases } from "../../main/services/cases";
import { getDashboardStats, getImpactStats } from "../../main/services/stats";
import { getSyncState } from "../../main/services/sync";
import {
  findMailbox,
  getAppActiveMailbox,
  getMailboxes,
  getSelectedMailbox,
  hasReadAccess,
  isMailboxAvailable,
  readAccessError,
  selectMailbox,
  withMailboxDatabase,
} from "../runtime";

const overviewSummarySchema = z.object({
  lastSyncAt: z.number().nonnegative().optional(),
  totalMessages: z.number().int().nonnegative(),
  accountCount: z.number().int().nonnegative(),
  reviewedAccountCount: z.number().int().nonnegative(),
  highRiskUnreviewedAccountCount: z.number().int().nonnegative(),
  breachedAccountCount: z.number().int().nonnegative(),
  mailingListCount: z.number().int().nonnegative(),
  activeSubscriptionCount: z.number().int().nonnegative(),
  actionedMailingListCount: z.number().int().nonnegative(),
  activePrivacyCaseCount: z.number().int().nonnegative(),
  privacyCasesNeedingAttentionCount: z.number().int().nonnegative(),
  impact: z.object({
    listsUnsubscribed: z.number().int().nonnegative(),
    emailsDeleted: z.number().int().nonnegative(),
    dataReclaimedBytes: z.number().int().nonnegative(),
  }),
});

function getOverviewSummary() {
  const stats = getDashboardStats();
  const activeCases = queryGdprCases({ status: "active" });
  return {
    lastSyncAt: getSyncState().last_sync_at,
    totalMessages: stats.totalMessages,
    accountCount: stats.uniqueVendors,
    reviewedAccountCount: stats.reviewedVendors,
    highRiskUnreviewedAccountCount: stats.highRiskUnreviewed,
    breachedAccountCount: stats.breachedCount,
    mailingListCount: stats.mailingListCount,
    activeSubscriptionCount: stats.activeSubscriptions,
    actionedMailingListCount: stats.mailingListsActioned,
    activePrivacyCaseCount: activeCases.length,
    privacyCasesNeedingAttentionCount: activeCases.filter((item) => item.nextAction).length,
    impact: getImpactStats(),
  };
}

export function registerMailboxTools(server: McpServer): void {
  server.registerTool(
    "list_mailboxes",
    {
      description: "List Paperweight mailboxes with scalar Dashboard summaries and show which mailbox the app and this MCP session currently use.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        selectedMailbox: z.string(),
        appActiveMailbox: z.string().optional(),
        mailboxes: z.array(z.object({
          email: z.string(),
          providerType: z.string(),
          registeredAt: z.number().nonnegative().optional(),
          isAppActive: z.boolean(),
          isMcpSelected: z.boolean(),
          isAvailable: z.boolean(),
          summary: overviewSummarySchema.optional(),
        })),
      }),
    },
    async () => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const selectedMailbox = getSelectedMailbox();
        const appActiveMailbox = getAppActiveMailbox();
        const response = {
          selectedMailbox,
          appActiveMailbox,
          mailboxes: getMailboxes().map((account) => {
            const isAvailable = isMailboxAvailable(account.email);
            let summary: ReturnType<typeof getOverviewSummary> | undefined;
            if (isAvailable) {
              try {
                summary = withMailboxDatabase(account.email, getOverviewSummary);
              } catch {
                summary = undefined;
              }
            }
            return {
              email: account.email,
              providerType: account.providerType,
              registeredAt: account.registeredAt,
              isAppActive: account.email === appActiveMailbox,
              isMcpSelected: account.email === selectedMailbox,
              isAvailable,
              summary,
            };
          }),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not list mailboxes." }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "select_mailbox",
    {
      description: "Select the mailbox used by this MCP session without changing the mailbox selected in the Paperweight app.",
      inputSchema: z.object({
        email: z.string().trim().email().max(320)
          .describe("A mailbox email returned by list_mailboxes."),
      }),
      outputSchema: z.object({
        selectedMailbox: z.string(),
        appActiveMailbox: z.string().optional(),
        changed: z.boolean(),
      }),
    },
    async ({ email }) => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const account = findMailbox(email);
        if (!account) {
          return {
            content: [{ type: "text" as const, text: "That mailbox is not registered in Paperweight." }],
            isError: true,
          };
        }
        if (!isMailboxAvailable(account.email)) {
          return {
            content: [{ type: "text" as const, text: "That mailbox data is unavailable." }],
            isError: true,
          };
        }
        const response = {
          selectedMailbox: account.email,
          appActiveMailbox: getAppActiveMailbox(),
          changed: selectMailbox(account.email),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not select that mailbox." }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_overview",
    {
      description: "Get the scalar Dashboard stats, impact, and action counts for the selected mailbox.",
      inputSchema: z.object({}),
      outputSchema: overviewSummarySchema.extend({
        mailbox: z.string(),
        providerType: z.string(),
        registeredAt: z.number().nonnegative().optional(),
      }),
    },
    async () => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const mailbox = getSelectedMailbox();
        const account = findMailbox(mailbox);
        const response = {
          ...getOverviewSummary(),
          mailbox,
          providerType: account?.providerType ?? "unknown",
          registeredAt: account?.registeredAt,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch {
        return {
          content: [{
            type: "text" as const,
            text: "Paperweight could not read the account overview.",
          }],
          isError: true,
        };
      }
    },
  );
}
