import type { GdprCaseSummary } from "@shared/types";
import { formatRelativeDate } from "@shared/formatting";
import { ChevronRight } from "lucide-react";
import { CaseStatusBadge, CaseRequestBadge } from "./CaseBadges";

/**
 * A single case row — shared by the Cases list and the account's Cases tab.
 * `primary` is the leading label (vendor name on the global list, request type
 * on a vendor's own tab where the vendor is already implied).
 */
export function CaseListRow({
  item,
  primary,
  onOpen,
}: {
  item: GdprCaseSummary;
  primary: string;
  onOpen: () => void;
}): JSX.Element {
  return (
    <div className="card bg-base-200 overflow-visible rounded-2xl">
      <button
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-base-300 transition-colors rounded-2xl cursor-pointer"
        onClick={onOpen}
      >
        <span className="font-medium truncate flex-1 min-w-0">{primary}</span>
        {item.hasUnseenReply && (
          <span className="badge badge-xs badge-error shrink-0" aria-label="New reply">
            New
          </span>
        )}
        <CaseStatusBadge item={item} />
        <CaseRequestBadge requestType={item.requestType} />
        <span className="text-sm text-base-content/60 tabular-nums shrink-0 w-24 text-right">
          {formatRelativeDate(item.closedAt ?? item.openedAt)}
        </span>
        <ChevronRight
          className="w-5 h-5 text-base-content/30 shrink-0"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
