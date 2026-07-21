import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { GdprCaseStatus, GdprCaseSummary } from "@shared/types";
import { CaseListRow } from "../components/CaseListRow";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

function PagerControls({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}): JSX.Element {
  return (
    <>
      <button
        className="btn btn-sm btn-ghost btn-circle"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm tabular-nums text-base-content/60 px-1">
        {page} / {totalPages}
      </span>
      <button
        className="btn btn-sm btn-ghost btn-circle"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </>
  );
}

const SORT_OPTIONS = [
  { value: "opened_desc", label: "Latest" },
  { value: "opened_asc", label: "Oldest" },
  { value: "name", label: "Name" },
];

type CaseFilter = GdprCaseStatus | "needs_attention";

const STATUS_BADGES: Array<{ value: CaseFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "closed", label: "Closed" },
];

const limit = 20;
const DEFAULT_STATUS_FILTER: CaseFilter = "active";

interface CasesState {
  page: number;
  sortBy: string;
  search: string;
  statusFilter: CaseFilter | "";
}

export default function Cases(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const locState = location.state as { restore?: CasesState; filter?: "needs_attention" } | null;
  const restore = locState?.restore;

  const [cases, setCases] = useState<GdprCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(restore?.page ?? 1);
  const [sortBy, setSortBy] = useState(restore?.sortBy ?? "opened_desc");
  const [search, setSearch] = useState(restore?.search ?? "");
  const [statusFilter, setStatusFilter] = useState<CaseFilter | "">(
    restore?.statusFilter ?? locState?.filter ?? DEFAULT_STATUS_FILTER,
  );
  const [showSort, setShowSort] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  const loadCases = useCallback(async () => {
    const data = await window.api.queryGdprCases();
    setCases(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadCases().finally(() => setLoading(false));
  }, [loadCases, location.pathname]);

  // Sync ingests mail (and materializes case replies) in the background — if
  // the user is already sitting on this page when it finishes, the list would
  // otherwise stay stale until they navigate away and back.
  useEffect(() => {
    const unsub = window.api.onSyncProgress((status) => {
      if (!status.running) loadCases();
    });
    return unsub;
  }, [loadCases]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (showSort && sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSort(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSort]);

  const pathname = location.pathname;
  useEffect(() => {
    navigate(pathname, {
      replace: true,
      state: { restore: { page, sortBy, search, statusFilter } satisfies CasesState },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, search, statusFilter]);

  function clearAll() {
    setSearch("");
    setStatusFilter(DEFAULT_STATUS_FILTER);
    setSortBy("opened_desc");
    setPage(1);
  }

  function toggleStatus(status: CaseFilter) {
    setStatusFilter((prev) => (prev === status ? "" : status));
    setPage(1);
  }

  const hasAnyFilter = !!(
    search || statusFilter !== DEFAULT_STATUS_FILTER || sortBy !== "opened_desc" || page > 1
  );

  const filtered = useMemo(() => {
    let result = cases;
    if (statusFilter === "needs_attention") {
      result = result.filter((c) => c.status === "active" && c.nextAction);
    } else if (statusFilter) {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.vendorName.toLowerCase().includes(q));
    }
    const sorted = [...result];
    switch (sortBy) {
      case "opened_asc":
        sorted.sort((a, b) => a.openedAt - b.openedAt);
        break;
      case "name":
        sorted.sort((a, b) => a.vendorName.localeCompare(b.vendorName));
        break;
      default:
        sorted.sort((a, b) => b.openedAt - a.openedAt);
    }
    return sorted;
  }, [cases, statusFilter, search, sortBy]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  // A restored page (from navigating back) or a shrunk result set can leave
  // page past the last page; snap it back so we never show an empty list while
  // matches exist on an earlier page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pageItems = filtered.slice((page - 1) * limit, page * limit);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Cases</h1>
        <p className="text-sm text-base-content/50 mt-1">
          Data requests you sent from Paperweight. Start a new case from a company&apos;s detail page.
        </p>
      </div>

      {cases.length === 0 ? (
        <div className="card bg-base-200">
          <div className="card-body text-center text-sm text-base-content/60">
            <p>No cases yet. Send a data request from a company&apos;s detail page to start tracking.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search..."
              className="input input-sm input-bordered w-48"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />

            <span className="text-sm text-base-content/60 shrink-0">
              {total} {total !== 1 ? "cases" : "case"}
            </span>

            {hasAnyFilter && (
              <button className="badge badge-sm badge-ghost cursor-pointer" onClick={clearAll}>
                clear all
              </button>
            )}

            <div className="flex items-center gap-1 ml-auto">
              <PagerControls page={page} totalPages={totalPages} onChange={setPage} />
            </div>

            <div className="relative" ref={sortRef}>
              <button className="btn btn-sm btn-ghost btn-circle" onClick={() => setShowSort((s) => !s)}>
                <ArrowUpDown className="w-4 h-4" />
              </button>
              {showSort && (
                <div className="absolute right-0 top-full z-20 bg-base-200 rounded-xl shadow-lg mt-1 py-1 min-w-40">
                  {SORT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-base-300 transition-colors ${
                        sortBy === o.value ? "font-medium text-base-content" : "text-base-content/60"
                      }`}
                      onClick={() => { setSortBy(o.value); setPage(1); setShowSort(false); }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {STATUS_BADGES.map((s) => (
              <button
                key={s.value}
                className={`badge badge-sm cursor-pointer ${
                  statusFilter === s.value ? "badge-accent" : "badge-soft badge-accent"
                }`}
                onClick={() => toggleStatus(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {pageItems.length === 0 ? (
            <div className="card bg-base-200">
              <div className="card-body text-center text-sm text-base-content/60">
                <p>No cases match your search or filters.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {pageItems.map((c) => (
                <CaseListRow
                  key={c.id}
                  item={c}
                  primary={c.vendorName}
                  onOpen={() => navigate(`/cases/${c.id}`)}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex justify-end items-center gap-1">
              <PagerControls page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
