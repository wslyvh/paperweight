import {
  acceptedContent,
  inputRequired,
  inputResponse,
  type InputRequiredResult,
  type McpServer,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";

export type ApprovalResult =
  | "confirmed"
  | "declined"
  | "cancelled"
  | "unavailable";

export const OUTBOUND_EMAIL_UNAVAILABLE_REASON =
  "This MCP client can't show a confirmation prompt. Send this from the Paperweight app.";

const CLIENT_CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities";

interface ConfirmationPrompt {
  message: string;
  title: string;
  description: string;
}

export type ConfirmationResolution =
  | { kind: "confirmed" }
  | { kind: "declined" }
  | { kind: "cancelled" }
  | { kind: "unavailable" }
  | { kind: "input_required"; result: InputRequiredResult };

export class UserInputRequired extends Error {
  constructor(readonly result: InputRequiredResult) {
    super("User confirmation required");
    this.name = "UserInputRequired";
  }
}

const CONFIRM_KEY = "confirm";

let approvalServer: McpServer | undefined;

export function bindApprovalServer(server?: McpServer) {
  approvalServer = server;
}

interface ClientCapabilityView {
  elicitation?: unknown;
}

function hasFormElicitation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const elicitation = value as { form?: unknown; url?: unknown };
  return elicitation.form !== undefined
    || elicitation.url !== undefined
    || Object.keys(elicitation).length === 0;
}

function capabilitiesFromUnknown(value: unknown): ClientCapabilityView | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as ClientCapabilityView;
}

function declaredCapabilities(context: ServerContext): ClientCapabilityView | undefined {
  const envelope = context.mcpReq.envelope;
  if (envelope && typeof envelope === "object") {
    const record = envelope as Record<string, unknown>;
    const namespaced = capabilitiesFromUnknown(record[CLIENT_CAPABILITIES_META_KEY]);
    if (namespaced) return namespaced;
    const camel = capabilitiesFromUnknown(record.clientCapabilities);
    if (camel) return camel;
  }
  return capabilitiesFromUnknown(approvalServer?.server.getClientCapabilities());
}

function clientCanConfirm(context: ServerContext): boolean {
  const capabilities = declaredCapabilities(context);
  if (!capabilities) return true;
  return hasFormElicitation(capabilities.elicitation);
}

function confirmationSchema(prompt: ConfirmationPrompt) {
  return z.object({
    confirm: z.boolean().meta({
      title: prompt.title,
      description: prompt.description,
    }),
  });
}

function confirmationView(context: ServerContext) {
  try {
    return inputResponse(context.mcpReq.inputResponses, CONFIRM_KEY);
  } catch {
    return { kind: "missing" as const };
  }
}

export function resolveUserConfirmation(
  context: ServerContext,
  prompt: ConfirmationPrompt,
): ConfirmationResolution {
  const view = confirmationView(context);
  if (view.kind === "elicit") {
    if (view.action === "cancel") return { kind: "cancelled" };
    if (view.action !== "accept") return { kind: "declined" };
  }

  const schema = confirmationSchema(prompt);
  const accepted = acceptedContent(context.mcpReq.inputResponses, CONFIRM_KEY, schema);
  if (accepted?.confirm === true) return { kind: "confirmed" };
  if (view.kind === "elicit") return { kind: "declined" };
  if (!clientCanConfirm(context)) return { kind: "unavailable" };

  try {
    return {
      kind: "input_required",
      result: inputRequired({
        inputRequests: {
          confirm: inputRequired.elicit({
            message: prompt.message,
            requestedSchema: schema,
          }),
        },
      }),
    };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function requestOutboundEmailApproval(
  context: ServerContext,
  message: string,
): Promise<ApprovalResult> {
  const resolved = resolveUserConfirmation(context, {
    message,
    title: "Send email",
    description: "Confirm that Paperweight may send this email.",
  });
  if (resolved.kind === "input_required") throw new UserInputRequired(resolved.result);
  return resolved.kind;
}

export function approvalStatus(
  result: Exclude<ApprovalResult, "confirmed">,
): "declined" | "cancelled" | "approval_unavailable" {
  if (result === "cancelled") return "cancelled";
  if (result === "unavailable") return "approval_unavailable";
  return "declined";
}
