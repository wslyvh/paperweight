import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { Vendor, VendorQuery } from "@shared/types";
import { useLicense } from "../context/LicenseContext";
import { BadgeCheck, ChevronRight, ChevronLeft, ArrowUpDown, SlidersHorizontal, Check } from "lucide-react";
import { getActivitySignal, ACTIVITY_BADGE } from "../utils/signals";
import ActionModal from "../components/ActionModal";

const RISK_BORDER: Record<string, string> = {
  high:    "border-error",
  medium:  "border-warning",
  low:     "border-success",
  unknown: "border-base-300",
};

const SORT_OPTIONS = [
  { value: "risk",            label: "Risk" },
  { value: "message_count",   label: "Most emails" },
  { value: "last_seen",       label: "Latest" },
  { value: "last_seen_asc",   label: "Oldest" },
  { value: "name",            label: "Name" },
];

interface Preset {
  id: string;
  label: string;
  risk?: string;
  activity?: string;
  dataType?: string;
  volume?: string;
  breached?: boolean;
  defaultSort?: string;
}

const FREE_PRESETS: Preset[] = [
  { id: "highrisk",  label: "High risk",    risk: "high" },
  { id: "onetime",   label: "Single orders", dataType: "has_orders", volume: "oneoff" },
  { id: "breached",  label: "Breached",      breached: true, defaultSort: "risk" },
];

const LICENSED_PRESETS: Preset[] = [
  { id: "oldaccounts", label: "Old accounts", risk: "high", activity: "stale" },
  { id: "oldorders",   label: "Old orders",   dataType: "has_orders", activity: "stale" },
];

interface FilterGroupProps {
  label: string;
  options: string[];
  labels: string[];
  value: string;
  onChange: (val: string) => void;
  colors?: string[];
}

function FilterGroup({ label, options, labels, value, onChange, colors }: FilterGroupProps) {
  return (
    <div>
      <div className="text-sm text-base-content/40 mb-1.5">{label}</div>
      <div className="flex gap-1 flex-wrap">
        {options.map((opt, i) => {
          const color = colors?.[i];
          const cls = color
            ? value === opt
              ? `badge-${color}`
              : `badge-soft badge-${color}`
            : value === opt
            ? "badge-neutral"
            : "badge-soft";
          return (
            <button
              key={opt}
              className={`badge badge-sm cursor-pointer ${cls}`}
              onClick={() => onChange(value === opt ? "" : opt)}
            >
              {labels[i]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type AccountModal =
  | { kind: "whitelist"; vendor: Vendor }
  | { kind: "reviewed"; vendor: Vendor };

interface AccountsState {
  page: number;
  sortBy: string;
  search: string;
  riskFilter: string;
  activityFilter: string;
  dataTypeFilter: string;
  volumeFilter: string;
  anyBreachFilter: boolean;
  showReviewed: boolean;
}

export default function Accounts(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const locState = location.state as { preset?: string; restore?: AccountsState } | null;

  // Restore previous filter state when returning from a detail page.
  // Preset activation (e.g. from Dashboard) is used only on a fresh load.
  const restore = locState?.restore;
  const license = useLicense();
  const presets = license.active ? [...FREE_PRESETS, ...LICENSED_PRESETS] : FREE_PRESETS;
  const initialPreset = restore ? undefined : presets.find((p) => p.id === locState?.preset);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState<AccountModal | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(restore?.page ?? 1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(restore?.search ?? "");
  const [sortBy, setSortBy] = useState(restore?.sortBy ?? initialPreset?.defaultSort ?? "risk");
  const [riskFilter, setRiskFilter] = useState(restore?.riskFilter ?? (initialPreset ? (initialPreset.risk ?? "") : ""));
  const [activityFilter, setActivityFilter] = useState(restore?.activityFilter ?? (initialPreset ? (initialPreset.activity ?? "") : ""));
  const [dataTypeFilter, setDataTypeFilter] = useState(restore?.dataTypeFilter ?? initialPreset?.dataType ?? "");
  const [volumeFilter, setVolumeFilter] = useState(restore?.volumeFilter ?? initialPreset?.volume ?? "");
  const [anyBreachFilter, setAnyBreachFilter] = useState(restore?.anyBreachFilter ?? !!(initialPreset?.breached));
  const [showReviewed, setShowReviewed] = useState(restore?.showReviewed ?? false);
  const [showSort, setShowSort] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem("accounts_beta_dismissed") === "1"
  );
  const limit = 25;

  const sortRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  function isPresetActive(p: Preset): boolean {
    return (
      !showReviewed &&
      (p.risk ?? "") === riskFilter &&
      (p.activity ?? "") === activityFilter &&
      (p.dataType ?? "") === dataTypeFilter &&
      (p.volume ?? "") === volumeFilter &&
      !!(p.breached) === anyBreachFilter
    );
  }

  function togglePreset(p: Preset) {
    if (isPresetActive(p)) {
      setRiskFilter("");
      setActivityFilter("");
      setDataTypeFilter("");
      setVolumeFilter("");
      setAnyBreachFilter(false);
      setSortBy("risk");
    } else {
      setRiskFilter(p.risk ?? "");
      setActivityFilter(p.activity ?? "");
      setDataTypeFilter(p.dataType ?? "");
      setVolumeFilter(p.volume ?? "");
      setAnyBreachFilter(!!(p.breached));
      setSortBy(p.defaultSort ?? "message_count");
      setShowReviewed(false);
    }
    setPage(1);
  }

  function toggleReviewed() {
    if (showReviewed) {
      setShowReviewed(false);
    } else {
      setRiskFilter("");
      setActivityFilter("");
      setDataTypeFilter("");
      setVolumeFilter("");
      setAnyBreachFilter(false);
      setShowReviewed(true);
    }
    setPage(1);
  }

  function clearAll() {
    setSearch("");
    setRiskFilter("");
    setActivityFilter("");
    setDataTypeFilter("");
    setVolumeFilter("");
    setAnyBreachFilter(false);
    setShowReviewed(false);
    setSortBy("risk");
    setPage(1);
  }

  const hasAnyFilter = !!(
    search || riskFilter || activityFilter || dataTypeFilter ||
    volumeFilter || anyBreachFilter || showReviewed || sortBy !== "risk" || page > 1
  );

  function dismissBanner() {
    localStorage.setItem("accounts_beta_dismissed", "1");
    setBannerDismissed(true);
  }

  // Keep the current history entry in sync with filter state so the browser back button
  // lands on an entry that already has the correct filters — no flash, no lost state.
  const pathname = location.pathname;
  useEffect(() => {
    navigate(pathname, {
      replace: true,
      state: { restore: { page, sortBy, search, riskFilter, activityFilter, dataTypeFilter, volumeFilter, anyBreachFilter, showReviewed } satisfies AccountsState },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, search, riskFilter, activityFilter, dataTypeFilter, volumeFilter, anyBreachFilter, showReviewed]);

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

  function handleWhitelistClick(e: React.MouseEvent, vendor: Vendor) {
    e.stopPropagation();
    setModal({ kind: "whitelist", vendor });
  }

  function handleReviewedClick(e: React.MouseEvent, vendor: Vendor) {
    e.stopPropagation();
    setModal({ kind: "reviewed", vendor });
  }

  async function handleWhitelistConfirm() {
    if (!modal || modal.kind !== "whitelist") return;
    const { vendor } = modal;
    if (!vendor.root_domain) return;
    setActionLoading(true);
    try {
      await window.api.addWhitelistEntry(vendor.root_domain);
      setModal(null);
      setVendors(prev => prev.filter(v => v.id !== vendor.id));
      setTotal(prev => prev - 1);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReviewedConfirm() {
    if (!modal || modal.kind !== "reviewed") return;
    const { vendor } = modal;
    const newValue = vendor.status !== "reviewed";
    setActionLoading(true);
    try {
      await window.api.markVendorReviewed(vendor.id, newValue);
      setModal(null);
      setVendors(prev => prev.filter(v => v.id !== vendor.id));
      setTotal(prev => prev - 1);
    } finally {
      setActionLoading(false);
    }
  }

  const fetchVendors = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const actualSortBy = sortBy === "last_seen_asc" ? "last_seen" : sortBy;
    const query: VendorQuery = {
      page,
      limit,
      sortBy: actualSortBy,
      sortDir: sortBy === "name" || sortBy === "last_seen_asc" || sortBy === "risk" ? "ASC" : "DESC",
      filter: "accounts",
      search: search || undefined,
      risk: riskFilter || undefined,
      activity: activityFilter || undefined,
      dataType: dataTypeFilter || undefined,
      volume: volumeFilter || undefined,
      showReviewed,
      onBreachList: anyBreachFilter || undefined,
    };
    const data = await window.api.queryVendors(query);
    setVendors(data.vendors);
    setTotal(data.total);
    setLoading(false);
  }, [page, sortBy, search, riskFilter, activityFilter, dataTypeFilter, volumeFilter, showReviewed, anyBreachFilter]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  // Re-fetch when sync updates or finishes
  useEffect(() => {
    const unsub = window.api.onSyncProgress((status) => {
      if (status.message === "Vendor data updated") {
        fetchVendors(true);
      } else if (!status.running && status.message.includes("complete")) {
        fetchVendors();
      }
    });
    return unsub;
  }, [fetchVendors]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Accounts</h1>
        <p className="text-sm text-base-content/50 mt-1">Companies that likely hold your personal data, like orders, accounts, invoices, and more. Risk is based on data type and breach history.</p>
      </div>

      {/* Beta banner */}
      {!bannerDismissed && (
        <div className="alert bg-base-200 text-sm py-2">
          <span>
            Account detection improves with more email data. Help us improve! Please{" "}
            <button
              className="link link-primary"
              onClick={() =>
                window.api.openExternal("https://github.com/wslyvh/paperweight/issues")
              }
            >
              share feedback
            </button>
            {" "}
            or{" "}
            <button
              className="link link-primary"
              onClick={() =>
                window.api.openExternal("mailto:hello@paperweight.email")
              }
            >
              contact us
            </button>.
          </span>
          <button onClick={dismissBanner} className="btn btn-xs btn-ghost ml-auto">×</button>
        </div>
      )}

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
          {total} {total !== 1 ? "companies" : "company"}
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

        {/* Filter dropdown */}
        <div className="relative" ref={filterRef}>
          <button className="btn btn-sm btn-ghost btn-circle" onClick={() => setShowFilters(f => !f)}>
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          {showFilters && (
            <div className="absolute right-0 top-full z-20 bg-base-200 rounded-xl shadow-lg mt-1 p-4 min-w-64 space-y-3">
              <FilterGroup
                label="Risk"
                options={["high", "medium", "low"]}
                labels={["High", "Medium", "Low"]}
                colors={["error", "warning", "success"]}
                value={riskFilter}
                onChange={v => { setRiskFilter(v); setShowReviewed(false); setPage(1); }}
              />
              <FilterGroup
                label="Type"
                options={["has_orders"]}
                labels={["Orders"]}
                value={dataTypeFilter}
                onChange={v => { setDataTypeFilter(v); setShowReviewed(false); setPage(1); }}
              />
              <FilterGroup
                label="Activity"
                options={["recent", "active", "inactive", "stale", "dead"]}
                labels={["Recent (<3m)", "Active (<1y)", "1-2 years ago", "2+ years ago", "5+ years ago"]}
                colors={["secondary", "secondary", "secondary", "secondary", "secondary"]}
                value={activityFilter}
                onChange={v => { setActivityFilter(v); setShowReviewed(false); setPage(1); }}
              />
              <FilterGroup
                label="Volume"
                options={["oneoff", "low", "medium", "high"]}
                labels={["One-off (≤5)", "Low (≤25)", "Medium (≤100)", "High (100+)"]}
                value={volumeFilter}
                onChange={v => { setVolumeFilter(v); setShowReviewed(false); setPage(1); }}
              />
              <div className="pt-2 border-t border-base-content/10">
                <div className="text-sm text-base-content/40 mb-1.5">Breach</div>
                <button
                  className={`badge badge-sm cursor-pointer ${anyBreachFilter ? "badge-warning" : "badge-soft badge-warning"}`}
                  onClick={() => { setAnyBreachFilter(v => !v); setShowReviewed(false); setPage(1); }}
                >
                  ⚠️ On breach list
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2 — presets + filter icon */}
      <div className="flex items-center gap-2">
        <button
          className={`badge badge-sm cursor-pointer gap-1 ${showReviewed ? "badge-accent" : "badge-soft badge-accent"}`}
          onClick={toggleReviewed}
        >
          <BadgeCheck className="w-3 h-3" />
          Reviewed
        </button>

        <div className="w-px h-3 bg-base-content/20" />

        {presets.map(p => (
          <button
            key={p.id}
            className={`badge badge-sm cursor-pointer ${isPresetActive(p) ? "badge-accent" : "badge-soft badge-accent"}`}
            onClick={() => togglePreset(p)}
          >
            {p.label}
          </button>
        ))}

      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : vendors.length === 0 ? (
        <div className="card bg-base-200">
          <div className="card-body text-center">
            <h2 className="card-title justify-center">No accounts found</h2>
            <p className="text-base-content/60 mx-auto">
              {activityFilter === "dead"
                ? "No accounts found for this time range. Syncing older emails requires a license."
                : search
                ? "No accounts match your search"
                : "Adjust your filters or sync to see more"}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {vendors.map((vendor) => {
              const displayName = vendor.name || vendor.root_domain || "Unknown";
              const computedRisk = vendor.risk_level ?? "unknown";
              const groupKey = vendor.company_slug ?? vendor.root_domain ?? String(vendor.id);
              const activitySignal = getActivitySignal(vendor.last_seen);
              const activityBadgeInfo = ACTIVITY_BADGE[activitySignal] ?? null;

              return (
                <div
                  key={vendor.id}
                  className={`card bg-base-200 overflow-visible rounded-2xl border-l-4 ${RISK_BORDER[computedRisk] ?? RISK_BORDER.unknown}`}
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-base-300 transition-colors rounded-2xl group"
                    onClick={() => navigate(`/accounts/${encodeURIComponent(groupKey)}`, {
                      state: { accountsState: { page, sortBy, search, riskFilter, activityFilter, dataTypeFilter, volumeFilter, anyBreachFilter, showReviewed } satisfies AccountsState },
                    })}
                  >
                    <div className="flex items-center gap-3 w-full">
                      {/* Name + count */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{displayName}</span>
                        {vendor.company_slug && (
                          <BadgeCheck
                            className="w-4 h-4 text-info shrink-0"
                            strokeWidth={2}
                            aria-label="Verified company"
                          />
                        )}
                        <span
                          className="badge badge-sm badge-soft badge-neutral text-base-content/60 shrink-0 tabular-nums"
                          title="Emails"
                        >
                          {vendor.message_count}
                        </span>
                        {vendor.breachInfo && vendor.breachInfo.length > 0 && (
                          <span
                            className="shrink-0 leading-none"
                            title={vendor.breachInfo.some(b => b.likelyAffected) ? "You likely had an account when a breach occurred" : "Breach occurred, but your data may not be affected"}
                          >
                            {vendor.breachInfo.some(b => b.likelyAffected) ? "⚠️" : "ℹ️"}
                          </span>
                        )}
                      </div>
                      {/* Hover-reveal actions */}
                      <div
                        className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {vendor.root_domain && (
                          <button
                            className="btn btn-outline btn-xs text-base-content/50 hover:border-base-content/80 hover:text-base-content/80"
                            onClick={(e) => handleWhitelistClick(e, vendor)}
                            aria-label="Whitelist"
                          >
                            Whitelist
                          </button>
                        )}
                        <button
                          className={`btn btn-ghost btn-sm btn-square tooltip tooltip-top text-base-content/50 hover:bg-base-content/10 hover:text-base-content/80 ${
                            vendor.status === "reviewed" ? "text-success" : ""
                          }`}
                          data-tip={vendor.status === "reviewed" ? "Undo review" : "Mark reviewed"}
                          onClick={(e) => handleReviewedClick(e, vendor)}
                          aria-label="Mark reviewed"
                        >
                          <Check className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      </div>
                      {/* Signal badges */}
                      <div className="flex gap-1 w-36 shrink-0 justify-end">
                        {activityBadgeInfo && (
                          <span className={`badge badge-xs badge-soft ${activityBadgeInfo.color}`}>
                            {activityBadgeInfo.label}
                          </span>
                        )}
                        {vendor.has_orders && (
                          <span className="badge badge-xs badge-soft">Orders</span>
                        )}
                        {vendor.has_account && !vendor.has_orders && (
                          <span className="badge badge-xs badge-soft">Account</span>
                        )}
                        {vendor.has_marketing && !vendor.has_account && (
                          <span className="badge badge-xs badge-soft">Bulk</span>
                        )}
                      </div>
                      <ChevronRight
                        className="w-5 h-5 text-base-content/30 shrink-0"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

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

      {modal?.kind === "whitelist" && (
        <ActionModal
          isOpen
          title="Whitelist"
          confirmLabel="Whitelist"
          confirmVariant="primary"
          onConfirm={handleWhitelistConfirm}
          onCancel={() => setModal(null)}
          loading={actionLoading}
        >
          <p>
            Whitelisted senders won't appear in Accounts or Mailing lists. Whitelist entire domain{" "}
            <span className="font-mono text-xs bg-base-300 px-1 rounded">
              {modal.vendor.root_domain}
            </span>
            ?
          </p>
        </ActionModal>
      )}

      {modal?.kind === "reviewed" && (
        <ActionModal
          isOpen
          title={modal.vendor.status === "reviewed" ? "Undo review" : "Mark as reviewed"}
          confirmLabel={modal.vendor.status === "reviewed" ? "Undo" : "Mark reviewed"}
          confirmVariant="primary"
          onConfirm={handleReviewedConfirm}
          onCancel={() => setModal(null)}
          loading={actionLoading}
        >
          <p>
            {modal.vendor.status === "reviewed"
              ? `Remove the reviewed flag from ${modal.vendor.name || modal.vendor.root_domain}?`
              : `Mark ${modal.vendor.name || modal.vendor.root_domain} as reviewed? You can still view reviewed accounts using the Reviewed filter.`}
          </p>
        </ActionModal>
      )}
    </div>
  );
}
