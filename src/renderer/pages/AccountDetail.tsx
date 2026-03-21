import { useEffect, useCallback, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type {
  VendorDetail,
  Message,
  UnsubscribeEntry,
  ActivityEntry,
  WhitelistEntry,
} from "@shared/types";
import {
  formatRelativeDate,
  formatAbsoluteDate,
  formatBytes,
} from "@shared/formatting";
import { RISK_CATEGORIES, RISK_LEVELS } from "@shared/languages";
import { getRootDomain } from "@shared/utils";
import {
  ArrowLeft,
  BadgeCheck,
  ChevronRight,
  Clipboard,
  ExternalLink,
} from "lucide-react";
import ActionModal from "../components/ActionModal";

const ACTION_LABELS: Record<ActivityEntry["actionType"], string> = {
  unsubscribed: "Unsubscribed",
  trashed: "Moved to trash",
  spam_reported: "Reported spam",
};

const ACTION_COLORS: Record<ActivityEntry["actionType"], string> = {
  unsubscribed: "text-success",
  trashed: "text-base-content/50",
  spam_reported: "text-warning",
};

const RISK_BADGE_CLASS: Record<string, string> = {
  high: "badge-error",
  medium: "badge-warning",
  low: "badge-success",
  unknown: "badge-ghost",
};

const TWO_YEARS_MS = 2 * 365.25 * 24 * 60 * 60 * 1000;
const TEN_YEARS_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;

function buildDeletionEmail(
  userEmail: string,
  accountIdentifier?: string,
): {
  subject: string;
  body: string;
} {
  return {
    subject: `Personal Data Deletion Request`,
    body: `To whom it may concern,

I am writing to request the deletion of all personal data you hold about me. I no longer wish for you to process my data and there is no ongoing reason for you to retain it.

Please:
- Delete all personal data and account history associated with me
- Unsubscribe me from all marketing communications
- Stop any further processing of my data
- Notify any third parties you have shared my data with

Account identifier:
- Email: ${userEmail}
${accountIdentifier ? `- Account reference: ${accountIdentifier}` : ""}

Please confirm completion of this request within 30 days.

If you need any information to verify my identity, feel free to reach out. Thank you!

Best regards,
${userEmail}`,
  };
}

function buildAccessEmail(userEmail: string): { subject: string; body: string } {
  return {
    subject: `Personal Data Access Request`,
    body: `To whom it may concern,

I am writing to request access to the personal data you hold about me.

Please provide:
- A copy of all personal data you hold about me
- The purposes for which my data is being processed
- The categories of data you hold
- Any third parties my data has been shared with
- How long you intend to retain my data

Account identifier:
- Email: ${userEmail}

Please respond within 30 days.

If you need any information to verify my identity, feel free to reach out. Thank you!

Best regards,
${userEmail}`,
  };
}

function EmailsBySender({
  messages,
  senderCount,
}: {
  messages: Message[];
  senderCount: number;
}) {
  const grouped = new Map<string, typeof messages>();
  for (const msg of messages) {
    const key = msg.sender_email ?? "unknown";
    const arr = grouped.get(key) ?? [];
    arr.push(msg);
    grouped.set(key, arr);
  }

  const perSenderLimit = grouped.size > 1 ? 5 : 10;

  return (
    <div>
      {[...grouped.entries()].map(([sender, msgs]) => (
        <div key={sender}>
          {senderCount > 1 && (
            <p className="text-xs text-base-content/50 font-medium px-4 pt-3 pb-1">
              {sender}
            </p>
          )}
          {msgs.slice(0, perSenderLimit).map((msg) => (
            <div key={msg.id} className="px-4 py-2 flex gap-4 text-sm">
              <span className="text-base-content/50 shrink-0 w-24 whitespace-nowrap">
                {formatRelativeDate(msg.date)}
              </span>
              <div className="min-w-0">
                <p className="truncate">{msg.subject ?? "(no subject)"}</p>
                {msg.body_preview && (
                  <p className="truncate text-base-content/40 text-xs">
                    {msg.body_preview}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function methodDescription(method: string, url: string): string {
  if (method === "rfc8058") {
    return "Automatically send an unsubscribe request.";
  }
  if (url.startsWith("mailto:")) {
    return "Opens your email client with a pre-filled unsubscribe message.";
  }
  return "Opens the unsubscribe page in your browser.";
}

function unsubDescription(
  entry: UnsubscribeEntry,
  vendorName: string,
): JSX.Element {
  if (entry.method === "rfc8058") {
    return (
      <>
        An unsubscribe request will be sent to <strong>{vendorName}</strong>{" "}
        automatically.
      </>
    );
  }
  if (entry.url.startsWith("mailto:")) {
    return (
      <>
        Your email client will open with a pre-filled unsubscribe request to{" "}
        <strong>{vendorName}</strong>. Send the email to complete.
      </>
    );
  }
  return (
    <>
      The unsubscribe page for <strong>{vendorName}</strong> will open in your
      browser. Complete the process there.
    </>
  );
}

function ActionTaskRow({ index, label, description, done, spinning, anyLoading, onAction, actionLabel, onMarkDone, variant }: {
  index: number;
  label: string;
  description?: string;
  done: boolean;
  spinning: boolean;
  anyLoading: boolean;
  onAction: () => void;
  actionLabel: string;
  onMarkDone?: () => void;
  variant?: "warning";
}) {
  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-base-200 last:border-0 transition-opacity ${done ? "opacity-40" : ""}`}>
      <span className={`text-sm font-medium tabular-nums shrink-0 mt-0.5 w-5 text-right ${done ? "text-base-content/30" : "text-base-content/40"}`}>
        {done ? "✓" : `${index}.`}
      </span>
      <div className={`flex-1 min-w-0 ${done ? "line-through" : ""}`}>
        <p className={`text-sm ${variant === "warning" ? "text-warning font-semibold" : ""}`}>{label}</p>
        {description && <p className="text-xs text-base-content/50 mt-0.5">{description}</p>}
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          className="btn btn-sm btn-neutral"
          disabled={done || anyLoading}
          onClick={onAction}
        >
          {spinning ? <span className="loading loading-spinner loading-xs" /> : actionLabel}
        </button>
        {onMarkDone && (
          <button
            className="btn btn-sm btn-ghost"
            disabled={done || anyLoading}
            onClick={onMarkDone}
          >
            Mark as done
          </button>
        )}
      </div>
    </div>
  );
}

export default function AccountDetail(): JSX.Element {
  const { groupKey } = useParams<{ groupKey: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<VendorDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [riskOpen, setRiskOpen] = useState(false);
  const [breachOpen, setBreachOpen] = useState(false);
  const [copiedRequest, setCopiedRequest] = useState(false);
  const [dataRequestType, setDataRequestType] = useState<"access" | "deletion">("deletion");
  const [pendingUnsub, setPendingUnsub] = useState<UnsubscribeEntry | null>(null);
  const [unsubCheck, setUnsubCheck] = useState<{ entry: UnsubscribeEntry; trashAlso: boolean } | null>(null);
  const [unsubResult, setUnsubResult] = useState<{
    entry: UnsubscribeEntry;
    kind: "success" | "failure";
    fallbackMethods: UnsubscribeEntry[];
    trashAlso: boolean;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"actions" | "data" | "emails" | "activity">("actions");
  const [pendingDelete, setPendingDelete] = useState<"marketing" | "all" | null>(null);
  const [whitelistModalOpen, setWhitelistModalOpen] = useState(false);
  const [selectedWhitelistValues, setSelectedWhitelistValues] = useState<Set<string>>(new Set());
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [whitelistEntries, setWhitelistEntries] = useState<WhitelistEntry[]>([]);
  const [whitelistBusyValue, setWhitelistBusyValue] = useState<string | null>(null);

  useEffect(() => {
    if (!groupKey) return;
    setLoading(true);
    Promise.all([
      window.api.getVendorDetail(decodeURIComponent(groupKey)),
      window.api.getWhitelistEntries(),
    ])
      .then(([d, entries]) => {
        setDetail(d);
        setWhitelistEntries(entries);
        setBreachOpen(
          d.vendor.breachInfo?.some((b) => b.likelyAffected) ?? false,
        );
      })
      .catch((err) => setError(err.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [groupKey]);

  const refreshDetail = useCallback(async () => {
    if (!groupKey) return;
    const d = await window.api.getVendorDetail(decodeURIComponent(groupKey));
    setDetail(d);
  }, [groupKey]);

  const refreshWhitelist = useCallback(async () => {
    const entries = await window.api.getWhitelistEntries();
    setWhitelistEntries(entries);
  }, []);

  const handleToggleReviewed = async () => {
    if (!detail) return;
    const newValue = detail.vendor.status !== "reviewed";
    await window.api.markVendorReviewed(detail.vendor.id, newValue);
    setDetail({
      ...detail,
      vendor: { ...detail.vendor, status: newValue ? "reviewed" : undefined },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <button
          className="btn btn-ghost btn-sm gap-1"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-4 h-4" /> Back to overview
        </button>
        <div className="card bg-base-200">
          <div className="card-body text-center">
            <p className="text-error">{error ?? "Vendor not found"}</p>
          </div>
        </div>
      </div>
    );
  }

  const {
    vendor,
    company,
    senders,
    allMessages,
    first_activity,
    user_email,
    activityLog,
  } = detail;
  const breaches = vendor.breachInfo ?? [];
  const anyLikelyAffected = breaches.some((b) => b.likelyAffected);
  const displayName = vendor.name || vendor.root_domain || "Unknown";
  const risk = vendor.risk_level ?? "unknown";
  const riskInfo = RISK_LEVELS[risk as keyof typeof RISK_LEVELS];
  const cat = vendor.category_id ?? "unknown";
  const effectiveCat =
    cat !== "unknown"
      ? cat
      : vendor.has_orders
        ? "shopping"
        : vendor.has_account
          ? "services"
          : cat;
  const catInfo = RISK_CATEGORIES[effectiveCat as keyof typeof RISK_CATEGORIES];
  const badgeClass = RISK_BADGE_CLASS[risk] ?? "badge-ghost";

  const riskBadge = riskInfo?.badge ?? "⚪";
  const riskDescription =
    riskInfo?.description ?? "Not enough data to determine a risk level";

  const contactEmail = company?.email ?? senders[0]?.sender_email;
  const deletionEmail = user_email ? buildDeletionEmail(user_email) : undefined;
  const accessEmail = user_email ? buildAccessEmail(user_email) : undefined;

  const domainUrl = company?.web
    ? company.web
    : `https://${vendor.root_domain ?? ""}`;

  const senderEmailOptions = [...new Set(
    senders
      .map((sender) => sender.sender_email?.toLowerCase())
      .filter((email): email is string => !!email),
  )];

  const senderDomains = [...new Set(
    senderEmailOptions
      .map((email) => email.split("@")[1]?.trim().toLowerCase())
      .filter((domain): domain is string => !!domain),
  )];

  const companyDomain = company?.web
    ? (() => {
      const candidate = company.web.trim().toLowerCase();
      if (!candidate) return undefined;
      try {
        return new URL(
          candidate.includes("://") ? candidate : `https://${candidate}`,
        ).hostname.toLowerCase().replace(/^www\./, "");
      } catch {
        return candidate.replace(/^www\./, "");
      }
    })()
    : undefined;

  const rootDomainOption = (() => {
    const domainCandidate =
      companyDomain ??
      vendor.root_domain?.trim().toLowerCase() ??
      senderDomains[0];
    return domainCandidate ? getRootDomain(domainCandidate) : undefined;
  })();

  const senderEmailSet = new Set(senderEmailOptions);
  const senderDomainSet = new Set(senderDomains);

  const whitelistOptions = [
    ...(rootDomainOption ? [rootDomainOption] : []),
    ...senderEmailOptions,
  ];

  const whitelistedValues = new Set(
    whitelistEntries.map((entry) => entry.value.trim().toLowerCase()),
  );

  const addableWhitelistOptions = whitelistOptions.filter(
    (option) => !whitelistedValues.has(option.trim().toLowerCase()),
  );

  const canOpenWhitelistModal = addableWhitelistOptions.length > 0;

  const knownWhitelistEntries = whitelistEntries.filter((entry) => {
    const value = entry.value.trim().toLowerCase();
    if (value.includes("@")) {
      return senderEmailSet.has(value);
    }
    return (
      senderDomainSet.has(value) ||
      (rootDomainOption !== undefined &&
        getRootDomain(value) === rootDomainOption)
    );
  });

  const sortedActivityLog = [...activityLog].sort(
    (a, b) => b.actionedAt - a.actionedAt,
  );

  const sortedWhitelistEntries = [...knownWhitelistEntries].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );

  const hasAnyActivity =
    sortedActivityLog.length > 0 || sortedWhitelistEntries.length > 0;

  const handleCopyRequest = async (email: { subject: string; body: string }) => {
    if (!contactEmail) return;
    const full = `To: ${contactEmail}\nSubject: ${email.subject}\n\n${email.body}`;
    await navigator.clipboard.writeText(full);
    setCopiedRequest(true);
    setTimeout(() => setCopiedRequest(false), 2000);
  };

  // Derive unique unsubscribe methods from bulk messages
  const unsubMethods: UnsubscribeEntry[] = (() => {
    if (!detail) return [];
    const seen = new Set<string>();
    const result: UnsubscribeEntry[] = [];
    for (const msg of detail.bulkMessages) {
      const method = msg.unsubscribe_method;
      const url = msg.unsubscribe_url;
      if (!method || method === "none" || !url || seen.has(method)) continue;
      seen.add(method);
      result.push({ url, method, senderEmail: msg.sender_email });
    }
    return result;
  })();

  // Action item derivation
  const now = Date.now();
  const twoYearsAgo = now - TWO_YEARS_MS;
  const tenYearsAgo = now - TEN_YEARS_MS;

  const activeBulkMessages = detail.bulkMessages.filter(
    (m) => m.date > twoYearsAgo && m.status == null
  );
  const hasActiveSubscription = activeBulkMessages.length > 0 && unsubMethods.length > 0;
  const bulkCount = detail.bulkMessageCount;
  const totalCount = vendor.message_count;
  // Ancient: last seen > 10yr ago — company may no longer exist, so suggest verifying first.
  // Stale: last seen > 2yr ago (but not ancient) — deletion request is the right move.
  // No has_account requirement because transaction/notification emails are often classified as "personal" not "account".
  const isAncientAccount = !!(vendor.last_seen && vendor.last_seen < tenYearsAgo && totalCount >= 5);
  const isStaleAccount = !!(vendor.last_seen && vendor.last_seen < twoYearsAgo && !isAncientAccount && totalCount >= 5);
  const allEmailsAreMarketing = bulkCount > 0 && bulkCount === totalCount;
  const showDeleteMarketing = allEmailsAreMarketing;
  const showDeleteAll = totalCount > 0 && !allEmailsAreMarketing;

  const actionItems: string[] = [
    ...(anyLikelyAffected ? ["breachReview", "breachAccess", "breachDeletion"] : []),
    ...(hasActiveSubscription ? unsubMethods.map((m) => `unsub-${m.method}`) : []),
    ...(showDeleteMarketing ? ["deleteMarketing"] : []),
    ...(showDeleteAll ? ["deleteAll"] : []),
    ...((isAncientAccount && !anyLikelyAffected) ? ["checkActive"] : []),
    ...((isStaleAccount && !anyLikelyAffected) ? ["dataDeletion"] : []),
  ];

  function unsubEntryForId(id: string): UnsubscribeEntry | undefined {
    const method = id.replace(/^unsub-/, "");
    return unsubMethods.find((m) => m.method === method);
  }

  function handleItemAction(id: string) {
    if (id.startsWith("unsub-")) {
      const entry = unsubEntryForId(id);
      if (!entry) return;
      setActiveItemId(id);
      setPendingUnsub(entry);
    } else if (id === "deleteMarketing" || id === "deleteAll") {
      setActiveItemId(id);
      setPendingDelete(id === "deleteAll" ? "all" : "marketing");
    } else if (id === "dataDeletion" || id === "breachAccess" || id === "breachDeletion") {
      setDataRequestType(id === "breachAccess" ? "access" : "deletion");
      setActiveTab("data");
    } else if (id === "checkActive") {
      window.api.openExternal(domainUrl);
    } else if (id === "breachReview") {
      setBreachOpen(true);
      document.getElementById("breach-alert")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const handleUnsubscribeConfirm = async (): Promise<void> => {
    if (!pendingUnsub || !detail) return;
    const entry = pendingUnsub;
    const vendorId = detail.vendor.id;
    setActionLoading(true);
    try {
      if (entry.method === "rfc8058") {
        const fallbackMethods = unsubMethods.filter(
          (m) => m.method !== "rfc8058",
        );
        const result = await window.api.executeRfc8058(entry.url);
        setPendingUnsub(null);
        if (result.success) {
          await window.api.markVendorUnsubscribed(vendorId);
          setUnsubResult({
            entry,
            kind: "success",
            fallbackMethods: [],
            trashAlso: true,
          });
        } else {
          setUnsubResult({
            entry,
            kind: "failure",
            fallbackMethods,
            trashAlso: true,
          });
        }
      } else {
        await window.api.openExternal(entry.url);
        setPendingUnsub(null);
        setUnsubCheck({ entry, trashAlso: true });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsubResultDone = async (): Promise<void> => {
    if (!unsubResult || !detail) return;
    const { entry, trashAlso } = unsubResult;
    setActionLoading(true);
    try {
      if (trashAlso) await window.api.trashVendorMessages(detail.vendor.id, ["bulk"]);
      setUnsubResult(null);
      setDoneIds((prev) => new Set(prev).add(`unsub-${entry.method}`));
      setActiveItemId(null);
      await refreshDetail();
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsubResultSpam = async (): Promise<void> => {
    if (!unsubResult || !detail) return;
    const { entry, trashAlso } = unsubResult;
    setActionLoading(true);
    try {
      await window.api.reportSpamVendor(detail.vendor.id);
      if (trashAlso) await window.api.trashVendorMessages(detail.vendor.id, ["bulk"]);
      setUnsubResult(null);
      setDoneIds((prev) => new Set(prev).add(`unsub-${entry.method}`));
      setActiveItemId(null);
      await refreshDetail();
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsubResultFallback = async (
    fallbackEntry: UnsubscribeEntry,
  ): Promise<void> => {
    if (!unsubResult) return;
    const { entry } = unsubResult;
    setActionLoading(true);
    try {
      await window.api.openExternal(fallbackEntry.url);
      setUnsubResult(null);
      setUnsubCheck({ entry, trashAlso: true });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsubCheckDone = async (): Promise<void> => {
    if (!unsubCheck || !detail) return;
    const { entry, trashAlso } = unsubCheck;
    setActionLoading(true);
    try {
      await window.api.markVendorUnsubscribed(detail.vendor.id);
      if (trashAlso) await window.api.trashVendorMessages(detail.vendor.id, ["bulk"]);
      setUnsubCheck(null);
      setDoneIds((prev) => new Set(prev).add(`unsub-${entry.method}`));
      setActiveItemId(null);
      await refreshDetail();
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsubCheckSpam = async (): Promise<void> => {
    if (!unsubCheck || !detail) return;
    const { entry } = unsubCheck;
    setActionLoading(true);
    try {
      await window.api.reportSpamVendor(detail.vendor.id);
      setUnsubCheck(null);
      setDoneIds((prev) => new Set(prev).add(`unsub-${entry.method}`));
      setActiveItemId(null);
      await refreshDetail();
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!pendingDelete || !detail) return;
    setActionLoading(true);
    try {
      const result = pendingDelete === "all"
        ? await window.api.trashVendorMessages(detail.vendor.id)
        : await window.api.trashVendorMessages(detail.vendor.id, ["bulk"]);
      if (!result.success) {
        setPendingDelete(null);
        setActiveItemId(null);
        return;
      }
      const doneId = pendingDelete === "all" ? "deleteAll" : "deleteMarketing";
      setPendingDelete(null);
      setDoneIds((prev) => new Set(prev).add(doneId));
      setActiveItemId(null);
      await refreshDetail();
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenWhitelistModal = (): void => {
    if (!canOpenWhitelistModal) return;
    setSelectedWhitelistValues(new Set());
    setWhitelistModalOpen(true);
  };

  const handleToggleWhitelistValue = (value: string): void => {
    setSelectedWhitelistValues((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const handleWhitelistConfirm = async (): Promise<void> => {
    if (selectedWhitelistValues.size === 0) return;
    setWhitelistLoading(true);
    try {
      await Promise.all(
        Array.from(selectedWhitelistValues).map((value) =>
          window.api.addWhitelistEntry(value),
        ),
      );
      setWhitelistModalOpen(false);
      setSelectedWhitelistValues(new Set());
      await refreshWhitelist();
    } finally {
      setWhitelistLoading(false);
    }
  };

  const handleWhitelistRemove = async (value: string): Promise<void> => {
    setWhitelistBusyValue(value);
    try {
      await window.api.removeWhitelistEntry(value);
      await refreshWhitelist();
    } finally {
      setWhitelistBusyValue(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          className="btn btn-ghost btn-sm gap-1"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-4 h-4" /> Back to overview
        </button>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-sm btn-ghost"
            onClick={handleOpenWhitelistModal}
            disabled={!canOpenWhitelistModal || whitelistLoading}
          >
            Add to whitelist
          </button>
          <button
            className={`btn btn-sm ${vendor.status === "reviewed" ? "btn-ghost" : "btn-neutral"}`}
            onClick={handleToggleReviewed}
          >
            {vendor.status === "reviewed" ? "Undo review" : "Mark as reviewed"}
          </button>
        </div>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl font-bold">{displayName}</h1>
          {vendor.company_slug && (
            <BadgeCheck
              className="w-5 h-5 text-info shrink-0"
              strokeWidth={2}
              aria-label="Verified company"
            />
          )}
          <button
            className="text-base-content/40 text-sm hover:text-base-content/70 hover:underline inline-flex items-center gap-1"
            onClick={() => window.api.openExternal(domainUrl)}
          >
            {vendor.root_domain ?? "(unknown)"} <ExternalLink className="w-3 h-3" />
          </button>
        </div>
        <p className="text-sm text-base-content/50 mt-1">
          Review what this company knows about you and decide what to do. For older
          accounts, consider unsubscribing and requesting data deletion.
        </p>
        {company?.categories && company.categories.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {company.categories.map((c) => {
              const info = RISK_CATEGORIES[c as keyof typeof RISK_CATEGORIES];
              return info ? (
                <span
                  key={c}
                  className={`badge badge-sm badge-soft ${badgeClass}`}
                >
                  {info.icon} {info.label}
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-base-content/50 uppercase">First seen</p>
          <p className="font-medium">
            {(first_activity ?? vendor.first_seen) ? formatAbsoluteDate(first_activity ?? vendor.first_seen ?? 0) : "Unknown"}
          </p>
        </div>
        <div>
          <p className="text-xs text-base-content/50 uppercase">Last seen</p>
          <p className="font-medium">
            {vendor.last_seen ? formatRelativeDate(vendor.last_seen) : "Unknown"}
          </p>
        </div>
        <div>
          <p className="text-xs text-base-content/50 uppercase">Emails</p>
          <p className="font-medium tabular-nums">{vendor.message_count}</p>
        </div>
        <div>
          <p className="text-xs text-base-content/50 uppercase">Senders</p>
          <p className="font-medium tabular-nums">{vendor.sender_count}</p>
        </div>
      </div>

      {/* Breach alert */}
      {breaches.length > 0 && (
        <div
          id="breach-alert"
          className={`card ${anyLikelyAffected ? "bg-error/10 border border-error/30" : "bg-warning/10 border border-warning/30"}`}
        >
          <div
            className="p-4 flex items-center gap-3 cursor-pointer"
            onClick={() => setBreachOpen(!breachOpen)}
          >
            <ChevronRight
              className={`w-4 h-4 text-base-content/50 shrink-0 transition-transform ${breachOpen ? "rotate-90" : ""}`}
              strokeWidth={2}
            />
            <span className="text-lg">{anyLikelyAffected ? "⚠️" : "ℹ️"}</span>
            <span className="font-semibold">
              {anyLikelyAffected ? "Security alert" : "Past security incident"}
            </span>
          </div>
          {breachOpen && (
            <div className="px-4 pb-4 flex flex-col gap-4">
              <ul className="text-sm space-y-1 list-disc list-inside">
                {breaches.map((bi) => (
                  <li key={bi.breach.name}>
                    <button
                      className="font-semibold underline hover:text-base-content/80"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.api.openExternal(
                          `https://haveibeenpwned.com/Breach/${bi.breach.name}`,
                        );
                      }}
                    >
                      {bi.breach.title}
                    </button>{" "}
                    was breached on{" "}
                    <span>
                      {new Date(bi.breach.breachDate).toLocaleDateString()}
                    </span>{" "}
                    —{" "}
                    {bi.likelyAffected
                      ? "your data was likely on this list"
                      : "your data was unlikely to be on this list"}
                    .
                  </li>
                ))}
              </ul>
              {(() => {
                const combined = [
                  ...new Set(
                    breaches
                      .filter((b) => b.likelyAffected)
                      .flatMap((b) => b.breach.dataClasses),
                  ),
                ];
                return combined.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {combined.map((item) => (
                      <span
                        key={item}
                        className="badge badge-sm badge-outline badge-error"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null;
              })()}
              <p className="text-xs text-base-content/50">
                Source: haveibeenpwned.com
              </p>
            </div>
          )}
        </div>
      )}

      {/* Risk profile */}
      <div className="card bg-base-200">
        <div
          className={`p-4 flex items-center gap-3 ${catInfo ? "cursor-pointer" : ""}`}
          onClick={catInfo ? () => setRiskOpen(!riskOpen) : undefined}
        >
          {catInfo && (
            <ChevronRight
              className={`w-4 h-4 text-base-content/50 shrink-0 transition-transform ${riskOpen ? "rotate-90" : ""}`}
              strokeWidth={2}
            />
          )}
          <span>{riskBadge}</span>
          <span className="font-semibold">Risk profile</span>
          <span className="text-base-content/60 text-sm">
            {riskDescription}
          </span>
        </div>
        {riskOpen && catInfo && (
          <div className="px-4 pb-4 space-y-4">
            <div>
              <p className="text-sm font-medium mt-2 mb-4">
                Data they likely hold
              </p>
              <div className="flex flex-wrap gap-2">
                {catInfo.dataAtRisk.map((item) => (
                  <span key={item} className="badge badge-sm badge-soft">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            {company?.runs && company.runs.length > 0 && (
              <div>
                <p className="text-sm font-medium mt-6 mb-4">
                  {company.name} is also responsible for:
                </p>
                <div className="flex flex-wrap gap-2">
                  {company.runs.map((run) => (
                    <span key={run} className="badge badge-sm badge-soft">
                      {run}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs tabs-box p-2">
        <div role="tablist" className="flex">
          <button
            role="tab"
            aria-selected={activeTab === "actions"}
            className={`tab ${activeTab === "actions" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("actions")}
          >
            Actions
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "data"}
            className={`tab ${activeTab === "data" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("data")}
          >
            Data requests
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "emails"}
            className={`tab ${activeTab === "emails" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("emails")}
          >
            Emails
          </button>

          <div className={hasAnyActivity ? "" : "tooltip tooltip-bottom"} data-tip={hasAnyActivity ? undefined : "No activity yet"}>
            <button
              role="tab"
              aria-selected={activeTab === "activity"}
              className={`tab ${activeTab === "activity" ? "tab-active" : ""} ${hasAnyActivity ? "" : "tab-disabled opacity-40 cursor-not-allowed"}`}
              onClick={() => { if (hasAnyActivity) setActiveTab("activity"); }}
            >
              Activity
            </button>
          </div>
        </div>

        {/* Actions tab */}
        <div className={`tab-content px-4 py-3 ${activeTab === "actions" ? "!block" : ""}`}>
          {actionItems.length === 0 ? (
            <p className="text-base-content/50 text-sm">No recommended actions for this company.</p>
          ) : (
            <div>
              {/* Contextual recommendation blurb */}
              <p className="text-sm text-base-content/60 mb-4">
                {(() => {
                  const parts: string[] = [];
                  if (anyLikelyAffected) {
                    parts.push(`This sender was involved in a data breach that likely included your account. Your personal data may be at risk, so it is worth reviewing what was exposed and taking steps to protect yourself.`);
                  }
                  if (isAncientAccount) {
                    const yearsAgo = vendor.last_seen
                      ? Math.round((now - vendor.last_seen) / (365.25 * 24 * 60 * 60 * 1000))
                      : null;
                    parts.push(`This sender last emailed you${yearsAgo ? ` over ${yearsAgo} years` : " a very long time"} ago. They may no longer exist, so it's worth checking before taking any further action.`);
                  } else if (isStaleAccount) {
                    const yearsAgo = vendor.last_seen
                      ? Math.round((now - vendor.last_seen) / (365.25 * 24 * 60 * 60 * 1000))
                      : null;
                    parts.push(`You haven't heard from this sender in${yearsAgo ? ` over ${yearsAgo} years` : " a long time"}, but they still hold your data. Requesting deletion removes any lingering risk.`);
                  }
                  if (hasActiveSubscription) {
                    parts.push(`This sender is still sending you marketing emails. Unsubscribing reduces clutter and cuts down the data they collect about you.`);
                  }
                  if ((showDeleteMarketing || showDeleteAll) && !hasActiveSubscription && !isStaleAccount && !isAncientAccount && !anyLikelyAffected) {
                    parts.push(`This sender has sent you a lot of emails over time. Deleting them reduces the amount of data stored in your inbox.`);
                  }
                  return parts.join(" ");
                })()}
              </p>

              {anyLikelyAffected && (
                <ActionTaskRow
                  index={actionItems.indexOf("breachReview") + 1}
                  label="Review the security incident"
                  description="Check what data was exposed in this breach. See the Security alert on this page for details."
                  done={doneIds.has("breachReview")}
                  spinning={false}
                  anyLoading={actionLoading}
                  actionLabel="Review"
                  variant="warning"
                  onAction={() => handleItemAction("breachReview")}
                />
              )}
              {anyLikelyAffected && (
                <ActionTaskRow
                  index={actionItems.indexOf("breachAccess") + 1}
                  label="Request your data"
                  description="Request this sender to share all data they hold about you. Opens a pre-filled request in the Data requests tab."
                  done={doneIds.has("breachAccess")}
                  spinning={false}
                  anyLoading={actionLoading}
                  actionLabel="Open"
                  onAction={() => handleItemAction("breachAccess")}
                />
              )}
              {anyLikelyAffected && (
                <ActionTaskRow
                  index={actionItems.indexOf("breachDeletion") + 1}
                  label="Request to delete your data"
                  description="Request this sender to erase all data they hold about you. Opens a pre-filled request in the Data requests tab."
                  done={doneIds.has("breachDeletion")}
                  spinning={false}
                  anyLoading={actionLoading}
                  actionLabel="Open"
                  onAction={() => handleItemAction("breachDeletion")}
                />
              )}
              {hasActiveSubscription && unsubMethods.map((entry) => {
                const id = `unsub-${entry.method}`;
                return (
                  <ActionTaskRow
                    key={id}
                    index={actionItems.indexOf(id) + 1}
                    label="Unsubscribe"
                    description={methodDescription(entry.method, entry.url)}
                    done={doneIds.has(id)}
                    spinning={activeItemId === id && actionLoading}
                    anyLoading={actionLoading}
                    actionLabel="Unsubscribe"
                    onAction={() => handleItemAction(id)}
                  />
                );
              })}
              {showDeleteMarketing && (
                <ActionTaskRow
                  index={actionItems.indexOf("deleteMarketing") + 1}
                  label="Delete marketing emails"
                  description={`Moves ${bulkCount} marketing and newsletter emails to trash`}
                  done={doneIds.has("deleteMarketing")}
                  spinning={activeItemId === "deleteMarketing" && actionLoading}
                  anyLoading={actionLoading}
                  actionLabel="Delete"
                  onAction={() => handleItemAction("deleteMarketing")}
                />
              )}
              {showDeleteAll && (
                <ActionTaskRow
                  index={actionItems.indexOf("deleteAll") + 1}
                  label="Delete all emails"
                  description={`Moves all ${vendor.message_count} emails from this sender to trash, including receipts and notifications`}
                  done={doneIds.has("deleteAll")}
                  spinning={activeItemId === "deleteAll" && actionLoading}
                  anyLoading={actionLoading}
                  actionLabel="Delete"
                  onAction={() => handleItemAction("deleteAll")}
                />
              )}
              {isAncientAccount && !anyLikelyAffected && (
                <ActionTaskRow
                  index={actionItems.indexOf("checkActive") + 1}
                  label="Check if this company is still active"
                  description="This sender may no longer exist. Visit their website to verify before taking further action."
                  done={doneIds.has("checkActive")}
                  spinning={false}
                  anyLoading={actionLoading}
                  actionLabel="Visit website"
                  onAction={() => handleItemAction("checkActive")}
                />
              )}
              {isStaleAccount && !anyLikelyAffected && (
                <ActionTaskRow
                  index={actionItems.indexOf("dataDeletion") + 1}
                  label="Request to delete your data"
                  description="Request this sender to erase all data they hold about you. Opens a pre-filled request in the Data requests tab."
                  done={doneIds.has("dataDeletion")}
                  spinning={false}
                  anyLoading={actionLoading}
                  actionLabel="Open"
                  onAction={() => handleItemAction("dataDeletion")}
                />
              )}
            </div>
          )}
        </div>

        {/* Data requests tab */}
        <div className={`tab-content px-4 py-3 text-sm space-y-3 ${activeTab === "data" ? "!block" : ""}`}>
          {company?.comments &&
            company.comments.length > 0 &&
            company.comments.map((comment, i) => (
              <p key={i} className="text-base-content/70">
                {comment}
              </p>
            ))}

          {company?.webform && (
            <>
              <button
                className="btn btn-primary btn-sm gap-1"
                onClick={() => window.api.openExternal(company.webform!)}
              >
                Open privacy form <ExternalLink className="w-3.5 h-3.5" />
              </button>
              {contactEmail && (deletionEmail || accessEmail) && <hr className="border-base-100 mt-2 mb-4" />}
            </>
          )}

          {contactEmail && (deletionEmail || accessEmail) ? (
            <>
              {!company && (
                <p className="text-base-content/50 text-xs">
                  This contact address is not verified. We recommend checking their privacy policy before sending a request.
                </p>
              )}
              <div className="flex items-center gap-3">
                <label className="text-xs text-base-content/50 uppercase shrink-0">Purpose</label>
                <select
                  className="select select-bordered select-sm"
                  value={dataRequestType}
                  onChange={(e) => { setDataRequestType(e.target.value as "access" | "deletion"); setCopiedRequest(false); }}
                >
                  <option value="deletion">Request data deletion</option>
                  <option value="access">Request data access</option>
                </select>
              </div>
              {(() => {
                const email = dataRequestType === "access" ? accessEmail : deletionEmail;
                if (!email) return null;
                return (
                  <>
                    <div>
                      <p className="text-base-content/50 text-xs uppercase mb-1">To</p>
                      <p className="font-mono">{contactEmail}</p>
                    </div>
                    <div>
                      <p className="text-base-content/50 text-xs uppercase mb-1">Subject</p>
                      <p>{email.subject}</p>
                    </div>
                    <div>
                      <p className="text-base-content/50 text-xs uppercase mb-1">Message</p>
                      <pre className="whitespace-pre-wrap text-base-content/80 bg-base-100 rounded-lg p-3 mt-1">
                        {email.body}
                      </pre>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-primary btn-sm gap-1"
                        onClick={() => {
                          const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
                          window.api.openExternal(mailto);
                        }}
                      >
                        Open email client <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="btn btn-neutral btn-sm gap-1"
                        onClick={() => handleCopyRequest(email)}
                      >
                        <Clipboard className="w-3.5 h-3.5" />
                        {copiedRequest ? "Copied!" : "Copy message"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <p className="text-base-content/50">
              No contact information available for data requests.
            </p>
          )}
        </div>

        {/* Emails tab */}
        <div className={`tab-content py-2 ${activeTab === "emails" ? "!block" : ""}`}>
          {allMessages.length > 0 ? (
            <EmailsBySender
              messages={allMessages}
              senderCount={vendor.sender_count}
            />
          ) : (
            <p className="text-base-content/50 text-sm px-4 py-2">
              No emails found.
            </p>
          )}
        </div>

        {/* Activity tab */}
        <div className={`tab-content px-4 py-3 ${activeTab === "activity" ? "!block" : ""}`}>
          {!hasAnyActivity ? (
            <p className="text-sm text-base-content/50">
              No actions taken yet.
            </p>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">Activity logs</h3>
                {sortedActivityLog.length === 0 ? (
                  <p className="text-sm text-base-content/50">No log entries yet.</p>
                ) : (
                  <div className="font-mono text-sm divide-y divide-base-300">
                    {sortedActivityLog.map((entry) => (
                      <div
                        key={entry.id}
                        className="grid grid-cols-[1fr_auto] items-center gap-4 py-2"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-base-content/40 shrink-0">
                            {formatAbsoluteDate(entry.actionedAt)}
                          </span>
                          <span
                            className={`shrink-0 ${ACTION_COLORS[entry.actionType]}`}
                          >
                            {ACTION_LABELS[entry.actionType]}
                          </span>
                        </div>
                        <span className="text-base-content/40 text-right shrink-0">
                          {entry.messageCount.toLocaleString()} emails
                          {entry.sizeBytes > 0 &&
                            ` · ${formatBytes(entry.sizeBytes)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Whitelist</h3>
                {sortedWhitelistEntries.length === 0 ? (
                  <p className="text-sm text-base-content/50">No whitelisted email or domain for this account.</p>
                ) : (
                  <div className="font-mono text-sm divide-y divide-base-300">
                    {sortedWhitelistEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="grid grid-cols-[1fr_auto] items-center gap-4 py-2"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-base-content/40 shrink-0">
                            {formatAbsoluteDate(Date.parse(entry.created_at))}
                          </span>
                          <span className="shrink-0 text-base-content/80">
                            {entry.value}
                          </span>
                        </div>
                        <button
                          className="btn btn-ghost btn-xs"
                          disabled={
                            whitelistBusyValue === entry.value
                          }
                          onClick={() => handleWhitelistRemove(entry.value)}
                        >
                          {whitelistBusyValue === entry.value
                            ? "Removing..."
                            : "Remove"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm modal */}
      {whitelistModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">Add to whitelist</h3>
            <div className="text-sm text-base-content/80 space-y-3">
              <p>Select an email address or domain to whitelist.</p>
              <div className="space-y-2">
                {addableWhitelistOptions.map((option) => (
                  <label key={option} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={selectedWhitelistValues.has(option)}
                      onChange={() => handleToggleWhitelistValue(option)}
                    />
                    <span className="font-mono text-sm break-all">{option}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-action mt-6">
              <button
                className="btn btn-sm btn-neutral"
                onClick={() => {
                  if (!whitelistLoading) {
                    setWhitelistModalOpen(false);
                    setSelectedWhitelistValues(new Set());
                  }
                }}
                disabled={whitelistLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={handleWhitelistConfirm}
                disabled={whitelistLoading || selectedWhitelistValues.size === 0}
              >
                {whitelistLoading ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  "Add"
                )}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button
              type="submit"
              onClick={() => {
                if (!whitelistLoading) {
                  setWhitelistModalOpen(false);
                  setSelectedWhitelistValues(new Set());
                }
              }}
              disabled={whitelistLoading}
            >
              close
            </button>
          </form>
        </div>
      )}

      {pendingDelete && (
        <ActionModal
          isOpen
          title={pendingDelete === "all" ? "Delete all emails" : "Delete marketing emails"}
          confirmLabel="Move to trash"
          confirmVariant="primary"
          onConfirm={handleDeleteConfirm}
          onCancel={() => { if (!actionLoading) { setPendingDelete(null); setActiveItemId(null); } }}
          loading={actionLoading}
        >
          {pendingDelete === "all" ? (
            <p>Move all <strong>{vendor.message_count}</strong> emails from <strong>{displayName}</strong> to trash? This includes all email types.</p>
          ) : (
            <p>Move marketing emails from <strong>{displayName}</strong> to trash?</p>
          )}
        </ActionModal>
      )}

      {/* Unsubscribe confirm modal */}
      {pendingUnsub && (
        <ActionModal
          isOpen
          title="Unsubscribe"
          confirmLabel="Unsubscribe"
          confirmVariant="primary"
          onConfirm={handleUnsubscribeConfirm}
          onCancel={() => {
            if (!actionLoading) { setPendingUnsub(null); setActiveItemId(null); }
          }}
          loading={actionLoading}
        >
          <p>{unsubDescription(pendingUnsub, displayName)}</p>
        </ActionModal>
      )}

      {/* rfc8058 result — success */}
      {unsubResult?.kind === "success" && (
        <ActionModal
          isOpen
          title="Unsubscribe"
          confirmLabel="Done"
          confirmVariant="primary"
          onConfirm={handleUnsubResultDone}
          onCancel={() => {
            if (!actionLoading) {
              setDoneIds((prev) => new Set(prev).add(`unsub-${unsubResult.entry.method}`));
              setUnsubResult(null);
              setActiveItemId(null);
            }
          }}
          loading={actionLoading}
        >
          <p>
            Successfully unsubscribed from <strong>{displayName}</strong>.
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
      )}

      {/* rfc8058 result — failure */}
      {unsubResult?.kind === "failure" && (
        <ActionModal
          isOpen
          title="Unsubscribe"
          secondaryLabel="Mark as spam"
          secondaryVariant="neutral"
          onSecondary={handleUnsubResultSpam}
          onCancel={() => {
            if (!actionLoading) { setUnsubResult(null); setActiveItemId(null); }
          }}
          loading={actionLoading}
        >
          <p>
            Couldn't automatically unsubscribe from{" "}
            <strong>{displayName}</strong>.
          </p>
          {unsubResult.fallbackMethods.length > 0 && (
            <div className="space-y-2 mt-1">
              <p className="text-base-content/60">Try another method:</p>
              {unsubResult.fallbackMethods.map((entry) => (
                <div
                  key={entry.method}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-base-content/80">
                    {unsubDescription(entry, displayName)}
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
      )}

      {/* External link confirmation */}
      {unsubCheck && (
        <ActionModal
          isOpen
          title="Unsubscribe"
          secondaryLabel="No, mark as spam"
          secondaryVariant="neutral"
          confirmLabel="Yes, mark done"
          confirmVariant="primary"
          onSecondary={handleUnsubCheckSpam}
          onConfirm={handleUnsubCheckDone}
          onCancel={() => {
            if (!actionLoading) { setUnsubCheck(null); setActiveItemId(null); }
          }}
          loading={actionLoading}
        >
          <p>
            Did you successfully unsubscribe from <strong>{displayName}</strong>
            ?
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
      )}
    </div>
  );
}
