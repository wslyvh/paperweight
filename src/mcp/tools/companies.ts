import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { FINDING_TYPES } from "@paperweight/analysis/contracts";
import { withCredentialAccount } from "../../main/credentials";
import {
  spamVendorMessages,
  trashVendorMessages,
} from "../../main/services/account";
import { queryGdprCases } from "../../main/services/cases";
import { getAllUnsubscribeMethodsForVendor } from "../../main/services/messages";
import {
  getVendorPiiSummary,
  revealVendorPiiValues,
} from "../../main/services/pii";
import {
  addWhitelistEntry,
  getWhitelistEntries,
  removeWhitelistEntry,
} from "../../main/services/settings";
import { unsubscribeVendor } from "../../main/services/unsubscribe";
import {
  getVendorDetail,
  queryVendors,
  updateVendor,
} from "../../main/services/vendors";
import { RISK_CATEGORIES } from "../../shared/vendor-risk";
import { MARKETING_ACTION_TYPES } from "../../shared/types";
import type { Vendor, VendorQuery } from "../../shared/types";
import { isEmailOrDomain } from "../../shared/validation";
import { READ_ONLY_TOOL_ANNOTATIONS, WRITE_TOOL_ANNOTATIONS } from "../annotations";
import { agentToolResult } from "../payload";
import { mailboxReference, parseMailboxReference } from "../identifiers";
import {
  getSelectedMailbox,
  hasReadAccess,
  hasWriteAccess,
  readAccessError,
  requireSelectedMailbox,
  withSelectedMailboxAction,
  writeAccessError,
} from "../runtime";

const categoryValues = Object.keys(RISK_CATEGORIES) as [string, ...string[]];
const riskSchema = z.enum(["high", "medium", "low", "unknown"]);
const mailboxSchema = z.string().trim().min(1).max(200)
  .describe("The mailbox key currently selected in this MCP session.");

const breachSchema = z.object({
  name: z.string(),
  title: z.string(),
  domain: z.string(),
  breachDate: z.string(),
  pwnCount: z.number().int().nonnegative(),
  description: z.string(),
  dataClasses: z.array(z.string()),
  isVerified: z.boolean(),
  isSensitive: z.boolean(),
  likelyAffected: z.boolean(),
});

const companySummarySchema = z.object({
  key: z.string(),
  name: z.string(),
  domain: z.string().optional(),
  category: z.string().optional(),
  risk: riskSchema.optional(),
  firstSeen: z.number().nonnegative().optional(),
  lastSeen: z.number().nonnegative().optional(),
  messageCount: z.number().int().nonnegative(),
  senderCount: z.number().int().nonnegative(),
  hasAccountEvidence: z.boolean(),
  isMailingList: z.boolean(),
  isReviewed: z.boolean(),
  hasOrders: z.boolean(),
  hasNotablePersonalData: z.boolean(),
  breachCount: z.number().int().nonnegative(),
  supportsOneClickUnsubscribe: z.boolean(),
  supportsEmailUnsubscribe: z.boolean(),
});

const piiValueSchema = z.object({
  type: z.enum(FINDING_TYPES),
  maskedValue: z.string(),
  lastSeen: z.number().nonnegative(),
  isMatch: z.boolean().optional(),
  isForeignFormat: z.boolean().optional(),
  companyCount: z.number().int().nonnegative(),
  isFrequentAtCompany: z.boolean().optional(),
});

const searchCompaniesInputSchema = z.object({
  view: z.enum(["accounts", "mailing_lists"])
    .default("accounts")
    .describe("The Paperweight page to search."),
  search: z.string().trim().max(200).optional()
    .describe("Match a company name or domain."),
  risk: z.enum(["high", "medium", "low"]).optional()
    .describe("Filter by Paperweight risk level."),
  category: z.enum(categoryValues).optional()
    .describe("Filter by Paperweight company category."),
  reviewed: z.enum(["unreviewed", "reviewed"])
    .default("unreviewed")
    .describe("Show the same unreviewed or reviewed Accounts view as the app."),
  activity: z.enum(["recent", "active", "inactive", "stale", "dead"]).optional()
    .describe("Filter by the app's last-activity ranges."),
  volume: z.enum(["oneoff", "low", "medium", "high"]).optional()
    .describe("Filter by the app's message-volume ranges."),
  dataType: z.enum(["has_orders", "has_account", "marketing_only"]).optional()
    .describe("Filter Accounts by evidence found in messages."),
  piiType: z.enum(FINDING_TYPES).optional()
    .describe("Filter Accounts by a visible personal-data category."),
  breached: z.literal(true).optional()
    .describe("Only include companies on a known breach list."),
  whitelisted: z.literal(true).optional()
    .describe("Only include whitelisted Mailing Lists."),
  priority: z.literal(true).optional()
    .describe("Only include priority Mailing Lists with an actionable subscription."),
  sort: z.enum(["risk", "message_count", "latest", "oldest", "name", "domain"])
    .default("message_count")
    .describe("Sort using the same options as the app."),
  page: z.number().int().min(1).max(1_000_000).default(1)
    .describe("One-based result page."),
  limit: z.number().int().min(1).max(50).default(20)
    .describe("Results per page, up to 50."),
});

function companyKey(vendor: Vendor): string {
  return vendor.company_slug ?? vendor.root_domain ?? String(vendor.id);
}

function mapCompanySummary(vendor: Vendor) {
  return {
    key: mailboxReference(companyKey(vendor)),
    name: vendor.name,
    domain: vendor.root_domain ?? undefined,
    category: vendor.category_id ?? undefined,
    risk: vendor.risk_level ?? undefined,
    firstSeen: vendor.first_seen ?? undefined,
    lastSeen: vendor.last_seen ?? undefined,
    messageCount: vendor.message_count,
    senderCount: vendor.sender_count,
    hasAccountEvidence: vendor.has_account,
    isMailingList: vendor.has_marketing,
    isReviewed: vendor.status === "reviewed",
    hasOrders: vendor.has_orders ?? false,
    hasNotablePersonalData: vendor.hasNotablePii ?? false,
    breachCount: vendor.breachInfo?.length ?? 0,
    supportsOneClickUnsubscribe: vendor.has_rfc8058 ?? false,
    supportsEmailUnsubscribe: vendor.has_mailto_unsub ?? false,
  };
}

function companySort(sort: z.infer<typeof searchCompaniesInputSchema>["sort"]): {
  sortBy: string;
  sortDir: "ASC" | "DESC";
} {
  if (sort === "risk") return { sortBy: "risk", sortDir: "ASC" };
  if (sort === "latest") return { sortBy: "last_seen", sortDir: "DESC" };
  if (sort === "oldest") return { sortBy: "last_seen", sortDir: "ASC" };
  if (sort === "name") return { sortBy: "name", sortDir: "ASC" };
  if (sort === "domain") return { sortBy: "root_domain", sortDir: "ASC" };
  return { sortBy: "message_count", sortDir: "DESC" };
}

export function registerCompanyTools(server: McpServer, includeWrites: boolean): void {
  server.registerTool(
    "search_companies",
    {
      description: "Search the same Accounts or Mailing Lists data and filters shown in Paperweight.",
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      inputSchema: searchCompaniesInputSchema,
      outputSchema: z.object({
        mailbox: z.string(),
        view: z.enum(["accounts", "mailing_lists"]),
        total: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        limit: z.number().int().positive(),
        items: z.array(companySummarySchema),
      }),
    },
    async (input) => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const sort = companySort(input.sort);
        const query: VendorQuery = {
          page: input.page,
          limit: input.limit,
          filter: input.view === "accounts" ? "accounts" : "lists",
          search: input.search,
          risk: input.risk,
          category: input.category,
          showReviewed: input.reviewed === "reviewed",
          activity: input.activity,
          volume: input.volume,
          dataType: input.dataType,
          piiType: input.piiType,
          onBreachList: input.breached,
          showWhitelisted: input.whitelisted,
          activeSubscriptions: input.priority,
          ...sort,
        };
        const result = queryVendors(query);
        const response = {
          mailbox: getSelectedMailbox(),
          view: input.view,
          total: result.total,
          page: input.page,
          limit: input.limit,
          items: result.vendors.map(mapCompanySummary),
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not search companies." }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_company",
    {
      description: "Get the company detail Paperweight displays, including bounded previews. Personal data follows the masking choice in Settings.",
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        key: z.string().trim().min(1).max(500)
          .describe("The key returned by search_companies."),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        company: companySummarySchema,
        availableUnsubscribeMethods: z.array(z.enum(["one_click", "email", "browser"])),
        profile: z.object({
          address: z.string().optional(),
          website: z.string().optional(),
          privacyForm: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          categories: z.array(z.string()).optional(),
          runs: z.array(z.string()).optional(),
          comments: z.array(z.string()).optional(),
          suggestedContactMethod: z.string().optional(),
        }).optional(),
        accountAddress: z.string().optional(),
        senders: z.array(z.object({
          email: z.string(),
          name: z.string().optional(),
          messageCount: z.number().int().nonnegative(),
        })),
        receivedAddresses: z.array(z.object({
          email: z.string(),
          messageCount: z.number().int().nonnegative(),
          lastSeen: z.number().nonnegative(),
        })),
        mailingListMessageCount: z.number().int().nonnegative(),
        recentMessages: z.array(z.object({
          senderEmail: z.string(),
          senderName: z.string().optional(),
          subject: z.string().optional(),
          preview: z.string().optional(),
          date: z.number().nonnegative(),
          type: z.string().optional(),
        })),
        breaches: z.array(breachSchema),
        personalData: z.object({
          scannedMessageCount: z.number().int().nonnegative(),
          total: z.number().int().nonnegative(),
          suppressedTotal: z.number().int().nonnegative(),
          categories: z.array(z.enum(FINDING_TYPES)),
          values: z.array(piiValueSchema),
        }),
        privacyCases: z.array(z.object({
          id: z.string(),
          requestType: z.enum(["access", "deletion"]),
          status: z.enum(["active", "closed"]),
          outcome: z.enum(["resolved", "escalated"]).optional(),
          recipientEmail: z.string().optional(),
          openedAt: z.number().nonnegative(),
          closedAt: z.number().nonnegative().optional(),
          nextAction: z.enum(["reminder", "followup", "escalate"]).optional(),
          hasUnseenReply: z.boolean(),
        })),
        activity: z.array(z.object({
          actionType: z.string(),
          messageCount: z.number().int().nonnegative(),
          sizeBytes: z.number().int().nonnegative(),
          actionedAt: z.number().nonnegative(),
          caseId: z.string().optional(),
          caseRequestType: z.enum(["access", "deletion"]).optional(),
          caseOutcome: z.enum(["resolved", "escalated"]).optional(),
        })),
      }),
    },
    async ({ key }) => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const detail = getVendorDetail(parseMailboxReference(key));
        const pii = getVendorPiiSummary(detail.vendor.id);
        const cases = queryGdprCases({ vendorId: detail.vendor.id });
        const unsubscribeEntries = getAllUnsubscribeMethodsForVendor(detail.vendor.id);
        const availableUnsubscribeMethods = [...new Set(unsubscribeEntries.map((entry) => {
          if (entry.method === "rfc8058") return "one_click" as const;
          if (entry.url.toLowerCase().startsWith("mailto:")) return "email" as const;
          return "browser" as const;
        }))];
        const revealedPiiValues = new Map(
          revealVendorPiiValues(detail.vendor.id).map((item) => [item.ref, item.value]),
        );
        const piiValues = pii.values.slice(0, 100).map(({ ref, ...value }) => ({
          ...value,
          maskedValue: revealedPiiValues.get(ref) ?? value.maskedValue,
        }));
        const response = {
          mailbox: getSelectedMailbox(),
          company: {
            ...mapCompanySummary(detail.vendor),
            supportsOneClickUnsubscribe: availableUnsubscribeMethods.includes("one_click"),
            supportsEmailUnsubscribe: availableUnsubscribeMethods.includes("email"),
          },
          availableUnsubscribeMethods,
          profile: detail.company ? {
            address: detail.company.address ?? undefined,
            website: detail.company.web ?? undefined,
            privacyForm: detail.company.webform ?? undefined,
            email: detail.company.email ?? undefined,
            phone: detail.company.phone ?? undefined,
            categories: detail.company.categories ?? undefined,
            runs: detail.company.runs ?? undefined,
            comments: detail.company.comments ?? undefined,
            suggestedContactMethod: detail.company.suggested_transport_medium ?? undefined,
          } : undefined,
          accountAddress: detail.vendor.account_email ?? undefined,
          senders: detail.senders.slice(0, 50).map((sender) => ({
            email: sender.sender_email,
            name: sender.sender_name ?? undefined,
            messageCount: sender.message_count,
          })),
          receivedAddresses: detail.receivedAddresses.slice(0, 20).map((entry) => ({
            email: entry.address,
            messageCount: entry.message_count,
            lastSeen: entry.last_seen,
          })),
          mailingListMessageCount: detail.bulkMessageCount,
          recentMessages: detail.allMessages.slice(0, 20).map((message) => ({
            senderEmail: message.sender_email,
            senderName: message.sender_name ?? undefined,
            subject: message.subject ?? undefined,
            preview: message.body_preview ?? undefined,
            date: message.date,
            type: message.type ?? undefined,
          })),
          breaches: (detail.vendor.breachInfo ?? []).map((item) => ({
            ...item.breach,
            likelyAffected: item.likelyAffected,
          })),
          personalData: {
            scannedMessageCount: pii.scannedMessages,
            total: pii.values.length,
            suppressedTotal: pii.suppressedValues.length,
            categories: [...new Set(pii.values.map((value) => value.type))],
            values: piiValues,
          },
          privacyCases: cases.slice(0, 50).map((item) => ({
            id: mailboxReference(item.id),
            requestType: item.requestType,
            status: item.status,
            outcome: item.outcome,
            recipientEmail: item.recipientEmail,
            openedAt: item.openedAt,
            closedAt: item.closedAt,
            nextAction: item.nextAction,
            hasUnseenReply: item.hasUnseenReply,
          })),
          activity: detail.activityLog.slice(0, 50).map((item) => ({
            actionType: item.actionType,
            messageCount: item.messageCount,
            sizeBytes: item.sizeBytes,
            actionedAt: item.actionedAt,
            caseId: item.caseId ? mailboxReference(item.caseId) : undefined,
            caseRequestType: item.caseRequestType,
            caseOutcome: item.caseOutcome,
          })),
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not find that company." }],
          isError: true,
        };
      }
    },
  );

  if (includeWrites) server.registerTool(
    "unsubscribe_company",
    {
      description: "Unsubscribe from a company. Sends a one-click request or email when possible. If the list only has a web page, return that url so the user can open it. Never tell them to use the Paperweight app.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: z.object({
        mailbox: mailboxSchema,
        key: z.string().trim().min(1).max(500)
          .describe("The key returned by search_companies."),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        company: z.object({
          key: z.string(),
          name: z.string(),
          domain: z.string().optional(),
        }),
        status: z.enum(["unsubscribed", "manual_required", "not_available", "failed"]),
        method: z.enum(["one_click", "email", "browser"]).optional(),
        url: z.string().min(1).optional()
          .describe("Unsubscribe page. Show this URL to the user."),
      }),
    },
    async ({ mailbox: requestedMailbox, key }) => {
      if (!hasWriteAccess()) return writeAccessError();
      try {
        requireSelectedMailbox(requestedMailbox);
        const companyReference = parseMailboxReference(key);
        const { detail, result } = await withSelectedMailboxAction(
          async (selectedMailbox) => {
            const selectedDetail = getVendorDetail(companyReference);
            const selectedResult = await withCredentialAccount(
              selectedMailbox,
              () => unsubscribeVendor(selectedDetail.vendor.id),
            );
            return {
              detail: selectedDetail,
              result: selectedResult,
            };
          },
        );
        const response = {
          mailbox: requestedMailbox,
          company: {
            key: mailboxReference(companyKey(detail.vendor), requestedMailbox),
            name: detail.vendor.name,
            domain: detail.vendor.root_domain ?? undefined,
          },
          status: result.status,
          method: result.method,
          ...(result.url ? { url: result.url } : {}),
        };
        const toolResult = agentToolResult(response, result.status === "failed");
        if (result.status === "manual_required" && result.url) {
          return {
            ...toolResult,
            content: [{
              type: "text" as const,
              text: `Open this unsubscribe page:\n${result.url}`,
            }],
          };
        }
        if (result.status === "not_available") {
          return {
            ...toolResult,
            content: [{
              type: "text" as const,
              text: "No unsubscribe link or email is on file for this company.",
            }],
          };
        }
        return toolResult;
      } catch (error) {
        const message = error instanceof Error && error.message.startsWith("This action belongs to")
          ? error.message
          : "Paperweight could not unsubscribe from that company.";
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
        };
      }
    },
  );

  if (includeWrites) server.registerTool(
    "set_company_reviewed",
    {
      description: "Mark a Paperweight company as reviewed or return it to the unreviewed Accounts list.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        mailbox: mailboxSchema,
        key: z.string().trim().min(1).max(500)
          .describe("The key returned by search_companies."),
        reviewed: z.boolean(),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        companyKey: z.string(),
        reviewed: z.boolean(),
      }),
    },
    async ({ mailbox, key, reviewed }) => {
      if (!hasWriteAccess()) return writeAccessError();
      try {
        requireSelectedMailbox(mailbox);
        const detail = getVendorDetail(parseMailboxReference(key));
        updateVendor(detail.vendor.id, {
          status: reviewed ? "reviewed" : undefined,
        });
        const response = {
          mailbox,
          companyKey: mailboxReference(companyKey(detail.vendor), mailbox),
          reviewed,
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not update that company." }],
          isError: true,
        };
      }
    },
  );

  if (includeWrites) server.registerTool(
    "set_company_account_email",
    {
      description: "Set the user's account or login email for a company, as shown on the company detail page.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        mailbox: mailboxSchema,
        key: z.string().trim().min(1).max(500)
          .describe("The key returned by search_companies."),
        email: z.string().trim().email().max(320),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        companyKey: z.string(),
        accountEmail: z.string(),
      }),
    },
    async ({ mailbox, key, email }) => {
      if (!hasWriteAccess()) return writeAccessError();
      try {
        requireSelectedMailbox(mailbox);
        const detail = getVendorDetail(parseMailboxReference(key));
        updateVendor(detail.vendor.id, { account_email: email });
        const response = {
          mailbox,
          companyKey: mailboxReference(companyKey(detail.vendor), mailbox),
          accountEmail: email,
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not update that company email." }],
          isError: true,
        };
      }
    },
  );

  if (includeWrites) server.registerTool(
    "set_whitelist_entry",
    {
      description: "Add or remove an email address or domain from the selected mailbox's Paperweight whitelist.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        mailbox: mailboxSchema,
        value: z.string().trim().min(1).max(320)
          .refine(isEmailOrDomain, "Enter a valid email address or domain."),
        whitelisted: z.boolean(),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        value: z.string(),
        whitelisted: z.boolean(),
      }),
    },
    async ({ mailbox, value, whitelisted }) => {
      if (!hasWriteAccess()) return writeAccessError();
      try {
        requireSelectedMailbox(mailbox);
        if (whitelisted) addWhitelistEntry(value);
        else removeWhitelistEntry(value);
        const response = {
          mailbox,
          value,
          whitelisted,
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not update the whitelist." }],
          isError: true,
        };
      }
    },
  );

  if (includeWrites) server.registerTool(
    "trash_company_messages",
    {
      description: "Move a company's messages to trash. The default marketing scope only moves marketing mail; all also moves orders, receipts, password resets, and every other message from that company.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: z.object({
        mailbox: mailboxSchema,
        key: z.string().trim().min(1).max(500)
          .describe("The key returned by search_companies."),
        scope: z.enum(["marketing", "all"]).default("marketing"),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        companyKey: z.string(),
        scope: z.enum(["marketing", "all"]),
        status: z.literal("completed"),
      }),
    },
    async ({ mailbox: requestedMailbox, key, scope }) => {
      if (!hasWriteAccess()) return writeAccessError();
      try {
        requireSelectedMailbox(requestedMailbox);
        const companyReference = parseMailboxReference(key);
        const { detail, result } = await withSelectedMailboxAction(
          async (selectedMailbox) => {
            const selectedDetail = getVendorDetail(companyReference);
            const selectedResult = await withCredentialAccount(selectedMailbox, () =>
              trashVendorMessages(
                selectedDetail.vendor.id,
                scope === "marketing" ? [...MARKETING_ACTION_TYPES] : undefined,
                { waitForCompletion: true },
              )
            );
            return {
              detail: selectedDetail,
              result: selectedResult,
            };
          },
        );
        if (!result.success) throw new Error(result.error);
        const response = {
          mailbox: requestedMailbox,
          companyKey: mailboxReference(companyKey(detail.vendor), requestedMailbox),
          scope,
          status: "completed" as const,
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not move those messages to trash." }],
          isError: true,
        };
      }
    },
  );

  if (includeWrites) server.registerTool(
    "report_company_spam",
    {
      description: "Report a company's marketing messages as spam, then remove the completed records from Paperweight.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: z.object({
        mailbox: mailboxSchema,
        key: z.string().trim().min(1).max(500)
          .describe("The key returned by search_companies."),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        companyKey: z.string(),
        status: z.literal("completed"),
      }),
    },
    async ({ mailbox: requestedMailbox, key }) => {
      if (!hasWriteAccess()) return writeAccessError();
      try {
        requireSelectedMailbox(requestedMailbox);
        const companyReference = parseMailboxReference(key);
        const { detail, result } = await withSelectedMailboxAction(
          async (selectedMailbox) => {
            const selectedDetail = getVendorDetail(companyReference);
            const selectedResult = await withCredentialAccount(
              selectedMailbox,
              () => spamVendorMessages(
                selectedDetail.vendor.id,
                { waitForCompletion: true },
              ),
            );
            return {
              detail: selectedDetail,
              result: selectedResult,
            };
          },
        );
        if (!result.success) throw new Error(result.error);
        const response = {
          mailbox: requestedMailbox,
          companyKey: mailboxReference(companyKey(detail.vendor), requestedMailbox),
          status: "completed" as const,
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not report those messages as spam." }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "list_whitelist",
    {
      description: "List the email addresses and domains whitelisted for the selected Paperweight mailbox.",
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        page: z.number().int().min(1).max(1_000_000).default(1),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        total: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        limit: z.number().int().positive(),
        items: z.array(z.object({
          value: z.string(),
          kind: z.enum(["email", "domain"]),
          createdAt: z.string(),
        })),
      }),
    },
    async ({ page, limit }) => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const entries = getWhitelistEntries();
        const offset = (page - 1) * limit;
        const response = {
          mailbox: getSelectedMailbox(),
          total: entries.length,
          page,
          limit,
          items: entries.slice(offset, offset + limit).map((entry) => ({
            value: entry.value,
            kind: entry.value.includes("@") ? "email" as const : "domain" as const,
            createdAt: entry.created_at,
          })),
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not read the whitelist." }],
          isError: true,
        };
      }
    },
  );
}
