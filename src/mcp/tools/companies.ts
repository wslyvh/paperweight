import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { FINDING_TYPES } from "@paperweight/analysis/contracts";
import { queryGdprCases } from "../../main/services/cases";
import { getAllUnsubscribeMethodsForVendor } from "../../main/services/messages";
import { getVendorPiiSummary } from "../../main/services/pii";
import { getWhitelistEntries } from "../../main/services/settings";
import { getVendorDetail, queryVendors } from "../../main/services/vendors";
import { RISK_CATEGORIES } from "../../shared/vendor-risk";
import type { Vendor, VendorQuery } from "../../shared/types";
import {
  getSelectedMailbox,
  hasReadAccess,
  readAccessError,
} from "../runtime";

const categoryValues = Object.keys(RISK_CATEGORIES) as [string, ...string[]];
const riskSchema = z.enum(["high", "medium", "low", "unknown"]);

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
    key: companyKey(vendor),
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

export function registerCompanyTools(server: McpServer): void {
  server.registerTool(
    "search_companies",
    {
      description: "Search the same Accounts or Mailing Lists data and filters shown in Paperweight.",
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
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
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
      description: "Get the company detail Paperweight displays, including bounded previews and masked personal data.",
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
          id: z.number().int().positive(),
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
          caseId: z.number().int().positive().optional(),
          caseRequestType: z.enum(["access", "deletion"]).optional(),
          caseOutcome: z.enum(["resolved", "escalated"]).optional(),
        })),
      }),
    },
    async ({ key }) => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const detail = getVendorDetail(key);
        const pii = getVendorPiiSummary(detail.vendor.id);
        const cases = queryGdprCases({ vendorId: detail.vendor.id });
        const unsubscribeEntries = getAllUnsubscribeMethodsForVendor(detail.vendor.id);
        const availableUnsubscribeMethods = [...new Set(unsubscribeEntries.map((entry) => {
          if (entry.method === "rfc8058") return "one_click" as const;
          if (entry.url.toLowerCase().startsWith("mailto:")) return "email" as const;
          return "browser" as const;
        }))];
        const piiValues = pii.values.slice(0, 100).map(({ ref: _ref, ...value }) => value);
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
            id: item.id,
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
            caseId: item.caseId,
            caseRequestType: item.caseRequestType,
            caseOutcome: item.caseOutcome,
          })),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not find that company." }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "list_whitelist",
    {
      description: "List the email addresses and domains whitelisted for the selected Paperweight mailbox.",
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
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not read the whitelist." }],
          isError: true,
        };
      }
    },
  );
}
