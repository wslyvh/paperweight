import type { GdprCaseSummary, GdprRequestType } from "@shared/types";
import {
  CASE_ACTION_LABELS,
  CASE_ACTION_BADGES,
  CASE_CLOSED_BADGE,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_BADGES,
} from "../utils/activityLabels";

// Active case → its next-action nudge badge (nothing when no action is due);
// closed case → a neutral "Closed" badge. Shared by the Cases list and the
// account's Cases tab so the two never drift.
export function CaseStatusBadge({ item }: { item: GdprCaseSummary }) {
  if (item.status === "active") {
    if (!item.nextAction) return null;
    return (
      <span className={`badge badge-xs badge-soft shrink-0 ${CASE_ACTION_BADGES[item.nextAction]}`}>
        {CASE_ACTION_LABELS[item.nextAction]}
      </span>
    );
  }
  return <span className={`badge badge-xs shrink-0 ${CASE_CLOSED_BADGE}`}>Closed</span>;
}

export function CaseRequestBadge({
  requestType,
}: {
  requestType: GdprRequestType;
}) {
  return (
    <span className={`badge badge-xs shrink-0 ${REQUEST_TYPE_BADGES[requestType]}`}>
      {REQUEST_TYPE_LABELS[requestType]}
    </span>
  );
}
