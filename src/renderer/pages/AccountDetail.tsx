import { useEffect, useCallback, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import type {
  VendorDetail,
  Message,
  UnsubscribeEntry,
  ActivityEntry,
} from "@shared/types";
import {
  formatRelativeDate,
  formatAbsoluteDate,
  formatBytes,
} from "@shared/formatting";
import { RISK_CATEGORIES, RISK_LEVELS } from "@shared/languages";
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

function buildDeletionEmail(
  userEmail: string,
  accountIdentifier?: string,
): {
  subject: string;
  body: string;
} {
  return {
    subject: `Data Deletion Request`,
    body: `To whom it may concern,

I am requesting the deletion of all personal data you hold about me. I no longer wish for you to process my data and there is no ongoing reason for you to retain it.

Please:
- Delete all account data and purchase history
- Unsubscribe me from all marketing emails
- Stop processing my data
- Notify third parties who received my data

Account identifier:
- Email: ${userEmail}
${accountIdentifier ? `- Account reference: ${accountIdentifier}` : ""}

Please confirm completion of this request within 30 days.

If you need any information to verify my identity, let me know. Thank you!

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

export default function AccountDetail(): JSX.Element {
  const { groupKey } = useParams<{ groupKey: string }>();
  const { state } = useLocation();
  const accountsState = (state as { accountsState?: unknown } | null)
    ?.accountsState;
  const [detail, setDetail] = useState<VendorDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [riskOpen, setRiskOpen] = useState(false);
  const [breachOpen, setBreachOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingUnsub, setPendingUnsub] = useState<UnsubscribeEntry | null>(
    null,
  );
  const [unsubCheck, setUnsubCheck] = useState<{
    entry: UnsubscribeEntry;
    trashAlso: boolean;
  } | null>(null);
  const [unsubResult, setUnsubResult] = useState<{
    entry: UnsubscribeEntry;
    kind: "success" | "failure";
    fallbackMethods: UnsubscribeEntry[];
    trashAlso: boolean;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [unsubDone, setUnsubDone] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<
    "emails" | "mailing" | "data" | "activity"
  >("emails");

  useEffect(() => {
    if (!groupKey) return;
    setLoading(true);
    window.api
      .getVendorDetail(decodeURIComponent(groupKey))
      .then((d) => {
        setDetail(d);
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
        <Link
          to="/accounts"
          state={{ restore: accountsState }}
          className="btn btn-ghost btn-sm gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to overview
        </Link>
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
  // When category is unknown, fall back to the best signal we have from message types.
  // has_orders → shopping (shipping address + payment data); has_account → services.
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

  const domainUrl = company?.web
    ? company.web
    : `https://${vendor.root_domain ?? ""}`;

  const handleCopyMessage = async () => {
    if (!deletionEmail || !contactEmail) return;
    const full = `To: ${contactEmail}\nSubject: ${deletionEmail.subject}\n\n${deletionEmail.body}`;
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  const mailingDisabled = unsubMethods.length === 0;

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
      if (trashAlso) await window.api.trashVendorMessages(detail.vendor.id);
      setUnsubResult(null);
      setUnsubDone((prev) => new Set(prev).add(entry.method));
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
      if (trashAlso) await window.api.trashVendorMessages(detail.vendor.id);
      setUnsubResult(null);
      setUnsubDone((prev) => new Set(prev).add(entry.method));
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
      if (trashAlso) await window.api.trashVendorMessages(detail.vendor.id);
      setUnsubCheck(null);
      setUnsubDone((prev) => new Set(prev).add(entry.method));
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
      setUnsubDone((prev) => new Set(prev).add(entry.method));
      await refreshDetail();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          to="/accounts"
          state={{ restore: accountsState }}
          className="btn btn-ghost btn-sm gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to overview
        </Link>
        <button
          className={`btn btn-sm ${vendor.status === "reviewed" ? "btn-ghost" : "btn-neutral"}`}
          onClick={handleToggleReviewed}
        >
          {vendor.status === "reviewed" ? "Undo review" : "Mark as reviewed"}
        </button>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{displayName}</h1>
          {vendor.company_slug && (
            <BadgeCheck
              className="w-5 h-5 text-info shrink-0"
              strokeWidth={2}
              aria-label="Verified company"
            />
          )}
        </div>
        <button
          className="text-base-content/60 text-sm hover:text-base-content/80 hover:underline inline-flex items-center gap-1 mt-1"
          onClick={() => window.api.openExternal(domainUrl)}
        >
          {vendor.root_domain ?? "(unknown)"}{" "}
          <ExternalLink className="w-3 h-3" />
        </button>
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
            {formatAbsoluteDate(first_activity ?? vendor.first_seen ?? 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-base-content/50 uppercase">Last seen</p>
          <p className="font-medium">
            {formatRelativeDate(vendor.last_seen ?? 0)}
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
              <ul className="text-sm space-y-1">
                {breaches.map((bi) => (
                  <li key={bi.breach.name}>
                    {bi.breach.title} was breached on{" "}
                    <span className="font-medium">
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
                Source:{" "}
                {breaches.map((bi, i) => (
                  <span key={bi.breach.name}>
                    {i > 0 && ", "}
                    <button
                      className="underline hover:text-base-content/80"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.api.openExternal(
                          `https://haveibeenpwned.com/Breach/${bi.breach.name}`,
                        );
                      }}
                    >
                      {bi.breach.title}
                    </button>
                  </span>
                ))}{" "}
                (haveibeenpwned.com)
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
            aria-selected={activeTab === "emails"}
            className={`tab ${activeTab === "emails" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("emails")}
          >
            Latest emails
          </button>

          {mailingDisabled && activeTab !== "mailing" ? (
            <span
              className="tooltip tooltip-bottom"
              data-tip="No mailing list subscriptions found"
            >
              <button
                role="tab"
                className="tab opacity-40 cursor-not-allowed"
                disabled
              >
                Mailing lists
              </button>
            </span>
          ) : (
            <button
              role="tab"
              aria-selected={activeTab === "mailing"}
              className={`tab ${activeTab === "mailing" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("mailing")}
            >
              Mailing lists
            </button>
          )}

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
            aria-selected={activeTab === "activity"}
            className={`tab ${activeTab === "activity" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("activity")}
          >
            Activity
          </button>
        </div>

        <div
          className={`tab-content py-2 ${activeTab === "emails" ? "!block" : ""}`}
        >
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

        <div
          className={`tab-content px-4 py-3 text-sm space-y-3 ${activeTab === "mailing" ? "!block" : ""}`}
        >
          {unsubMethods.length === 0 ? (
            <p className="text-base-content/50">
              No mailing list subscriptions found.
            </p>
          ) : (
            unsubMethods.map((entry) => (
              <div
                key={entry.method}
                className="flex items-center justify-between gap-4"
              >
                <p className="text-base-content/70">
                  {methodDescription(entry.method, entry.url)}
                </p>
                {unsubDone.has(entry.method) ? (
                  <span className="badge badge-success badge-sm shrink-0">
                    Done
                  </span>
                ) : (
                  <button
                    className="btn btn-neutral btn-sm shrink-0"
                    disabled={actionLoading}
                    onClick={() => setPendingUnsub(entry)}
                  >
                    Unsubscribe
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div
          className={`tab-content px-4 py-3 text-sm space-y-3 ${activeTab === "data" ? "!block" : ""}`}
        >
          {!company && (
            <p className="text-base-content/50">
              This contact address is not verified. We recommend checking their
              privacy policy before sending a request.
            </p>
          )}

          {company?.comments &&
            company.comments.length > 0 &&
            company.comments.map((comment, i) => (
              <p key={i} className="text-base-content/70">
                {comment}
              </p>
            ))}

          {company?.webform && (
            <button
              className="btn btn-ghost btn-sm gap-1 -ml-2"
              onClick={() => window.api.openExternal(company.webform!)}
            >
              Open privacy webform <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

          {deletionEmail && contactEmail ? (
            <>
              <div>
                <p className="text-base-content/50 text-xs uppercase mb-1">
                  To
                </p>
                <p className="font-mono">{contactEmail}</p>
              </div>
              <div>
                <p className="text-base-content/50 text-xs uppercase mb-1">
                  Subject
                </p>
                <p>{deletionEmail.subject}</p>
              </div>
              <div>
                <p className="text-base-content/50 text-xs uppercase mb-1">
                  Message
                </p>
                <pre className="whitespace-pre-wrap text-base-content/80 bg-base-100 rounded-lg p-3 mt-1">
                  {deletionEmail.body}
                </pre>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-primary btn-sm gap-1"
                  onClick={() => {
                    const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(deletionEmail.subject)}&body=${encodeURIComponent(deletionEmail.body)}`;
                    window.api.openExternal(mailto);
                  }}
                >
                  Open email client <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  className="btn btn-neutral btn-sm gap-1"
                  onClick={handleCopyMessage}
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  {copied ? "Copied!" : "Copy message"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-base-content/50">
              No contact information available for data requests.
            </p>
          )}
        </div>

        <div
          className={`tab-content px-4 py-3 ${activeTab === "activity" ? "!block" : ""}`}
        >
          {activityLog.length === 0 ? (
            <p className="text-sm text-base-content/50">
              No actions taken yet.
            </p>
          ) : (
            <div className="font-mono text-sm divide-y divide-base-300">
              {activityLog.map((entry) => (
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
      </div>

      {/* Unsubscribe confirm modal */}
      {pendingUnsub && (
        <ActionModal
          isOpen
          title="Unsubscribe"
          confirmLabel="Unsubscribe"
          confirmVariant="primary"
          onConfirm={handleUnsubscribeConfirm}
          onCancel={() => {
            if (!actionLoading) setPendingUnsub(null);
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
              setUnsubDone((prev) =>
                new Set(prev).add(unsubResult.entry.method),
              );
              setUnsubResult(null);
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
            if (!actionLoading) setUnsubResult(null);
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
            if (!actionLoading) setUnsubCheck(null);
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
