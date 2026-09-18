import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { READ_ONLY_TOOL_ANNOTATIONS } from "../annotations";
import { agentToolResult } from "../payload";
import {
  mailboxReference,
  parseMailboxNumberReference,
} from "../identifiers";
import { FINDING_TYPES } from "@paperweight/analysis/contracts";
import {
  confirmPiiFinding,
  getPiiOverview,
  getPiiValueCompanies,
  revealPiiValues,
  suppressPiiFinding,
} from "../../main/services/pii";
import {
  getUserProfile,
  updateUserProfile,
} from "../../main/services/profile";
import { markProfileAnalysisStale } from "../../main/sync-manager";
import {
  getFindingConfidence,
  queryPiiOverview,
} from "../../shared/pii-query";
import {
  getSelectedMailbox,
  hasReadAccess,
  hasWriteAccess,
  readAccessError,
  requireSelectedMailbox,
  writeAccessError,
} from "../runtime";

const mailboxSchema = z.string().trim().min(1).max(200)
  .describe("The mailbox key currently selected in this MCP session.");

const piiValueSchema = z.object({
  type: z.enum(FINDING_TYPES),
  maskedValue: z.string(),
  lastSeen: z.number().nonnegative(),
  isMatch: z.boolean().optional(),
  isForeignFormat: z.boolean().optional(),
  companyCount: z.number().int().nonnegative(),
  isFrequentAtCompany: z.boolean().optional(),
});

const searchPersonalDataInputSchema = z.object({
  search: z.string().trim().max(200).optional()
    .describe("Match the masked value or data-type label shown on the Personal Data page."),
  type: z.enum(FINDING_TYPES).optional()
    .describe("Filter by the same personal-data categories as the app."),
  state: z.enum([
    "all",
    "match",
    "unclassified",
    "high",
    "possible",
    "low",
    "not_mine",
  ]).default("all").describe("Use the same ownership and confidence filters as the app."),
  sort: z.enum(["evidence", "latest", "oldest", "type"])
    .default("evidence")
    .describe("Sort using the same options as the Personal Data page."),
  page: z.number().int().min(1).max(1_000_000).default(1),
  limit: z.number().int().min(1).max(50).default(25),
});

const updateProfileInputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("set_country"), country: z.string().trim().min(2).max(100) }),
  z.object({ operation: z.literal("clear_country") }),
  z.object({
    operation: z.literal("set_birth_date"),
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  }),
  z.object({ operation: z.literal("clear_birth_date") }),
  z.object({
    operation: z.literal("add_name"),
    firstName: z.string().trim().min(1).max(200),
    middleName: z.string().trim().max(200).optional(),
    lastName: z.string().trim().min(1).max(200),
  }),
  z.object({ operation: z.literal("add_email"), value: z.string().trim().email().max(320) }),
  z.object({ operation: z.literal("add_phone"), value: z.string().trim().min(1).max(100) }),
  z.object({ operation: z.literal("add_address"), value: z.string().trim().min(1).max(500) }),
  z.object({ operation: z.literal("add_national_id"), value: z.string().trim().min(1).max(200) }),
  z.object({
    operation: z.literal("add_payment"),
    paymentType: z.enum(["iban", "credit_card"]),
    value: z.string().trim().min(1).max(200),
  }),
  z.object({
    operation: z.literal("remove"),
    field: z.enum(["name", "email", "phone", "address", "national_id", "payment"]),
    ref: z.number().int().positive()
      .describe("The opaque profile ref returned by get_profile."),
  }),
]);
const updateProfileToolInputSchema = z.intersection(
  z.object({ mailbox: mailboxSchema }),
  updateProfileInputSchema,
);

const maskedProfileValueSchema = z.object({
  ref: z.number().int().positive(),
  maskedValue: z.string(),
});

export function registerPersonalDataTools(server: McpServer, includeWrites: boolean): void {
  server.registerTool(
    "search_personal_data",
    {
      description: "Search the same masked personal-data overview, filters, and sorting shown in Paperweight.",
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      inputSchema: searchPersonalDataInputSchema,
      outputSchema: z.object({
        mailbox: z.string(),
        total: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        limit: z.number().int().positive(),
        items: z.array(piiValueSchema.extend({
          ref: z.string(),
          confidence: z.enum(["high", "possible", "low"]),
        })),
      }),
    },
    async (input) => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const filter = input.state === "match"
          ? "exact"
          : input.state === "not_mine"
            ? "suppressed"
            : input.state === "all"
              ? ""
              : input.state;
        const sort = input.sort === "latest"
          ? "last_seen"
          : input.sort === "oldest"
            ? "last_seen_asc"
            : input.sort;
        const result = queryPiiOverview(getPiiOverview(), {
          page: input.page,
          limit: input.limit,
          search: input.search,
          filter,
          type: input.type,
          sort,
        });
        const revealedValues = new Map(
          revealPiiValues().map((item) => [item.ref, item.value]),
        );
        const response = {
          mailbox: getSelectedMailbox(),
          total: result.total,
          page: result.page,
          limit: result.limit,
          items: result.items.map((item) => ({
            ...item,
            ref: mailboxReference(item.ref),
            maskedValue: revealedValues.get(item.ref) ?? item.maskedValue,
            confidence: getFindingConfidence(item),
          })),
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not search personal data." }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_personal_data_companies",
    {
      description: "List the companies shown when expanding one masked value on the Personal Data page.",
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        ref: z.string()
          .describe("The opaque reference returned by search_personal_data."),
        order: z.enum(["recent", "oldest"]).default("recent"),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        ref: z.string(),
        order: z.enum(["recent", "oldest"]),
        companies: z.array(z.object({
          key: z.string(),
          name: z.string(),
          lastSeen: z.number().nonnegative(),
        })),
      }),
    },
    async ({ ref, order }) => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const response = {
          mailbox: getSelectedMailbox(),
          ref,
          order,
          companies: getPiiValueCompanies(
            parseMailboxNumberReference(ref),
            order,
          ).map((company) => ({
            key: mailboxReference(company.groupKey),
            name: company.name,
            lastSeen: company.lastSeen,
          })),
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not find companies for that value." }],
          isError: true,
        };
      }
    },
  );

  if (includeWrites) server.registerTool(
    "classify_personal_data",
    {
      description: "Classify a masked Paperweight personal-data finding as belonging to the user or not belonging to them. The raw value is resolved internally and never returned.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        mailbox: mailboxSchema,
        ref: z.string()
          .describe("The opaque reference returned by search_personal_data."),
        classification: z.enum(["mine", "not_mine"]),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        ref: z.string(),
        classification: z.enum(["mine", "not_mine"]),
      }),
    },
    async ({ mailbox, ref, classification }) => {
      if (!hasWriteAccess()) return writeAccessError();
      try {
        requireSelectedMailbox(mailbox);
        const findingId = parseMailboxNumberReference(ref);
        if (classification === "mine") {
          if (confirmPiiFinding(findingId)) markProfileAnalysisStale();
        } else {
          suppressPiiFinding(findingId);
        }
        const response = {
          mailbox,
          ref,
          classification,
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not classify that personal-data finding." }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_profile",
    {
      description: "Get the global Paperweight profile. Personal values follow the masking choice in Settings.",
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      inputSchema: z.object({}),
      outputSchema: z.object({
        scope: z.literal("global"),
        country: z.string().optional(),
        birthDate: z.string().optional(),
        names: z.array(maskedProfileValueSchema),
        emails: z.array(maskedProfileValueSchema),
        phones: z.array(maskedProfileValueSchema),
        addresses: z.array(maskedProfileValueSchema),
        nationalIds: z.array(maskedProfileValueSchema),
        payments: z.array(maskedProfileValueSchema.extend({
          type: z.enum(["iban", "credit_card"]),
        })),
      }),
    },
    async () => {
      if (!hasReadAccess()) return readAccessError();
      try {
        const profile = getUserProfile();
        const response = {
          scope: "global" as const,
          country: profile.country,
          birthDate: profile.birthDate
            ? `${profile.birthDate.year}-${String(profile.birthDate.month).padStart(2, "0")}-${String(profile.birthDate.day).padStart(2, "0")}`
            : undefined,
          names: profile.names.map((name) => ({
            ref: name.id,
            maskedValue: [name.firstName, name.middleName, name.lastName]
              .filter(Boolean)
              .join(" "),
          })),
          emails: profile.emails.map((email) => ({
            ref: email.id,
            maskedValue: email.address,
          })),
          phones: profile.phones.map((phone) => ({
            ref: phone.id,
            maskedValue: phone.number,
          })),
          addresses: profile.addresses.map((address) => ({
            ref: address.id,
            maskedValue: address.raw ?? [
              address.street,
              address.houseNumber,
              address.postalCode,
              address.city,
              address.country,
            ].filter(Boolean).join(" "),
          })),
          nationalIds: profile.nationalIds.map((id) => ({
            ref: id.id,
            maskedValue: id.value,
          })),
          payments: profile.payments.map((payment) => ({
            ref: payment.id,
            type: payment.type,
            maskedValue: payment.value,
          })),
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not read the profile." }],
          isError: true,
        };
      }
    },
  );

  if (includeWrites) server.registerTool(
    "update_profile",
    {
      description: "Add or remove one profile value, or set/clear the profile country or birth date. Values added through this tool are plaintext in the agent chat.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: updateProfileToolInputSchema,
      outputSchema: z.object({
        scope: z.literal("global"),
        operation: z.string(),
        updated: z.literal(true),
      }),
    },
    async (input) => {
      if (!hasWriteAccess()) return writeAccessError();
      try {
        requireSelectedMailbox(input.mailbox);
        if (updateUserProfile(input)) markProfileAnalysisStale();
        const response = {
          scope: "global" as const,
          operation: input.operation,
          updated: true as const,
        };
        return agentToolResult(response);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not update the profile." }],
          isError: true,
        };
      }
    },
  );
}
