import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PiiOverview, PiiValue } from "@shared/types";
import {
  CONFIDENCE_OPTIONS,
  PII_LABELS,
  PII_TYPES,
  queryPiiOverview,
} from "@shared/pii-query";
import type { PiiSort, PiiValueFilter } from "@shared/pii-query";
import {
  ArrowUpDown,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeClosed,
  SlidersHorizontal,
} from "lucide-react";
import FilterGroup from "../components/FilterGroup";
import PiiValueList from "../components/PiiValueList";
import { usePiiValueActions } from "../hooks/usePiiValueActions";

const SORT_OPTIONS: Array<{ value: PiiSort; label: string }> = [
  { value: "evidence", label: "Evidence" },
  { value: "last_seen", label: "Latest" },
  { value: "last_seen_asc", label: "Oldest" },
  { value: "type", label: "Type" },
];

const DEFAULT_SORT = "evidence";
const PAGE_SIZE = 25;
const EMPTY_VALUES: PiiValue[] = [];
const EMPTY_OVERVIEW: PiiOverview = { values: [], suppressedValues: [] };

/** The row-2 filters, which are three separate axes: the user's own correction
 *  (Not mine), a confirmed identity match, and the confidence buckets. */
type ValueFilter = PiiValueFilter;

export default function Data(): JSX.Element {
  const [overview, setOverview] = useState<PiiOverview>();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<PiiSort>(DEFAULT_SORT);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ValueFilter>("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showSort, setShowSort] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const sortRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const suppressed = overview?.suppressedValues ?? EMPTY_VALUES;

  const loadValues = useCallback(async () => {
    setOverview(await window.api.getPiiOverview());
  }, []);
  const revealValues = useCallback(() => {
    return window.api.revealPiiValues();
  }, []);
  const {
    busy,
    error,
    revealed,
    confirmValues,
    load,
    showValues,
    suppressValues,
    toggleReveal,
  } = usePiiValueActions({ loadValues, revealValues });

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Sync analyzes new mail in the background. Without this the list stays stale
  // for a user already sitting on the page when it finishes.
  useEffect(() => {
    const unsub = window.api.onSyncProgress((status) => {
      if (!status.running) load();
    });
    return unsub;
  }, [load]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (showSort && sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSort(false);
      }
      if (showFilters && filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSort, showFilters]);

  const showingSuppressed = filter === "suppressed";

  const queryResult = useMemo(() => queryPiiOverview(
    overview ?? EMPTY_OVERVIEW,
    {
      page,
      limit: PAGE_SIZE,
      search,
      filter,
      type: typeFilter ? typeFilter as PiiValue["type"] : undefined,
      sort: sortBy,
    },
    revealed,
  ), [filter, overview, page, revealed, search, sortBy, typeFilter]);

  const total = queryResult.total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // A shrinking result set can leave page past the last one; snap back so we
  // never show an empty list while matches exist on an earlier page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pageValues = queryResult.items;

  const hasAnyFilter = !!(
    search || filter || typeFilter || sortBy !== DEFAULT_SORT || page > 1
  );

  function clearAll() {
    setSearch("");
    setFilter("");
    setTypeFilter("");
    setSortBy(DEFAULT_SORT);
    setPage(1);
  }

  function selectFilter(next: ValueFilter) {
    setFilter((prev) => (prev === next ? "" : next));
    setPage(1);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  const nothingFound = (overview?.values.length ?? 0) === 0 && suppressed.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Personal Data</h1>
        <p className="text-sm text-base-content/50 mt-1">
          Personal data found in your emails. This may be incomplete (attachments and
          sent mail aren&apos;t included) and finding a value doesn&apos;t mean a
          company still stores it.
        </p>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {nothingFound ? (
        <div className="card bg-base-200">
          <div className="card-body text-center text-sm text-base-content/60">
            <p>
              No personal data found yet. Paperweight only scans mail it has already
              synced, so sync to see more.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Row 1 — toolbar */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search..."
              className="input input-sm input-bordered w-48"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />

            <span className="text-sm text-base-content/60 shrink-0">
              {total} {total !== 1 ? "values" : "value"}
            </span>

            {hasAnyFilter && (
              <button className="badge badge-sm badge-ghost cursor-pointer" onClick={clearAll}>
                clear all
              </button>
            )}

            {/* Inline pagination */}
            <div className="flex items-center gap-1 ml-auto">
              <button
                className="btn btn-sm btn-ghost btn-circle"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm tabular-nums text-base-content/60 px-1">
                {page} / {totalPages}
              </span>
              <button
                className="btn btn-sm btn-ghost btn-circle"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Sort dropdown */}
            <div className="relative" ref={sortRef}>
              <button className="btn btn-sm btn-ghost btn-circle" onClick={() => setShowSort(s => !s)}>
                <ArrowUpDown className="w-4 h-4" />
              </button>
              {showSort && (
                <div className="absolute right-0 top-full z-20 bg-base-200 rounded-xl shadow-lg mt-1 py-1 min-w-36">
                  {SORT_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-base-300 transition-colors ${sortBy === o.value ? "font-medium text-base-content" : "text-base-content/60"
                        }`}
                      onClick={() => { setSortBy(o.value); setPage(1); setShowSort(false); }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter dropdown */}
            <div className="relative" ref={filterRef}>
              <button className="btn btn-sm btn-ghost btn-circle" onClick={() => setShowFilters(f => !f)}>
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              {showFilters && (
                <div className="absolute right-0 top-full z-20 bg-base-200 rounded-xl shadow-lg mt-1 p-4 min-w-64 space-y-3">
                  <FilterGroup
                    label="Data type"
                    options={PII_TYPES}
                    labels={PII_TYPES.map(t => PII_LABELS[t])}
                    value={typeFilter}
                    onChange={v => { setTypeFilter(v); setPage(1); }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Row 2 — state + confidence filters, then reveal */}
          <div className="flex items-center gap-2">
            <button
              className={`badge badge-sm cursor-pointer gap-1 ${
                filter === "exact" ? "badge-accent" : "badge-soft badge-accent"
              }`}
              title="Values confirmed to be yours"
              onClick={() => selectFilter("exact")}
            >
              <BadgeCheck className="w-3 h-3" />
              Match
            </button>

            <button
              className={`badge badge-sm cursor-pointer ${
                filter === "unclassified" ? "badge-accent" : "badge-soft badge-accent"
              }`}
              title="Values not yet marked mine or not mine"
              onClick={() => selectFilter("unclassified")}
            >
              Unclassified
            </button>

            <div className="w-px h-3 bg-base-content/20" />

            {CONFIDENCE_OPTIONS.map((option) => (
              <button
                key={option.id}
                title={option.title}
                className={`badge badge-sm cursor-pointer ${
                  filter === option.id ? "badge-accent" : "badge-soft badge-accent"
                }`}
                onClick={() => selectFilter(option.id)}
              >
                {option.label}
              </button>
            ))}

            <button
              className={`badge badge-sm cursor-pointer ${
                showingSuppressed ? "badge-accent" : "badge-soft badge-accent"
              }`}
              title="Values you marked as not yours"
              onClick={() => selectFilter("suppressed")}
            >
              Not mine
            </button>

            <button
              className="btn btn-sm btn-ghost btn-circle ml-auto"
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
          </div>

          {pageValues.length === 0 ? (
            <div className="card bg-base-200">
              <div className="card-body text-center text-sm text-base-content/60">
                <p>
                  {showingSuppressed
                    ? "You haven't marked anything as not yours."
                    : "No values match your search or filters."}
                </p>
              </div>
            </div>
          ) : (
            <PiiValueList
              values={pageValues}
              revealed={revealed}
              busy={busy}
              mode={showingSuppressed ? "suppressed" : "active"}
              onConfirm={confirmValues}
              onSuppress={showingSuppressed ? undefined : suppressValues}
            />
          )}

          <div className="flex justify-end items-center gap-1">
            <button
              className="btn btn-sm btn-ghost btn-circle"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm tabular-nums text-base-content/60 px-1">
              {page} / {totalPages}
            </span>
            <button
              className="btn btn-sm btn-ghost btn-circle"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
