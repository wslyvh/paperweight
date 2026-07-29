import type { ActivityEntry, GdprCaseAction, GdprCaseOutcome, GdprRequestType } from "@shared/types";

export const ACTION_LABELS: Record<ActivityEntry["actionType"], string> = {
  unsubscribed: "Unsubscribed",
  trashed: "Moved to trash",
  spam_reported: "Reported spam",
  gdpr_request_sent: "GDPR request sent",
  reminder_sent: "Reminder sent",
  followup_sent: "Follow-up sent",
  reply_received: "Reply received",
  case_message_linked: "Added to case",
  escalated: "Escalated to authority",
  case_closed: "Case closed",
};

export const ACTION_COLORS: Record<ActivityEntry["actionType"], string> = {
  unsubscribed: "text-success",
  trashed: "text-base-content/50",
  spam_reported: "text-warning",
  gdpr_request_sent: "text-primary",
  reminder_sent: "text-primary",
  followup_sent: "text-primary",
  reply_received: "text-success",
  case_message_linked: "text-success",
  escalated: "text-warning",
  case_closed: "text-success",
};

export const CASE_ACTION_LABELS: Record<GdprCaseAction, string> = {
  reminder: "Reminder",
  followup: "Follow-up",
  escalate: "Escalation",
};

export const CASE_ACTION_BADGES: Record<GdprCaseAction, string> = {
  reminder: "badge-info",
  followup: "badge-warning",
  escalate: "badge-error",
};

export const REQUEST_TYPE_LABELS: Record<GdprRequestType, string> = {
  access: "Data access",
  deletion: "Data deletion",
};

/** Semantic classes — see global.css for contrast-safe colors. */
export const REQUEST_TYPE_BADGES: Record<GdprRequestType, string> = {
  access: "badge-request-access",
  deletion: "badge-request-deletion",
};

export const CASE_CLOSED_BADGE = "badge-soft";

export const CASE_OUTCOME_LABELS: Record<GdprCaseOutcome, string> = {
  resolved: "Resolved",
  escalated: "Escalated",
};

export function gdprRequestLabel(requestType: GdprRequestType): string {
  return requestType === "access" ? "Data access request" : "Data deletion request";
}

function gdprRequestSentLabel(requestType: GdprRequestType): string {
  return requestType === "access" ? "Data access request sent" : "Data deletion request sent";
}

function caseClosedLabel(outcome?: GdprCaseOutcome): string {
  if (!outcome) return "Case closed";
  return `Case closed — ${CASE_OUTCOME_LABELS[outcome]}`;
}

/** Single source of truth for how an activity/case event is labelled. */
export function activityEntryLabel(entry: ActivityEntry): string {
  if (entry.actionType === "gdpr_request_sent" && entry.caseRequestType) {
    return gdprRequestSentLabel(entry.caseRequestType);
  }
  if (entry.actionType === "case_closed") {
    return caseClosedLabel(entry.caseOutcome);
  }
  return ACTION_LABELS[entry.actionType];
}
