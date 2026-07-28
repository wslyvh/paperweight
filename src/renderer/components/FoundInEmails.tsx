import { useCallback, useEffect, useMemo, useState } from "react";
import type { VendorPiiSummary } from "@shared/types";
import { ChevronLeft, ChevronRight, Eye, EyeClosed } from "lucide-react";
import {
  CONFIDENCE_OPTIONS,
  compareFindings,
  groupByConfidence,
} from "../utils/piiConfidence";
import type { FindingConfidence } from "../utils/piiConfidence";
import { usePiiValueActions } from "../hooks/usePiiValueActions";
import PiiValueList from "./PiiValueList";

const PAGE_SIZE = 25;
type FindingTab = FindingConfidence | "suppressed";

interface FoundInEmailsProps {
  vendorId: number;
  vendorName: string;
}

interface FindingPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function FindingPagination({
  page,
  totalPages,
  onPageChange,
}: FindingPaginationProps): JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <button
        className="btn btn-sm btn-ghost btn-circle"
        aria-label="Previous findings page"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm tabular-nums text-base-content/60 px-1">
        {page} / {totalPages}
      </span>
      <button
        className="btn btn-sm btn-ghost btn-circle"
        aria-label="Next findings page"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// Concrete data found in this company's mail, masked in the main process.
// Values arrive with an opaque `ref` — the only thing either review action
// sends back.
//
// Reviewing a masked list is guesswork, so there is one deliberate exception to
// the masking rule: the reveal toggle fetches full values over its own channel.
// They live in this component's state while the toggle is on and are dropped the
// moment it goes off — never stored, never logged, never in the summary payload.
export default function FoundInEmails({
  vendorId,
  vendorName,
}: FoundInEmailsProps): JSX.Element {
  const [summary, setSummary] = useState<VendorPiiSummary>();
  const [activeTab, setActiveTab] = useState<FindingTab>();
  const [page, setPage] = useState(1);

  const loadValues = useCallback(async () => {
    setSummary(await window.api.getVendorPiiSummary(vendorId));
  }, [vendorId]);
  const revealValues = useCallback(() => {
    return window.api.revealVendorPiiValues(vendorId);
  }, [vendorId]);
  const {
    busy,
    error,
    revealed,
    confirmValues,
    load,
    reset,
    showValues,
    suppressValues,
    toggleReveal,
  } = usePiiValueActions({ loadValues, revealValues });

  useEffect(() => {
    reset();
    setActiveTab(undefined);
    setPage(1);
    void load();
  }, [load, reset]);

  useEffect(() => {
    const unsub = window.api.onSyncProgress((status) => {
      if (!status.running) void load();
    });
    return unsub;
  }, [load]);

  const values = useMemo(() => {
    const rows = summary?.values ?? [];
    return [...rows].sort(compareFindings);
  }, [summary]);
  const suppressedValues = useMemo(() => {
    const rows = summary?.suppressedValues ?? [];
    return [...rows].sort(compareFindings);
  }, [summary]);

  const valuesByConfidence = useMemo(() => groupByConfidence(values), [values]);

  const defaultTab: FindingTab =
    CONFIDENCE_OPTIONS.find((tab) => valuesByConfidence[tab.id].length > 0)?.id ??
    (suppressedValues.length > 0 ? "suppressed" : "high");
  let currentTab = defaultTab;
  if (activeTab === "suppressed" && suppressedValues.length > 0) {
    currentTab = activeTab;
  } else if (
    activeTab &&
    activeTab !== "suppressed" &&
    valuesByConfidence[activeTab].length > 0
  ) {
    currentTab = activeTab;
  }
  const currentValues =
    currentTab === "suppressed"
      ? suppressedValues
      : valuesByConfidence[currentTab];
  const totalPages = Math.max(1, Math.ceil(currentValues.length / PAGE_SIZE));
  const pageValues = currentValues.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (!summary) {
    return (
      <div className="rounded-box bg-base-200 p-2">
        <div className="px-4 py-3">
          <p className="font-semibold">Personal data</p>
          <p className="text-sm text-base-content/50 mt-1">Loading...</p>
        </div>
      </div>
    );
  }

  const { scannedMessages } = summary;
  const totalValues = values.length + suppressedValues.length;

  return (
    <div className="rounded-box bg-base-200 p-2">
      <div className="flex items-start gap-4 px-4 py-3">
        <div className="grow">
          <p className="font-semibold">Personal data</p>
          <p className="text-sm text-base-content/60 mt-1">
            {totalValues > 0 ? (
              <>
                Found while scanning {scannedMessages}{" "}
                {scannedMessages === 1 ? "email" : "emails"} from {vendorName}. This
                may be incomplete (attachments and sent mail aren&apos;t included)
                and doesn&apos;t mean the company still stores it.
              </>
            ) : (
              <>
                Scanned {scannedMessages}{" "}
                {scannedMessages === 1 ? "email" : "emails"} from {vendorName}.
                Attachments and sent mail aren&apos;t included.
              </>
            )}
          </p>
        </div>
        {totalValues > 0 && (
          <button
            className="btn btn-sm btn-ghost btn-circle shrink-0"
            title={showValues ? "Hide values" : "Show values"}
            aria-label={showValues ? "Hide values" : "Show values"}
            disabled={busy}
            onClick={toggleReveal}
          >
            {showValues ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeClosed className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-error px-4 pb-3">{error}</p>}

      <div>
        {totalValues > 0 && (
          <div className="flex items-center px-1">
            <div
              role="tablist"
              aria-label="Finding status and confidence"
              className="tabs tabs-md flex gap-1"
            >
              {CONFIDENCE_OPTIONS.map((tab) => {
                const count = valuesByConfidence[tab.id].length;
                const disabled = count === 0;
                const active = !disabled && currentTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={active}
                    title={tab.title}
                    disabled={disabled}
                    className={`tab rounded-lg transition-colors ${
                      active
                        ? "tab-active bg-base-100 shadow-sm"
                        : "text-base-content/50 hover:bg-base-100/50 hover:text-base-content/80"
                    }`}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setPage(1);
                    }}
                  >
                    {tab.label}
                    {count > 0 ? ` (${count})` : ""}
                  </button>
                );
              })}
              <button
                role="tab"
                aria-selected={currentTab === "suppressed"}
                title="Values you marked as not yours"
                disabled={suppressedValues.length === 0}
                className={`tab rounded-lg transition-colors ${
                  currentTab === "suppressed"
                    ? "tab-active bg-base-100 shadow-sm"
                    : "text-base-content/50 hover:bg-base-100/50 hover:text-base-content/80"
                }`}
                onClick={() => {
                  setActiveTab("suppressed");
                  setPage(1);
                }}
              >
                Not mine
                {suppressedValues.length > 0
                  ? ` (${suppressedValues.length})`
                  : ""}
              </button>
            </div>
            <div className="ml-auto">
              <FindingPagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          </div>
        )}

        <div className="mt-2">
          {pageValues.length === 0 ? (
            <p className="text-sm text-base-content/50 px-4 py-2">No data found.</p>
          ) : (
            <PiiValueList
              values={pageValues}
              revealed={revealed}
              busy={busy}
              mode={currentTab === "suppressed" ? "suppressed" : "active"}
              onConfirm={confirmValues}
              onSuppress={
                currentTab === "suppressed" ? undefined : suppressValues
              }
            />
          )}

          {totalPages > 1 && (
            <div className="flex justify-end pt-2">
              <FindingPagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
