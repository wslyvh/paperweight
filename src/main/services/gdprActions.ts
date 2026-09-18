import { detectLanguageFromDomain } from "@shared/gdpr/resolution";
import {
  isNoReplyEmail,
  pickGdprContactEmail,
} from "@shared/gdpr/contact";
import {
  buildAccessEmail,
  buildDeletionEmail,
  buildFollowupEmail,
  buildReminderEmail,
} from "@shared/gdpr/templates";
import type { GdprRequestType } from "@shared/types";
import {
  createGdprCase,
  getGdprCaseById,
  insertGdprCaseEvent,
  queryGdprCases,
} from "./cases";
import { sendEmail } from "./email";
import { getSetting } from "./settings";
import { getVendorDetail, updateVendor } from "./vendors";

export interface PrivacyRequestResult {
  status:
    | "sent"
    | "failed"
    | "sent_case_failed"
    | "no_recipient"
    | "active_case_exists"
    | "declined"
    | "cancelled"
    | "approval_unavailable";
  caseId?: number;
}

export interface CaseMessageResult {
  status:
    | "sent"
    | "failed"
    | "sent_event_failed"
    | "not_available"
    | "declined"
    | "cancelled"
    | "approval_unavailable";
}

export type OutboundEmailApprovalResult =
  | "confirmed"
  | "declined"
  | "cancelled"
  | "unavailable";

export interface OutboundEmailApprovalRequest {
  companyName: string;
  recipient: string;
  action: "access" | "deletion" | "reminder" | "followup";
}

export type RequestOutboundEmailApproval = (
  request: OutboundEmailApprovalRequest,
) => Promise<OutboundEmailApprovalResult>;

function approvalStatus(
  result: Exclude<OutboundEmailApprovalResult, "confirmed">,
): "declined" | "cancelled" | "approval_unavailable" {
  if (result === "cancelled") return "cancelled";
  if (result === "unavailable") return "approval_unavailable";
  return "declined";
}

export async function sendPrivacyRequest(
  vendorId: number,
  companyKey: string,
  requestType: GdprRequestType,
  mailboxEmail: string,
  recipientOverride?: string,
  accountIdentifier?: string,
  languageOverride?: string,
  requestApproval?: RequestOutboundEmailApproval,
): Promise<PrivacyRequestResult> {
  const detail = getVendorDetail(companyKey);
  if (detail.vendor.id !== vendorId) throw new Error("Company changed while preparing request");
  const hasActiveCase = queryGdprCases({ status: "active", vendorId })
    .some((item) => item.requestType === requestType);
  if (hasActiveCase) return { status: "active_case_exists" };
  const recipient = recipientOverride
    ?? pickGdprContactEmail(detail.company, detail.senders);
  if (!recipient || isNoReplyEmail(recipient)) return { status: "no_recipient" };

  const requester = detail.vendor.account_email
    ?? detail.receivedAddresses[0]?.address
    ?? mailboxEmail;
  const language = languageOverride
    ?? detectLanguageFromDomain(detail.vendor.root_domain ?? undefined);
  const userName = getSetting("userName") || undefined;
  const message = requestType === "access"
    ? buildAccessEmail(requester, accountIdentifier, language, userName)
    : buildDeletionEmail(requester, accountIdentifier, language, userName);

  if (!requestApproval) return { status: "approval_unavailable" };
  const approval = await requestApproval({
    companyName: detail.vendor.name || detail.vendor.root_domain || companyKey,
    recipient,
    action: requestType,
  });
  if (approval !== "confirmed") return { status: approvalStatus(approval) };

  if (detail.vendor.account_email !== requester) {
    updateVendor(vendorId, { account_email: requester });
  }
  const sent = await sendEmail(recipient, message.subject, message.body);
  if (!sent.success) return { status: "failed" };

  try {
    const created = createGdprCase({
      vendorId,
      requestType,
      recipientEmail: recipient,
      sentMessageId: sent.messageId,
      subject: message.subject,
      body: message.body,
    });
    return { status: "sent", caseId: created.id };
  } catch {
    return { status: "sent_case_failed" };
  }
}

export async function sendCaseMessage(
  caseId: number,
  action: "reminder" | "followup",
  mailboxEmail: string,
  requestApproval?: RequestOutboundEmailApproval,
): Promise<CaseMessageResult> {
  const detail = getGdprCaseById(caseId);
  if (
    !detail
    || detail.status !== "active"
    || detail.nextAction !== action
    || !detail.recipientEmail
  ) {
    return { status: "not_available" };
  }

  const original = [...detail.events]
    .reverse()
    .find((event) => event.actionType === "gdpr_request_sent");
  const language = detectLanguageFromDomain(detail.vendorDomain);
  const userName = getSetting("userName") || undefined;
  const build = action === "reminder" ? buildReminderEmail : buildFollowupEmail;
  const message = build(
    original?.subject,
    detail.requestType,
    detail.openedAt,
    detail.accountEmail || mailboxEmail,
    language,
    userName,
  );
  if (!requestApproval) return { status: "approval_unavailable" };
  const approval = await requestApproval({
    companyName: detail.vendorName,
    recipient: detail.recipientEmail,
    action,
  });
  if (approval !== "confirmed") return { status: approvalStatus(approval) };
  const sent = await sendEmail(
    detail.recipientEmail,
    message.subject,
    message.body,
    detail.sentMessageId,
  );
  if (!sent.success) return { status: "failed" };

  try {
    insertGdprCaseEvent(
      caseId,
      action === "reminder" ? "reminder_sent" : "followup_sent",
      { subject: message.subject, body: message.body },
    );
    return { status: "sent" };
  } catch {
    return { status: "sent_event_failed" };
  }
}
