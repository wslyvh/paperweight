import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PiiCompanyOrder, PiiValue, PiiValueCompany } from "@shared/types";
import { formatRelativeDate } from "@shared/formatting";
import { ArrowDown, ArrowUp, ChevronRight, CircleCheck, CircleX } from "lucide-react";
import ActionModal from "./ActionModal";
import { PII_LABELS } from "../utils/piiLabels";

// The list of found values, shared verbatim by the Personal Data page and the
// Account Detail "Personal data" panel: same rows, same selection toolbar, same
// expansion. Everything above it (search, filters, tabs, pagination) belongs to
// the surface; everything about a value belongs here.

// checkbox · chevron · data type · value · hover action · badges
const ROW_GRID =
  "grid grid-cols-[24px_20px_72px_minmax(0,1fr)_auto_176px] items-center gap-3";

/** What the value's own list says about it, and what the action does to it. */
type PiiListMode = "active" | "suppressed";

// The value's factual signals. The company count is the number of distinct
// companies holding this exact value, which is what expanding the row lists.
interface PiiValueBadgesProps {
  value: PiiValue;
}

function PiiValueBadges({ value }: PiiValueBadgesProps): JSX.Element | null {
  if (!value.isMatch && value.companyCount <= 1) return null;
  return (
    <>
      {value.isMatch && (
        <span className="badge badge-xs badge-primary badge-soft shrink-0">Match</span>
      )}
      {value.companyCount > 1 && (
        <span className="badge badge-xs badge-soft shrink-0 tabular-nums">
          {value.companyCount} companies
        </span>
      )}
    </>
  );
}

interface PiiValueListProps {
  values: PiiValue[];
  /** Full values, present only while the surface's reveal toggle is on. */
  revealed?: Map<number, string>;
  busy: boolean;
  mode?: PiiListMode;
  /** Add reviewed values to the global profile. */
  onConfirm: (values: PiiValue[]) => void | Promise<void>;
  /** Mark active values `Not mine`. Suppressed lists only offer confirmation. */
  onSuppress?: (values: PiiValue[]) => void | Promise<void>;
}

export default function PiiValueList({
  values,
  revealed,
  busy,
  mode = "active",
  onConfirm,
  onSuppress,
}: PiiValueListProps): JSX.Element {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [companies, setCompanies] = useState<Map<string, PiiValueCompany[]>>(new Map());
  const [companyOrder, setCompanyOrder] = useState<PiiCompanyOrder>("recent");
  const [bulkAction, setBulkAction] = useState<"confirm" | "suppress">();

  const restoring = mode === "suppressed";

  // A confirmed value cannot be marked Not mine. Removing it from the profile
  // is the explicit way to reverse that assertion.
  const selectable = values.filter((value) => !value.isMatch);
  const allSelected =
    selectable.length > 0 && selectable.every((v) => selected.has(v.ref));
  const someSelected = values.some((v) => selected.has(v.ref));
  const selectedValues = values.filter((v) => selected.has(v.ref));

  const companyKey = (ref: number, order: PiiCompanyOrder): string => `${ref}|${order}`;

  const loadCompanies = async (ref: number, order: PiiCompanyOrder) => {
    if (companies.has(companyKey(ref, order))) return;
    const rows = await window.api.getPiiValueCompanies(ref, order);
    setCompanies((prev) => new Map(prev).set(companyKey(ref, order), rows));
  };

  const toggleExpand = async (value: PiiValue) => {
    const next = new Set(expanded);
    if (next.has(value.ref)) {
      next.delete(value.ref);
      setExpanded(next);
      return;
    }
    next.add(value.ref);
    setExpanded(next);
    await loadCompanies(value.ref, companyOrder);
  };

  const toggleCompanyOrder = async () => {
    const next: PiiCompanyOrder = companyOrder === "recent" ? "oldest" : "recent";
    setCompanyOrder(next);
    for (const ref of expanded) await loadCompanies(ref, next);
  };

  const runAction = async (
    targets: PiiValue[],
    action: "confirm" | "suppress",
  ) => {
    if (action === "confirm") await onConfirm(targets);
    else await onSuppress?.(targets);
    const targetRefs = new Set(targets.map((value) => value.ref));
    setSelected((previous) => new Set(
      [...previous].filter((ref) => !targetRefs.has(ref)),
    ));
    setExpanded((previous) => new Set(
      [...previous].filter((ref) => !targetRefs.has(ref)),
    ));
    setCompanies((previous) => {
      const next = new Map(previous);
      for (const ref of targetRefs) {
        next.delete(companyKey(ref, "recent"));
        next.delete(companyKey(ref, "oldest"));
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {/* Select-all / actions bar */}
      <div className={`${ROW_GRID} px-4 py-1 rounded-xl bg-base-300`}>
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={allSelected}
          disabled={selectable.length === 0}
          ref={(el) => {
            if (el) el.indeterminate = someSelected && !allSelected;
          }}
          onChange={(e) => {
            const next = new Set(selected);
            // Selecting adds only what a sweep may touch; clearing clears
            // everything shown, including a deliberate pick.
            if (e.target.checked) for (const v of selectable) next.add(v.ref);
            else for (const v of values) next.delete(v.ref);
            setSelected(next);
          }}
        />
        {/* Separator, mirroring the chevron slot without implying expandability */}
        <div className="flex items-center justify-center">
          <div className="w-px h-3 bg-base-content/20" />
        </div>
        <div className="col-span-2 flex items-center gap-1">
          <button
            className="btn btn-ghost btn-sm btn-square tooltip text-base-content/50 hover:bg-base-content/10 hover:text-base-content/80 disabled:opacity-25"
            data-tip="It's mine"
            aria-label="It's mine"
            disabled={busy || selected.size === 0}
            onClick={() => setBulkAction("confirm")}
          >
            <CircleCheck className="w-4 h-4" strokeWidth={1.5} />
          </button>
          {!restoring && (
            <button
              className="btn btn-ghost btn-sm btn-square tooltip text-base-content/50 hover:bg-base-content/10 hover:text-base-content/80 disabled:opacity-25"
              data-tip="Not mine"
              aria-label="Not mine"
              disabled={busy || selected.size === 0}
              onClick={() => setBulkAction("suppress")}
            >
              <CircleX className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
          {selected.size > 0 && (
            <span className="text-sm tabular-nums whitespace-nowrap text-base-content/50 ml-1">
              {selected.size} selected
            </span>
          )}
        </div>
        <div />
        <div />
      </div>

      {values.map((value) => {
        const isExpanded = expanded.has(value.ref);
        const valueCompanies = companies.get(companyKey(value.ref, companyOrder));

        return (
          <div key={value.ref} className="card bg-base-200 overflow-visible rounded-2xl">
            <div
              className={`group p-4 cursor-pointer hover:bg-base-300 transition-colors ${
                isExpanded ? "rounded-t-2xl" : "rounded-2xl"
              }`}
              onClick={() => toggleExpand(value)}
            >
              <div className={`${ROW_GRID} w-full`}>
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={selected.has(value.ref)}
                  disabled={!restoring && value.isMatch}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(value.ref);
                    else next.delete(value.ref);
                    setSelected(next);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />

                <ChevronRight
                  className={`w-5 h-5 text-base-content/50 shrink-0 transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />

                <span className="badge badge-sm badge-soft justify-start">
                  {PII_LABELS[value.type]}
                </span>

                <span
                  className={`font-mono text-sm truncate min-w-0 ${
                    value.isMatch ? "font-semibold text-primary" : ""
                  }`}
                >
                  {revealed?.get(value.ref) ?? value.maskedValue}
                </span>

                <div
                  className={`flex items-center gap-2 transition-opacity ${
                    isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span
                    className="tooltip tooltip-top"
                    data-tip={value.isMatch ? "Already in your profile" : "It's mine"}
                  >
                    <button
                      className="btn btn-ghost btn-sm btn-square text-base-content/50 hover:bg-base-content/10 hover:text-base-content/80"
                      aria-label="It's mine"
                      disabled={busy || value.isMatch}
                      onClick={() => runAction([value], "confirm")}
                    >
                      <CircleCheck className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  </span>
                  {!restoring && (
                    <span
                      className="tooltip tooltip-top"
                      data-tip={
                        value.isMatch
                          ? "Remove this value from your profile first"
                          : "Not mine"
                      }
                    >
                      <button
                        className="btn btn-ghost btn-sm btn-square text-base-content/50 hover:bg-base-content/10 hover:text-base-content/80"
                        aria-label="Not mine"
                        disabled={busy || value.isMatch}
                        onClick={() => runAction([value], "suppress")}
                      >
                        <CircleX className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    </span>
                  )}
                </div>

                <div className="flex gap-1 justify-end">
                  <PiiValueBadges value={value} />
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-base-300 bg-base-300/50 rounded-b-2xl">
                <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                  <span className="text-sm font-medium text-base-content/60">
                    Found at {value.companyCount}{" "}
                    {value.companyCount === 1 ? "company" : "companies"}
                  </span>
                  <button
                    className="btn btn-ghost btn-xs ml-auto text-base-content/50 gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCompanyOrder();
                    }}
                  >
                    {companyOrder === "recent" ? "Most recent" : "Oldest"}
                    {companyOrder === "recent" ? (
                      <ArrowDown className="w-3 h-3" strokeWidth={2} />
                    ) : (
                      <ArrowUp className="w-3 h-3" strokeWidth={2} />
                    )}
                  </button>
                </div>
                {valueCompanies === undefined ? (
                  <div className="p-4 flex justify-center">
                    <span className="loading loading-spinner loading-sm"></span>
                  </div>
                ) : valueCompanies.length === 0 ? (
                  <div className="p-4 text-center text-base-content/50">
                    No companies found
                  </div>
                ) : (
                  <div className="divide-y divide-base-300">
                    {valueCompanies.map((company) => (
                      <div
                        key={company.groupKey}
                        className="px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-base-300 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/accounts/${encodeURIComponent(company.groupKey)}`);
                        }}
                      >
                        <span className="text-sm text-base-content/50 shrink-0 w-24">
                          {formatRelativeDate(company.lastSeen)}
                        </span>
                        <span className="text-sm truncate">{company.name}</span>
                        <ChevronRight
                          className="w-4 h-4 text-base-content/30 shrink-0 ml-auto"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {bulkAction && (
        <ActionModal
          isOpen
          title={bulkAction === "confirm" ? "It's mine" : "Not mine"}
          confirmLabel={bulkAction === "confirm" ? "Add to profile" : "Remove"}
          confirmVariant="primary"
          onConfirm={async () => {
            const action = bulkAction;
            setBulkAction(undefined);
            await runAction(selectedValues, action);
          }}
          onCancel={() => setBulkAction(undefined)}
          loading={busy}
        >
          <p>
            {bulkAction === "confirm" ? (
              <>
                {selectedValues.length}{" "}
                {selectedValues.length === 1 ? "value is" : "values are"} your personal
                data. {selectedValues.length === 1 ? "It" : "They"} will be added to
                your profile and shown as a match everywhere.
              </>
            ) : (
              <>
                {selectedValues.length}{" "}
                {selectedValues.length === 1 ? "value is" : "values are"} not your
                personal data. They move to the Not mine list for every company that
                holds them.
              </>
            )}
          </p>
        </ActionModal>
      )}
    </div>
  );
}
