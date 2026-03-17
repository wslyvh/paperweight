import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { Vendor, VendorQuery, UnsubscribeEntry } from "@shared/types";
import { formatRelativeDate } from "@shared/formatting";
import { ArrowUpDown, BadgeCheck, BellOff, ChevronLeft, ChevronRight, Flag, SlidersHorizontal, Trash2 } from "lucide-react";
import ActionModal from "../components/ActionModal";

// ---------- types ----------

type ModalKind = "whitelist" | "unsubscribe" | "spam" | "trash";

interface ModalState {
  kind: ModalKind;
  vendor: Vendor;
  // whitelist
  senderEmail?: string;
  whitelistTarget: "domain" | "email";
  // unsubscribe
  methods?: UnsubscribeEntry[];
  // spam / trash
  trashAlso: boolean;
}

/** After opening an external unsubscribe link, ask the user to confirm. */
interface UnsubCheckState {
  vendor: Vendor;
  trashAlso: boolean;
}

/** Result of an rfc8058 POST attempt. */
interface UnsubResultState {
  vendor: Vendor;
  kind: "success" | "failure";
  /** Other methods to offer as fallback when kind = 'failure' */
  fallbackMethods: UnsubscribeEntry[];
  trashAlso: boolean;
}

type BatchPhase = "confirm" | "progress" | "results";
type BatchKind = "unsubscribe" | "spam" | "trash";

interface BatchState {
  phase: BatchPhase;
  kind: BatchKind;
  trashAlso: boolean;
  current: number;
  total: number;
  succeeded: number[];
  failed: string[];
}

// ---------- filter group ----------

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

// ---------- presets ----------

const MAIL_PRESETS = [
  { id: "whitelisted", label: "Whitelisted" },
  { id: "priorities",  label: "Priorities" },
  { id: "breached",    label: "Breached" },
] as const;

type MailPresetId = typeof MAIL_PRESETS[number]["id"];

// ---------- helpers ----------

const SORT_OPTIONS = [
  { value: "message_count", label: "Most emails" },
  { value: "last_seen", label: "Latest" },
  { value: "last_seen_asc", label: "Oldest" },
  { value: "name", label: "Name" },
  { value: "root_domain", label: "Domain" },
];

const ROW_GRID =
  "grid grid-cols-[24px_20px_minmax(0,1fr)_auto_100px] items-center gap-4";

/** Priority order matching architecture.md */
const METHOD_PRIORITY = ["rfc8058", "list-unsubscribe", "footer"] as const;

function pickBestMethod(
  methods: UnsubscribeEntry[],
): UnsubscribeEntry | undefined {
  for (const p of METHOD_PRIORITY) {
    const found = methods.find((m) => m.method === p);
    if (found) return found;
  }
  return undefined;
}

function unsubDescription(entry: UnsubscribeEntry, vendorName: string) {
  if (entry.method === "rfc8058") {
    return <>Paperweight will automatically send an unsubscribe request to <strong>{vendorName}</strong>.</>;
  }
  if (entry.url.startsWith("mailto:")) {
    return <>Your email client will open with a pre-filled unsubscribe request to <strong>{vendorName}</strong>. Send the email to complete.</>;
  }
  return <>The unsubscribe page for <strong>{vendorName}</strong> will open in your browser. Complete the process there.</>;
}

const BATCH_LABELS: Record<
  BatchKind,
  { title: string; progressVerb: string; successVerb: string }
> = {
  unsubscribe: {
    title: "Batch Unsubscribe",
    progressVerb: "Unsubscribing",
    successVerb: "unsubscribed",
  },
  spam: {
    title: "Report Spam",
    progressVerb: "Reporting spam",
    successVerb: "reported",
  },
  trash: {
    title: "Move to Trash",
    progressVerb: "Deleting",
    successVerb: "moved to trash",
  },
};

// ---------- component ----------

export default function Mail(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const locState = location.state as { preset?: MailPresetId } | null;
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("message_count");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [messagesCache, setMessagesCache] = useState<
    Map<number, Array<{ id: string; subject?: string; date: number }>>
  >(new Map());
  const [methodsCache, setMethodsCache] = useState<
    Map<number, UnsubscribeEntry[]>
  >(new Map());

  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [unsubCheck, setUnsubCheck] = useState<UnsubCheckState | null>(null);
  const [unsubResult, setUnsubResult] = useState<UnsubResultState | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [showSort, setShowSort] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [volumeFilter, setVolumeFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [whitelistedFilter, setWhitelistedFilter] = useState(locState?.preset === "whitelisted");
  const [priorityFilter, setPriorityFilter] = useState(locState?.preset === "priorities");
  const [breachedFilter, setBreachedFilter] = useState(locState?.preset === "breached");

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batch, setBatch] = useState<BatchState | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const removedIdsRef = useRef<Set<number>>(new Set());

  const limit = 25;

  // ---------- data fetching ----------

  const fetchVendors = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      const query: VendorQuery = {
        page,
        limit,
        sortBy: sortBy === "last_seen_asc" ? "last_seen" : sortBy,
        sortDir:
          sortBy === "name" ||
          sortBy === "root_domain" ||
          sortBy === "last_seen_asc"
            ? "ASC"
            : "DESC",
        search: search || undefined,
        filter: "lists",
        activity: activityFilter || undefined,
        volume: volumeFilter || undefined,
        activeSubscriptions: priorityFilter || undefined,
        onBreachList: breachedFilter || undefined,
        showWhitelisted: whitelistedFilter || undefined,
      };
      const data = await window.api.queryVendors(query);
      setVendors(data.vendors.filter((v) => !removedIdsRef.current.has(v.id)));
      setTotal(data.total);
      setLoading(false);
    },
    [page, sortBy, search, activityFilter, volumeFilter, priorityFilter, breachedFilter, whitelistedFilter],
  );

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

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

  // Sync indeterminate state on select-all checkbox
  const eligibleVendors = vendors.filter((v) => v.has_rfc8058);
  const allEligibleSelected =
    eligibleVendors.length > 0 &&
    eligibleVendors.every((v) => selectedIds.has(v.id));
  const someEligibleSelected = eligibleVendors.some((v) =>
    selectedIds.has(v.id),
  );

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        someEligibleSelected && !allEligibleSelected;
    }
  }, [someEligibleSelected, allEligibleSelected]);

  // ---------- toolbar ----------

  const handleSearchChange = (value: string) => {
    removedIdsRef.current = new Set();
    setSearch(value);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleClearAll = () => {
    removedIdsRef.current = new Set();
    setSearch("");
    setSortBy("message_count");
    setVolumeFilter("");
    setActivityFilter("");
    setWhitelistedFilter(false);
    setPriorityFilter(false);
    setBreachedFilter(false);
    setPage(1);
    setSelectedIds(new Set());
  };

  const hasAnyFilter = !!(search || sortBy !== "message_count" || volumeFilter || activityFilter || whitelistedFilter || priorityFilter || breachedFilter || page > 1);

  const handleSortChange = (value: string) => {
    removedIdsRef.current = new Set();
    setSortBy(value);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handlePageChange = (p: number) => {
    removedIdsRef.current = new Set();
    setPage(p);
    setSelectedIds(new Set());
  };

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

  // ---------- select-all ----------

  const handleSelectAll = () => {
    if (allEligibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleVendors.map((v) => v.id)));
    }
  };

  // ---------- row expand ----------

  const handleToggleExpand = async (vendor: Vendor): Promise<void> => {
    const id = vendor.id;
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
      if (!messagesCache.has(id)) {
        const messages = await window.api.getVendorMessages(id, 5);
        setMessagesCache((prev) => new Map(prev).set(id, messages));
      }
    }
    setExpandedRows(newExpanded);
  };

  // ---------- shared helpers ----------

  const removeVendor = (vendorId: number) => {
    removedIdsRef.current.add(vendorId);
    setVendors((prev) => prev.filter((v) => v.id !== vendorId));
    setTotal((t) => t - 1);
  };

  const closeModal = () => {
    if (!actionLoading) {
      setModal(null);
      setModalError(null);
    }
  };

  /** Fetch methods for vendor, using cache if available */
  const getOrFetchMethods = async (
    vendorId: number,
  ): Promise<UnsubscribeEntry[]> => {
    const cached = methodsCache.get(vendorId);
    if (cached) return cached;
    const methods = await window.api.getAllUnsubscribeMethods(vendorId);
    setMethodsCache((prev) => new Map(prev).set(vendorId, methods));
    return methods;
  };

  // ---------- action button handlers (open modals) ----------

  const handleWhitelistClick = async (
    e: React.MouseEvent,
    vendor: Vendor,
  ): Promise<void> => {
    e.stopPropagation();
    // Try to get a representative sender email from cached methods
    const methods = await getOrFetchMethods(vendor.id);
    const senderEmail = methods[0]?.senderEmail;
    setModal({
      kind: "whitelist",
      vendor,
      senderEmail,
      whitelistTarget: "domain",
      trashAlso: false,
    });
  };

  const handleUnsubscribeClick = async (
    e: React.MouseEvent,
    vendor: Vendor,
  ): Promise<void> => {
    e.stopPropagation();
    const methods = await getOrFetchMethods(vendor.id);
    setModal({
      kind: "unsubscribe",
      vendor,
      methods,
      whitelistTarget: "domain",
      trashAlso: false,
    });
  };

  const handleSpamClick = (e: React.MouseEvent, vendor: Vendor): void => {
    e.stopPropagation();
    setModal({ kind: "spam", vendor, whitelistTarget: "domain", trashAlso: true });
  };

  const handleTrashClick = (e: React.MouseEvent, vendor: Vendor): void => {
    e.stopPropagation();
    setModal({ kind: "trash", vendor, whitelistTarget: "domain", trashAlso: false });
  };

  // ---------- batch actions ----------

  const openBatch = (kind: BatchKind) => {
    setBatch({
      phase: "confirm",
      kind,
      trashAlso: kind === "spam",
      current: 0,
      total: 0,
      succeeded: [],
      failed: [],
    });
  };

  const runBatch = async () => {
    if (!batch || batch.phase !== "confirm") return;
    const kind = batch.kind;
    const trashAlso = batch.trashAlso;
    const batchVendors = vendors.filter((v) => selectedIds.has(v.id));

    setBatch((prev) =>
      prev
        ? { ...prev, phase: "progress", current: 0, total: batchVendors.length }
        : prev,
    );

    const succeeded: number[] = [];
    const failed: string[] = [];

    for (let i = 0; i < batchVendors.length; i++) {
      setBatch((prev) => (prev ? { ...prev, current: i + 1 } : prev));
      const vendor = batchVendors[i];
      const name = vendor.name || vendor.root_domain || "Unknown";
      try {
        if (kind === "unsubscribe") {
          const methods = await getOrFetchMethods(vendor.id);
          const rfc = methods.find((m) => m.method === "rfc8058");
          if (!rfc) {
            failed.push(name);
            continue;
          }
          const result = await window.api.executeRfc8058(rfc.url);
          if (!result.success) {
            failed.push(name);
            continue;
          }
          await window.api.markVendorUnsubscribed(vendor.id);
          if (trashAlso) await window.api.trashVendorMessages(vendor.id, ["bulk"]);
          succeeded.push(vendor.id);
        } else if (kind === "spam") {
          const result = await window.api.reportSpamVendor(vendor.id);
          if (!result.success) {
            failed.push(name);
            continue;
          }
          if (trashAlso) await window.api.trashVendorMessages(vendor.id, ["bulk"]);
          succeeded.push(vendor.id);
        } else if (kind === "trash") {
          const result = await window.api.trashVendorMessages(vendor.id, ["bulk"]);
          if (!result.success) {
            failed.push(name);
            continue;
          }
          succeeded.push(vendor.id);
        }
      } catch {
        failed.push(name);
      }
    }

    setBatch((prev) =>
      prev ? { ...prev, phase: "results", succeeded, failed } : prev,
    );
  };

  const closeBatch = () => {
    if (!batch || batch.phase !== "results") return;
    const { succeeded } = batch;
    succeeded.forEach((id) => removedIdsRef.current.add(id));
    setVendors((prev) => prev.filter((v) => !succeeded.includes(v.id)));
    setTotal((t) => t - succeeded.length);
    setSelectedIds(new Set());
    setBatch(null);
  };

  // ---------- modal confirmations ----------

  const handleWhitelistConfirm = async (): Promise<void> => {
    if (!modal || modal.kind !== "whitelist") return;
    const { vendor, whitelistTarget, senderEmail } = modal;
    const target =
      whitelistTarget === "email" && senderEmail
        ? senderEmail
        : vendor.root_domain;
    if (!target) return;
    setActionLoading(true);
    try {
      await window.api.addWhitelistEntry(target);
      setModal(null);
      removeVendor(vendor.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsubscribeConfirm = async (): Promise<void> => {
    if (!modal || modal.kind !== "unsubscribe") return;
    const { vendor, methods } = modal;
    const best = methods ? pickBestMethod(methods) : undefined;
    if (!best) return;

    setActionLoading(true);
    try {
      if (best.method === "rfc8058") {
        const fallbackMethods = (methods ?? []).filter((m) => m.method !== "rfc8058");
        const result = await window.api.executeRfc8058(best.url);
        if (result.success) {
          await window.api.markVendorUnsubscribed(vendor.id);
          setModal(null);
          setUnsubResult({ vendor, kind: "success", fallbackMethods: [], trashAlso: true });
        } else {
          setModal(null);
          setUnsubResult({ vendor, kind: "failure", fallbackMethods, trashAlso: true });
        }
      } else {
        await window.api.openExternal(best.url);
        setModal(null);
        setUnsubCheck({ vendor, trashAlso: true });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsubResultDone = async (): Promise<void> => {
    if (!unsubResult) return;
    const { vendor, trashAlso } = unsubResult;
    setActionLoading(true);
    try {
      if (trashAlso) {
        const result = await window.api.trashVendorMessages(vendor.id, ["bulk"]);
        if (!result.success) setToast(result.error ?? "Unsubscribed, but couldn't move emails to trash.");
      }
      setUnsubResult(null);
      removeVendor(vendor.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsubResultSpam = async (): Promise<void> => {
    if (!unsubResult) return;
    const { vendor, trashAlso } = unsubResult;
    setActionLoading(true);
    try {
      await window.api.reportSpamVendor(vendor.id);
      if (trashAlso) await window.api.trashVendorMessages(vendor.id, ["bulk"]);
      setUnsubResult(null);
      removeVendor(vendor.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsubResultFallback = async (entry: UnsubscribeEntry): Promise<void> => {
    if (!unsubResult) return;
    const { vendor } = unsubResult;
    setActionLoading(true);
    try {
      await window.api.openExternal(entry.url);
      setUnsubResult(null);
      setUnsubCheck({ vendor, trashAlso: true });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsubCheckDone = async (): Promise<void> => {
    if (!unsubCheck) return;
    const { vendor, trashAlso } = unsubCheck;
    setActionLoading(true);
    try {
      await window.api.markVendorUnsubscribed(vendor.id);
      if (trashAlso) {
        const result = await window.api.trashVendorMessages(vendor.id, ["bulk"]);
        if (!result.success) setToast(result.error ?? "Unsubscribed, but couldn't move emails to trash.");
      }
      setUnsubCheck(null);
      removeVendor(vendor.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsubCheckSpam = async (): Promise<void> => {
    if (!unsubCheck) return;
    const { vendor } = unsubCheck;
    setActionLoading(true);
    try {
      await window.api.reportSpamVendor(vendor.id);
      setUnsubCheck(null);
      removeVendor(vendor.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSpamConfirm = async (): Promise<void> => {
    // Called from spam modal AND from unsubscribe "no methods" modal
    if (!modal || (modal.kind !== "spam" && modal.kind !== "unsubscribe"))
      return;
    const { vendor, trashAlso } = modal;
    setActionLoading(true);
    setModalError(null);
    try {
      const spamResult = await window.api.reportSpamVendor(vendor.id);
      if (!spamResult.success) {
        setModalError(spamResult.error ?? "Failed to report spam.");
        return;
      }
      if (trashAlso) await window.api.trashVendorMessages(vendor.id, ["bulk"]);
      setModal(null);
      setModalError(null);
      removeVendor(vendor.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTrashConfirm = async (): Promise<void> => {
    if (!modal || modal.kind !== "trash") return;
    const { vendor } = modal;
    setActionLoading(true);
    setModalError(null);
    try {
      const result = await window.api.trashVendorMessages(vendor.id, ["bulk"]);
      if (!result.success) {
        setModalError(result.error ?? "Failed to move emails to trash.");
        return;
      }
      setModal(null);
      setModalError(null);
      removeVendor(vendor.id);
    } finally {
      setActionLoading(false);
    }
  };

  // ---------- modal rendering ----------

  const renderModal = () => {
    // Batch modal (takes priority over per-row modals)
    if (batch) {
      const labels = BATCH_LABELS[batch.kind];

      if (batch.phase === "confirm") {
        return (
          <ActionModal
            isOpen
            title={labels.title}
            confirmLabel={
              batch.kind === "unsubscribe"
                ? `Unsubscribe ${selectedIds.size} ${selectedIds.size === 1 ? "company" : "companies"}`
                : batch.kind === "spam"
                  ? "Report spam"
                  : "Move to trash"
            }
            confirmVariant="primary"
            onConfirm={runBatch}
            onCancel={() => setBatch(null)}
          >
            {batch.kind === "unsubscribe" && (
              <>
                <p>
                  Paperweight will automatically send unsubscribe requests to{" "}
                  <strong>{selectedIds.size}</strong>{" "}
                  {selectedIds.size === 1 ? "company" : "companies"}.
                </p>
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={batch.trashAlso}
                    onChange={(e) =>
                      setBatch((prev) =>
                        prev ? { ...prev, trashAlso: e.target.checked } : prev,
                      )
                    }
                  />
                  <span>Also move all emails to trash after unsubscribing</span>
                </label>
              </>
            )}
            {batch.kind === "spam" && (
              <>
                <p>
                  Spam reporting works best for unsolicited mail. For lists you
                  signed up for, unsubscribing is more effective and respectful.
                </p>
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={batch.trashAlso}
                    onChange={(e) =>
                      setBatch((prev) =>
                        prev ? { ...prev, trashAlso: e.target.checked } : prev,
                      )
                    }
                  />
                  <span>Also move all emails to trash</span>
                </label>
              </>
            )}
            {batch.kind === "trash" && (
              <p>
                These senders will continue emailing you. Consider unsubscribing
                first to stop receiving new emails.
              </p>
            )}
          </ActionModal>
        );
      }

      if (batch.phase === "progress") {
        return (
          <ActionModal
            isOpen
            title={labels.title}
            loading={true}
            onCancel={() => {}}
          >
            <p>
              {labels.progressVerb} {batch.current} / {batch.total}…
            </p>
          </ActionModal>
        );
      }

      // results
      return (
        <ActionModal
          isOpen
          title={labels.title}
          confirmLabel="Done"
          confirmVariant="primary"
          onConfirm={closeBatch}
          onCancel={closeBatch}
        >
          <p>
            Done — {batch.succeeded.length} {labels.successVerb}
            {batch.failed.length > 0 ? `, ${batch.failed.length} failed.` : "."}
          </p>
          {batch.failed.length > 0 && (
            <p className="text-base-content/60">
              Failed: {batch.failed.join(", ")}
            </p>
          )}
        </ActionModal>
      );
    }

    // rfc8058 result — success or failure
    if (unsubResult) {
      const name =
        unsubResult.vendor.name || unsubResult.vendor.root_domain || "this sender";

      if (unsubResult.kind === "success") {
        return (
          <ActionModal
            isOpen
            title="Unsubscribe"
            confirmLabel="Done"
            confirmVariant="primary"
            onConfirm={handleUnsubResultDone}
            onCancel={() => {
              if (!actionLoading) {
                setUnsubResult(null);
                removeVendor(unsubResult.vendor.id);
              }
            }}
            loading={actionLoading}
          >
            <p>
              Successfully unsubscribed from <strong>{name}</strong>.
            </p>
            <label className="flex items-center gap-2 cursor-pointer mt-1">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={unsubResult.trashAlso}
                onChange={(e) =>
                  setUnsubResult((prev) =>
                    prev ? { ...prev, trashAlso: e.target.checked } : prev,
                  )
                }
              />
              <span>Also move all emails to trash</span>
            </label>
          </ActionModal>
        );
      }

      // failure
      const { fallbackMethods } = unsubResult;
      return (
        <ActionModal
          isOpen
          title="Unsubscribe"
          secondaryLabel="Mark as spam"
          secondaryVariant="neutral"
          onSecondary={handleUnsubResultSpam}
          onCancel={() => !actionLoading && setUnsubResult(null)}
          loading={actionLoading}
        >
          <p>
            Couldn't automatically unsubscribe from <strong>{name}</strong>.
          </p>
          {fallbackMethods.length > 0 && (
            <div className="space-y-2 mt-1">
              <p className="text-base-content/60">Try another method:</p>
              {fallbackMethods.map((entry) => (
                <div
                  key={entry.method}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-base-content/80">
                    {unsubDescription(entry, name)}
                  </span>
                  <button
                    className="btn btn-primary btn-sm shrink-0"
                    disabled={actionLoading}
                    onClick={() => handleUnsubResultFallback(entry)}
                  >
                    Try
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={unsubResult.trashAlso}
              onChange={(e) =>
                setUnsubResult((prev) =>
                  prev ? { ...prev, trashAlso: e.target.checked } : prev,
                )
              }
            />
            <span>Also move all emails to trash</span>
          </label>
        </ActionModal>
      );
    }

    // Unsubscribe confirmation check (shown after opening external link)
    if (unsubCheck) {
      const name =
        unsubCheck.vendor.name ||
        unsubCheck.vendor.root_domain ||
        "this sender";
      return (
        <ActionModal
          isOpen
          title="Unsubscribe"
          secondaryLabel="No, mark as spam"
          secondaryVariant="neutral"
          confirmLabel="Yes, mark done"
          confirmVariant="primary"
          onSecondary={handleUnsubCheckSpam}
          onConfirm={handleUnsubCheckDone}
          onCancel={() => !actionLoading && setUnsubCheck(null)}
          loading={actionLoading}
        >
          <p>
            Did you successfully unsubscribe from <strong>{name}</strong>?
          </p>
          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={unsubCheck.trashAlso}
              onChange={(e) =>
                setUnsubCheck((prev) =>
                  prev ? { ...prev, trashAlso: e.target.checked } : prev,
                )
              }
            />
            <span>Also move all emails to trash</span>
          </label>
        </ActionModal>
      );
    }

    if (!modal) return null;

    const { kind, vendor } = modal;
    const name = vendor.name || vendor.root_domain || "Unknown";

    // ---- Whitelist ----
    if (kind === "whitelist") {
      const { senderEmail, whitelistTarget } = modal;
      return (
        <ActionModal
          isOpen
          title="Whitelist"
          confirmLabel="Whitelist"
          confirmVariant="primary"
          onConfirm={handleWhitelistConfirm}
          onCancel={closeModal}
          loading={actionLoading}
        >
          <p>
            Whitelisted senders won't appear in this list. Choose what to
            whitelist from <strong>{name}</strong>:
          </p>
          <div className="space-y-2 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="whitelist_target"
                className="radio radio-sm"
                checked={whitelistTarget === "domain"}
                onChange={() =>
                  setModal((prev) =>
                    prev ? { ...prev, whitelistTarget: "domain" } : prev,
                  )
                }
              />
              <span>
                Entire domain{" "}
                <span className="font-mono text-xs bg-base-300 px-1 rounded">
                  {vendor.root_domain}
                </span>
              </span>
            </label>
            {senderEmail && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="whitelist_target"
                  className="radio radio-sm"
                  checked={whitelistTarget === "email"}
                  onChange={() =>
                    setModal((prev) =>
                      prev ? { ...prev, whitelistTarget: "email" } : prev,
                    )
                  }
                />
                <span>
                  Specific sender{" "}
                  <span className="font-mono text-xs bg-base-300 px-1 rounded">
                    {senderEmail}
                  </span>
                </span>
              </label>
            )}
          </div>
        </ActionModal>
      );
    }

    // ---- Unsubscribe ----
    if (kind === "unsubscribe") {
      const { methods } = modal;
      const best = methods ? pickBestMethod(methods) : undefined;

      if (!best) {
        return (
          <ActionModal
            isOpen
            title="Unsubscribe"
            confirmLabel="Report as spam"
            confirmVariant="primary"
            onConfirm={handleSpamConfirm}
            onCancel={closeModal}
            loading={actionLoading}
          >
            <p>
              No unsubscribe link was found for <strong>{name}</strong>. You can
              report it as spam instead.
            </p>
          </ActionModal>
        );
      }

      return (
        <ActionModal
          isOpen
          title="Unsubscribe"
          confirmLabel="Unsubscribe"
          confirmVariant="primary"
          onConfirm={handleUnsubscribeConfirm}
          onCancel={closeModal}
          loading={actionLoading}
        >
          <p>{unsubDescription(best, name)}</p>
        </ActionModal>
      );
    }

    // ---- Report Spam ----
    if (kind === "spam") {
      return (
        <ActionModal
          isOpen
          title="Report Spam"
          confirmLabel="Report spam"
          confirmVariant="primary"
          onConfirm={handleSpamConfirm}
          onCancel={closeModal}
          loading={actionLoading}
        >
          <p>
            Are you sure you want to report <strong>{name}</strong> as spam?
          </p>
          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={modal.trashAlso}
              onChange={(e) =>
                setModal((prev) =>
                  prev ? { ...prev, trashAlso: e.target.checked } : prev,
                )
              }
            />
            <span>Also move all {vendor.message_count} emails to trash</span>
          </label>
          {modalError && <p className="text-error text-sm mt-2">{modalError}</p>}
        </ActionModal>
      );
    }

    // ---- Move to Trash ----
    if (kind === "trash") {
      return (
        <ActionModal
          isOpen
          title="Move to Trash"
          confirmLabel="Move to trash"
          confirmVariant="primary"
          onConfirm={handleTrashConfirm}
          onCancel={closeModal}
          loading={actionLoading}
        >
          <p>
            Are you sure you want to move all {vendor.message_count} emails from{" "}
            <strong>{name}</strong> to trash?
          </p>
          {modalError && <p className="text-error text-sm mt-2">{modalError}</p>}
        </ActionModal>
      );
    }

    return null;
  };

  // ---------- render ----------

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mailing lists</h1>
        <p className="text-sm text-base-content/50 mt-1">Newsletters and promotional emails you can unsubscribe from. We unsubscribe automatically where possible, otherwise open the link for you.</p>
      </div>

      {toast && (
        <div role="alert" className="alert alert-warning">
          <span>{toast}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search..."
          className="input input-sm input-bordered w-48"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        <span className="text-sm text-base-content/60 shrink-0">
          {total.toLocaleString()} list{total !== 1 ? "s" : ""}
        </span>

        {hasAnyFilter && (
          <button className="badge badge-sm badge-ghost cursor-pointer" onClick={handleClearAll}>
            clear all
          </button>
        )}

        {/* Inline pagination */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            className="btn btn-sm btn-ghost btn-circle"
            disabled={page === 1}
            onClick={() => handlePageChange(page - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm tabular-nums text-base-content/60 px-1">
            {page} / {totalPages}
          </span>
          <button
            className="btn btn-sm btn-ghost btn-circle"
            disabled={page >= totalPages}
            onClick={() => handlePageChange(page + 1)}
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
                  onClick={() => { handleSortChange(o.value); setShowSort(false); }}
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
                label="Volume"
                options={["oneoff", "low", "medium", "high"]}
                labels={["One-off (≤5)", "Low (≤25)", "Medium (≤100)", "High (100+)"]}
                value={volumeFilter}
                onChange={v => { setVolumeFilter(v); setPage(1); }}
              />
              <FilterGroup
                label="Activity"
                options={["active", "inactive", "stale"]}
                labels={["Active (<1y)", "1-2 years ago", "2+ years ago"]}
                colors={["secondary", "secondary", "secondary"]}
                value={activityFilter}
                onChange={v => { setActivityFilter(v); setPage(1); }}
              />
              <div className="pt-2 border-t border-base-content/10">
                <div className="text-sm text-base-content/40 mb-1.5">Breach</div>
                <button
                  className={`badge badge-sm cursor-pointer ${breachedFilter ? "badge-warning" : "badge-soft badge-warning"}`}
                  onClick={() => { setBreachedFilter(v => !v); setPriorityFilter(false); setWhitelistedFilter(false); setPage(1); }}
                >
                  ⚠️ On breach list
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2 — presets */}
      <div className="flex items-center gap-2">
        <button
          className={`badge badge-sm cursor-pointer gap-1 ${whitelistedFilter ? "badge-accent" : "badge-soft badge-accent"}`}
          onClick={() => { const next = !whitelistedFilter; setWhitelistedFilter(next); setPriorityFilter(false); setBreachedFilter(false); setPage(1); setSelectedIds(new Set()); }}
        >
          <BadgeCheck className="w-3 h-3" />
          Whitelisted
        </button>

        <div className="w-px h-3 bg-base-content/20" />

        {MAIL_PRESETS.filter(p => p.id !== "whitelisted").map(p => {
          const active = p.id === "priorities" ? priorityFilter : breachedFilter;
          return (
            <button
              key={p.id}
              className={`badge badge-sm cursor-pointer ${active ? "badge-accent" : "badge-soft badge-accent"}`}
              onClick={() => {
                const next = !active;
                setWhitelistedFilter(false);
                setPriorityFilter(p.id === "priorities" ? next : false);
                setBreachedFilter(p.id === "breached" ? next : false);
                setPage(1);
                setSelectedIds(new Set());
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : vendors.length === 0 ? (
        <div className="card bg-base-200">
          <div className="card-body text-center">
            <h2 className="card-title justify-center">All caught up!</h2>
            <p className="text-base-content/60">
              {search ? "No lists match your search" : "No bulk email detected"}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {/* Select-all / batch actions header */}
            <div className={`${ROW_GRID} px-4 py-1 rounded-xl bg-base-300`}>
              {/* Col 1: select-all checkbox */}
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                ref={selectAllRef}
                checked={allEligibleSelected}
                onChange={handleSelectAll}
                disabled={eligibleVendors.length === 0}
              />
              {/* Col 2: separator — mirrors chevron slot width without implying expandability */}
              <div className="flex items-center justify-center">
                <div className="w-px h-3 bg-base-content/20" />
              </div>
              {/* Col 3: action buttons + selected count — aligned with sender name */}
              <div className="flex items-center gap-1">
                <button
                  className="btn btn-ghost btn-sm btn-square tooltip text-base-content/50 hover:bg-base-content/10 hover:text-base-content/80 disabled:opacity-25"
                  data-tip="Unsubscribe"
                  disabled={selectedIds.size === 0}
                  onClick={() => openBatch("unsubscribe")}
                >
                  <BellOff className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-square tooltip text-base-content/50 hover:bg-base-content/10 hover:text-base-content/80 disabled:opacity-25"
                  data-tip="Report spam"
                  disabled={selectedIds.size === 0}
                  onClick={() => openBatch("spam")}
                >
                  <Flag className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-square tooltip text-base-content/50 hover:bg-base-content/10 hover:text-base-content/80 disabled:opacity-25"
                  data-tip="Move to trash"
                  disabled={selectedIds.size === 0}
                  onClick={() => openBatch("trash")}
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                </button>
                {selectedIds.size > 0 && (
                  <span className="text-sm text-base-content/50 ml-1">
                    {selectedIds.size} selected
                  </span>
                )}
              </div>
              {/* Col 4: empty */}
              <div />
              {/* Col 5: empty */}
              <div />
            </div>

            {vendors.map((vendor) => {
              const isExpanded = expandedRows.has(vendor.id);
              const messages = messagesCache.get(vendor.id);
              const displayName =
                vendor.name || vendor.root_domain || "Unknown";

              return (
                <div
                  key={vendor.id}
                  className="card bg-base-200 overflow-visible rounded-2xl"
                >
                  <div
                    className={`group p-4 cursor-pointer hover:bg-base-300 transition-colors ${
                      isExpanded ? "rounded-t-2xl" : "rounded-2xl"
                    }`}
                    onClick={() => handleToggleExpand(vendor)}
                  >
                    <div className={`${ROW_GRID} w-full`}>
                      {/* Checkbox column */}
                      {vendor.has_rfc8058 ? (
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={selectedIds.has(vendor.id)}
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(vendor.id);
                            else next.delete(vendor.id);
                            setSelectedIds(next);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          disabled
                          title="Requires manual unsubscribe"
                        />
                      )}

                      <ChevronRight
                        className={`w-5 h-5 text-base-content/50 shrink-0 transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />

                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">
                          {displayName}
                        </span>
                        {vendor.breachInfo && vendor.breachInfo.length > 0 && (
                          <span
                            className="shrink-0 leading-none"
                            title={vendor.breachInfo.some(b => b.likelyAffected) ? "You likely had an account when a breach occurred" : "Domain appears on a known breach list"}
                          >
                            {vendor.breachInfo.some(b => b.likelyAffected) ? "⚠️" : "ℹ️"}
                          </span>
                        )}
                        <span
                          className="badge badge-sm badge-soft badge-neutral text-base-content/60 shrink-0 tabular-nums"
                          title="Emails"
                        >
                          {vendor.message_count}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div
                        className={`flex items-center gap-2 transition-opacity ${isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
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
                          className="btn btn-ghost btn-sm btn-square tooltip tooltip-top text-base-content/50 hover:bg-base-content/10 hover:text-base-content/80"
                          data-tip="Unsubscribe"
                          onClick={(e) => handleUnsubscribeClick(e, vendor)}
                          aria-label="Unsubscribe"
                        >
                          <BellOff className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-square tooltip tooltip-top text-base-content/50 hover:bg-base-content/10 hover:text-base-content/80"
                          data-tip="Report spam"
                          onClick={(e) => handleSpamClick(e, vendor)}
                          aria-label="Report spam"
                        >
                          <Flag className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-square tooltip tooltip-top text-base-content/50 hover:bg-base-content/10 hover:text-base-content/80"
                          data-tip="Move to trash"
                          onClick={(e) => handleTrashClick(e, vendor)}
                          aria-label="Move to trash"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      </div>

                      <div className="text-sm text-base-content/60 tabular-nums text-right justify-self-end">
                        {formatRelativeDate(vendor.last_seen ?? 0)}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-base-300 bg-base-300/50 rounded-b-2xl">
                      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                        <span className="text-sm font-medium text-base-content/60">
                          {vendor.root_domain ?? vendor.name}
                        </span>
                        <button
                          className="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content"
                          onClick={(e) => {
                            e.stopPropagation();
                            const groupKey = vendor.company_slug ?? vendor.root_domain ?? String(vendor.id);
                            navigate(`/accounts/${encodeURIComponent(groupKey)}`);
                          }}
                        >
                          View details
                          <ChevronRight className="w-3 h-3" strokeWidth={2} />
                        </button>
                      </div>
                      {messages === undefined ? (
                        <div className="p-4 flex justify-center">
                          <span className="loading loading-spinner loading-sm"></span>
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="p-4 text-center text-base-content/50">
                          No messages found
                        </div>
                      ) : (
                        <div className="divide-y divide-base-300">
                          {messages.map((msg) => (
                            <div
                              key={msg.id}
                              className="px-4 py-3 flex items-center gap-4"
                            >
                              <span className="text-sm text-base-content/50 shrink-0 w-24">
                                {formatRelativeDate(msg.date)}
                              </span>
                              <span className="text-sm truncate">
                                {msg.subject ?? "(No subject)"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end items-center gap-1">
            <button
              className="btn btn-sm btn-ghost btn-circle"
              disabled={page === 1}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm tabular-nums text-base-content/60 px-1">
              {page} / {totalPages}
            </span>
            <button
              className="btn btn-sm btn-ghost btn-circle"
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {renderModal()}
    </div>
  );
}
