import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { FINDING_TYPES } from "@paperweight/analysis/contracts";
import {
  getPiiOverview,
  getPiiValueCompanies,
  maskValue,
} from "../../main/services/pii";
import { getUserProfile } from "../../main/services/profile";
import {
  getFindingConfidence,
  queryPiiOverview,
} from "../../shared/pii-query";
import {
  getSelectedMailbox,
  hasReadAccess,
  readAccessError,
} from "../runtime";

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

function maskName(parts: Array<string | undefined>): string {
  return parts
    .filter((part): part is string => !!part?.trim())
    .map((part) => `${part.trim()[0] ?? "•"}•••`)
    .join(" ");
}

export function registerPersonalDataTools(server: McpServer): void {
  server.registerTool(
    "search_personal_data",
    {
      description: "Search the same masked personal-data overview, filters, and sorting shown in Paperweight.",
      inputSchema: searchPersonalDataInputSchema,
      outputSchema: z.object({
        mailbox: z.string(),
        total: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        limit: z.number().int().positive(),
        items: z.array(piiValueSchema.extend({
          ref: z.number().int().positive(),
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
        const response = {
          mailbox: getSelectedMailbox(),
          total: result.total,
          page: result.page,
          limit: result.limit,
          items: result.items.map((item) => ({
            ...item,
            confidence: getFindingConfidence(item),
          })),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
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
      inputSchema: z.object({
        ref: z.number().int().positive()
          .describe("The opaque reference returned by search_personal_data."),
        order: z.enum(["recent", "oldest"]).default("recent"),
      }),
      outputSchema: z.object({
        mailbox: z.string(),
        ref: z.number().int().positive(),
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
          companies: getPiiValueCompanies(ref, order).map((company) => ({
            key: company.groupKey,
            name: company.name,
            lastSeen: company.lastSeen,
          })),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not find companies for that value." }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_profile",
    {
      description: "Get the global Paperweight profile with all personal values masked.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        scope: z.literal("global"),
        country: z.string().optional(),
        birthDate: z.string().optional(),
        names: z.array(z.string()),
        emails: z.array(z.string()),
        phones: z.array(z.string()),
        addresses: z.array(z.string()),
        nationalIds: z.array(z.string()),
        payments: z.array(z.object({
          type: z.enum(["iban", "credit_card"]),
          maskedValue: z.string(),
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
            ? maskValue(
                "date_of_birth",
                `${profile.birthDate.year}-${String(profile.birthDate.month).padStart(2, "0")}-${String(profile.birthDate.day).padStart(2, "0")}`,
              )
            : undefined,
          names: profile.names.map((name) =>
            maskName([name.firstName, name.middleName, name.lastName])
          ),
          emails: profile.emails.map((email) => maskValue("email", email.address)),
          phones: profile.phones.map((phone) => maskValue("phone", phone.number)),
          addresses: profile.addresses.map((address) => maskValue(
            "address",
            address.raw ?? [
              address.street,
              address.houseNumber,
              address.postalCode,
              address.city,
              address.country,
            ].filter(Boolean).join(" "),
          )),
          nationalIds: profile.nationalIds.map((id) => maskValue("national_id", id.value)),
          payments: profile.payments.map((payment) => ({
            type: payment.type,
            maskedValue: maskValue(payment.type, payment.value),
          })),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response) }],
          structuredContent: response,
        };
      } catch {
        return {
          content: [{ type: "text" as const, text: "Paperweight could not read the profile." }],
          isError: true,
        };
      }
    },
  );
}
