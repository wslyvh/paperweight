import { useCallback, useEffect, useMemo, useState } from "react";
import type { VendorPiiSummary, VendorPiiValue } from "@shared/types";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { PII_LABELS, PII_TYPES } from "../utils/piiLabels";

// Failures here are shown verbatim, not passed through errText: an ipcMain.handle
// rejection arrives wrapped ("Error invoking remote method ..."), and the one
// error the service raises (a handle stale after re-analysis) is fixed by the
// same reload these messages ask for.
const LOAD_ERROR = "Could not load what was found in your emails. Reload the page and try again.";
const REVEAL_ERROR = "Could not show the full values. Reload the page and try again.";
const HIDE_ERROR = "Could not hide that value. Reload the page and try again.";
const UNDO_ERROR = "Could not bring that value back. Reload the page and try again.";
const PAGE_SIZE = 25;

type FindingConfidence = "high" | "possible" | "low";

interface ConfidenceTab {
  id: FindingConfidence;
  label: string;
  title: string;
}

const CONFIDENCE_TABS: ConfidenceTab[] = [
  {
    id: "high",
    label: "High",
    title: "Exact account matches and values found across multiple companies",
  },
  {
    id: "possible",
    label: "Possible",
    title: "Other values found in this company’s emails",
  },
  {
    id: "low",
    label: "Low",
    title: "Values with a weaker ownership signal",
  },
];

interface FoundInEmailsProps {
  vendorId: number;
  vendorName: string;
}

interface HiddenValue {
  id: number;
  value: VendorPiiValue;
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

function compareFindings(a: VendorPiiValue, b: VendorPiiValue): number {
  const companyDifference = b.companyCount - a.companyCount;
  if (companyDifference !== 0) return companyDifference;
  if (!!a.isOwnAddress !== !!b.isOwnAddress) {
    return a.isOwnAddress ? -1 : 1;
  }
  const typeOrder = PII_TYPES.indexOf(a.type) - PII_TYPES.indexOf(b.type);
  if (typeOrder !== 0) return typeOrder;
  return b.lastSeen - a.lastSeen;
}

// Concrete data found in this company's mail, masked in the main process.
// Values arrive with an opaque `ref` — the only thing `Not mine` sends back.
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
  const [revealed, setRevealed] = useState<Map<number, string>>();
  const [hidden, setHidden] = useState<HiddenValue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [activeConfidence, setActiveConfidence] = useState<FindingConfidence>();
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setSummary(await window.api.getVendorPiiSummary(vendorId));
    } catch (err) {
      // The user sees fixed copy; devtools gets the real cause. The thrown
      // message names no value — the service raises it before resolving one.
      console.error(err);
      setError(LOAD_ERROR);
    }
  }, [vendorId]);

  const loadRevealed = useCallback(async () => {
    const rows = await window.api.revealVendorPiiValues(vendorId);
    setRevealed(new Map(rows.map((r) => [r.ref, r.value])));
  }, [vendorId]);

  useEffect(() => {
    setHidden([]);
    setRevealed(undefined);
    setError(undefined);
    setActiveConfidence(undefined);
    setPage(1);
    load();
  }, [load]);

  const values = useMemo(() => {
    const rows = summary?.values ?? [];
    return [...rows].sort(compareFindings);
  }, [summary]);

  const valuesByConfidence = useMemo<Record<FindingConfidence, VendorPiiValue[]>>(
    () => {
      const high = values.filter(
        (value) => value.isOwnAddress || value.companyCount > 1,
      );
      const low = values.filter(
        (value) =>
          !value.isOwnAddress &&
          value.companyCount <= 1 &&
          (value.isForeignFormat || value.isFrequentAtCompany),
      );

      return {
        high,
        possible: values.filter(
          (value) =>
            !value.isOwnAddress &&
            value.companyCount <= 1 &&
            !value.isForeignFormat &&
            !value.isFrequentAtCompany,
        ),
        low,
      };
    },
    [values],
  );

  const defaultConfidence =
    CONFIDENCE_TABS.find((tab) => valuesByConfidence[tab.id].length > 0)?.id ??
    "high";
  const currentConfidence =
    activeConfidence && valuesByConfidence[activeConfidence].length > 0
      ? activeConfidence
      : defaultConfidence;
  const currentValues = valuesByConfidence[currentConfidence];
  const totalPages = Math.max(1, Math.ceil(currentValues.length / PAGE_SIZE));
  const pageValues = currentValues.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleReveal = async () => {
    setError(undefined);
    if (revealed) {
      setRevealed(undefined);
      return;
    }
    setBusy(true);
    try {
      await loadRevealed();
    } catch (err) {
      console.error(err);
      setError(REVEAL_ERROR);
    } finally {
      setBusy(false);
    }
  };

  // After a correction the rows change, so anything revealed has to be re-fetched
  // rather than carried over — a stale map would show the wrong value next to a
  // row that has moved.
  const reload = async () => {
    await load();
    if (revealed) await loadRevealed();
  };

  const hideValue = async (value: VendorPiiValue) => {
    setBusy(true);
    setError(undefined);
    try {
      await window.api.suppressPiiFinding(value.ref);
      setHidden((prev) => [...prev, { id: value.ref, value }]);
      await reload();
    } catch (err) {
      console.error(err);
      setError(HIDE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async (hiddenValue: HiddenValue) => {
    setBusy(true);
    setError(undefined);
    try {
      await window.api.unsuppressPiiFinding(hiddenValue.value.ref);
      setHidden((prev) => prev.filter((item) => item.id !== hiddenValue.id));
      await reload();
    } catch (err) {
      console.error(err);
      setError(UNDO_ERROR);
    } finally {
      setBusy(false);
    }
  };

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

  const { scannedMessages } = summary.coverage;

  return (
    <div className="rounded-box bg-base-200 p-2">
      <div className="flex items-start gap-4 px-4 py-3">
        <div className="grow">
          <p className="font-semibold">Personal data</p>
          <p className="text-sm text-base-content/60 mt-1">
            {values.length > 0 ? (
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
        {values.length > 0 && (
          <button className="btn btn-ghost btn-xs shrink-0" disabled={busy} onClick={toggleReveal}>
            {revealed ? "Hide values" : "Show values"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-error px-4 pb-3">{error}</p>}

      <div>
        {values.length > 0 && (
        <div className="flex items-center px-1">
          <div
            role="tablist"
            aria-label="Finding confidence"
            className="tabs tabs-md flex gap-1"
          >
            {CONFIDENCE_TABS.map((tab) => {
              const count = valuesByConfidence[tab.id].length;
              const disabled = count === 0;
              const active = !disabled && currentConfidence === tab.id;

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
                    setActiveConfidence(tab.id);
                    setPage(1);
                  }}
                >
                  {tab.label}
                  {count > 0 ? ` (${count})` : ""}
                </button>
              );
            })}
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

        <div className="mt-2 rounded-box bg-base-100/50 px-4 py-2">
          {pageValues.length === 0 ? (
            <p className="text-sm text-base-content/50 py-2">No data found.</p>
          ) : (
            <div className="divide-y divide-base-content/10">
              {pageValues.map((value) => (
                <div
                  key={value.ref}
                  className="py-2.5 flex items-center gap-3 text-sm min-w-0"
                >
                  <span className="badge badge-sm badge-soft shrink-0 w-32 justify-start">
                    {PII_LABELS[value.type]}
                  </span>
                  <span
                    className={`font-mono truncate grow min-w-0 ${
                      value.isOwnAddress ? "font-semibold text-primary" : ""
                    }`}
                  >
                    {revealed?.get(value.ref) ?? value.maskedValue}
                  </span>
                  {value.isOwnAddress && (
                    <span className="badge badge-xs badge-primary badge-soft shrink-0">
                      Exact match
                    </span>
                  )}
                  {value.companyCount > 1 && (
                    <span className="badge badge-xs badge-soft shrink-0">
                      Found elsewhere
                    </span>
                  )}
                  <button
                    className="btn btn-outline btn-xs gap-1 shrink-0"
                    disabled={busy}
                    onClick={() => hideValue(value)}
                  >
                    <X className="w-3 h-3" />
                    Not mine
                  </button>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex justify-end border-t border-base-content/10 pt-2">
              <FindingPagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </div>

      {hidden.length > 0 && (
        <div className="space-y-1 px-4 py-3">
          {hidden.map((hiddenValue) => (
            <div
              key={hiddenValue.id}
              className="flex items-center gap-2 text-sm text-base-content/50"
            >
              <span>
                Hidden {PII_LABELS[hiddenValue.value.type].toLowerCase()}{" "}
                {hiddenValue.value.maskedValue}.
              </span>
              <button
                className="btn btn-ghost btn-xs"
                disabled={busy}
                onClick={() => handleUndo(hiddenValue)}
              >
                Undo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
