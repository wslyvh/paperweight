import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type {
  ActionType,
  GdprCaseDetail,
  GdprCaseReplies,
  GdprRequestType,
  Message,
} from "@shared/types";
import { formatAbsoluteDate, formatShortDate } from "@shared/formatting";
import {
  REMINDER_AFTER_DAYS,
  FOLLOWUP_AFTER_DAYS,
  ESCALATE_AFTER_DAYS,
} from "@shared/cases";
import { detectLanguageFromDomain } from "@shared/gdpr/resolution";
import { buildReminderEmail, buildFollowupEmail } from "@shared/gdpr/templates";
import { ArrowLeft, ChevronDown, ExternalLink } from "lucide-react";
import ActionModal from "../components/ActionModal";
import { canAccountSend } from "../utils/account";
import { errText } from "../utils/errText";
import {
  ACTION_COLORS,
  ACTION_LABELS,
  CASE_OUTCOME_LABELS,
  gdprRequestLabel,
} from "../utils/activityLabels";

const DAY_MS = 24 * 60 * 60 * 1000;
const GUIDE_URL = "https://www.paperweight.email/guides/how-to-exercise-your-gdpr-rights";
const AUTHORITIES_URL = "https://www.paperweight.email/resources/authorities";

const NEXT_ACTION_DAY = {
  reminder: REMINDER_AFTER_DAYS,
  followup: FOLLOWUP_AFTER_DAYS,
  escalate: ESCALATE_AFTER_DAYS,
} as const;

const OUTBOUND_TYPES: ActionType[] = ["gdpr_request_sent", "reminder_sent", "followup_sent"];
const STATUS_TYPES: ActionType[] = ["case_closed", "escalated"];

interface CommunicationItem {
  id: string;
  date: number;
  label: string;
  colorClass: string;
  badge?: "sent" | "case";
  muted?: boolean;
  messageId?: string;
  manuallyLinked?: boolean;
  /** Expandable body text — the sent email (outbound) or the message preview (inbound). */
  content?: string;
  /** Inbound case message that arrived after the case was last viewed. */
  isNew?: boolean;
}

function messagePreview(preview?: string): string | undefined {
  if (!preview) return undefined;
  const trimmed = preview.trim();
  if (!trimmed || trimmed === "…" || trimmed === "...") return undefined;
  return trimmed;
}

function outboundLabel(actionType: ActionType, requestType: GdprRequestType): string {
  if (actionType === "gdpr_request_sent") return gdprRequestLabel(requestType);
  return ACTION_LABELS[actionType];
}

function buildCommunicationTimeline(
  events: GdprCaseDetail["events"],
  replies: GdprCaseReplies,
  requestType: GdprRequestType,
  lastViewedAt?: number,
): CommunicationItem[] {
  const items: CommunicationItem[] = [];
  const threadIds = new Set(replies.threadMatches.map((m) => m.id));
  const linkedIds = new Set(replies.linkedMessageIds);

  for (const event of events) {
    if (event.actionType === "reply_received" || event.actionType === "case_message_linked") {
      continue;
    }

    if (OUTBOUND_TYPES.includes(event.actionType)) {
      items.push({
        id: `event-${event.id}`,
        date: event.actionedAt,
        label: outboundLabel(event.actionType, requestType),
        colorClass: ACTION_COLORS[event.actionType],
        badge: "sent",
        content: event.body,
      });
      continue;
    }

    if (STATUS_TYPES.includes(event.actionType)) {
      items.push({
        id: `event-${event.id}`,
        date: event.actionedAt,
        label: ACTION_LABELS[event.actionType],
        colorClass: ACTION_COLORS[event.actionType],
      });
    }
  }

  const inbound: Message[] = [...replies.threadMatches, ...replies.otherReplies];
  for (const message of inbound) {
    const threadMatch = threadIds.has(message.id);
    const manuallyLinked = linkedIds.has(message.id);
    const inCase = threadMatch || manuallyLinked;
    items.push({
      id: `msg-${message.id}`,
      messageId: message.id,
      date: message.date,
      label: message.subject ?? "(no subject)",
      colorClass: inCase ? "text-base-content" : "text-base-content/45",
      badge: inCase ? "case" : undefined,
      muted: !inCase,
      manuallyLinked,
      content: messagePreview(message.body_preview),
      isNew: inCase && message.date > (lastViewedAt ?? 0),
    });
  }

  items.sort((a, b) => b.date - a.date);
  return items;
}

const BADGE_LABELS: Record<NonNullable<CommunicationItem["badge"]>, string> = {
  sent: "Sent",
  case: "Case",
};

interface CommunicationRowProps {
  item: CommunicationItem;
  caseActive?: boolean;
  linkLoading?: boolean;
  onToggleLink?: (messageId: string, linked: boolean) => void;
}

function CommunicationRow({ item, caseActive, linkLoading, onToggleLink }: CommunicationRowProps) {
  const [open, setOpen] = useState(false);
  const expandable = !!item.content;
  const canLink = !!(caseActive && item.messageId && onToggleLink);

  return (
    <div
      className={`rounded-lg transition-colors ${item.muted ? "opacity-70" : ""} ${
        item.isNew ? "bg-base-300/60" : ""
      } ${expandable ? "hover:bg-base-300" : ""}`}
    >
      <button
        type="button"
        className={`w-full grid grid-cols-[7rem_1fr_auto] gap-3 px-3 py-3 text-sm text-left items-start rounded-lg ${
          expandable ? "cursor-pointer" : "cursor-default"
        }`}
        onClick={() => expandable && setOpen((v) => !v)}
        disabled={!expandable}
      >
        <span className="text-base-content/40 font-mono text-xs pt-0.5 tabular-nums">
          {formatAbsoluteDate(item.date)}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            {item.isNew && (
              <span className="badge badge-xs badge-error shrink-0">New</span>
            )}
            {item.badge && (
              <span
                className={`badge badge-xs badge-soft shrink-0 ${
                  item.badge === "case" ? "badge-info" : "badge-primary"
                }`}
              >
                {BADGE_LABELS[item.badge]}
              </span>
            )}
            <span className={item.colorClass}>{item.label}</span>
          </span>
        </span>
        {expandable ? (
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-base-content/40 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        ) : (
          <span className="w-4" />
        )}
      </button>
      {open && item.content && (
        <div className="grid grid-cols-[7rem_1fr_auto] gap-3 px-3 pb-3">
          <div />
          <div className="col-span-2 space-y-2 mr-0">
            <pre className="whitespace-pre-wrap text-sm text-base-content/70 bg-base-100 rounded-lg p-3">
              {item.content}
            </pre>
            {canLink && !item.badge && (
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                disabled={linkLoading}
                onClick={() => onToggleLink(item.messageId!, true)}
              >
                Add to case
              </button>
            )}
            {canLink && item.manuallyLinked && (
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                disabled={linkLoading}
                onClick={() => onToggleLink(item.messageId!, false)}
              >
                Remove from case
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Timeline({
  openedAt,
  nextAction,
}: {
  openedAt: number;
  nextAction?: keyof typeof NEXT_ACTION_DAY;
}) {
  const days = (Date.now() - openedAt) / DAY_MS;
  const progress = Math.min(100, (days / ESCALATE_AFTER_DAYS) * 100);
  const highlightDay = nextAction ? NEXT_ACTION_DAY[nextAction] : undefined;
  const marks = [
    { day: 0, label: "Sent" },
    { day: REMINDER_AFTER_DAYS, label: "Reminder" },
    { day: FOLLOWUP_AFTER_DAYS, label: "Deadline" },
    { day: ESCALATE_AFTER_DAYS, label: "Escalate" },
  ];

  return (
    <div className="card bg-base-200">
      <div className="card-body p-4 gap-3">
        <div className="relative h-2 bg-base-300 rounded-full mx-3">
          <div
            className="absolute h-2 bg-primary/30 rounded-full"
            style={{ width: `${progress}%` }}
          />
          {marks.map((mark, i) => {
            const isFirst = i === 0;
            const isLast = i === marks.length - 1;
            const isNext = mark.day === highlightDay;
            return (
              <div
                key={mark.day}
                className={`absolute rounded-full ${isFirst ? "left-0" : isLast ? "right-0" : "-translate-x-1/2"} ${
                  isNext
                    ? "w-2.5 h-2.5 bg-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-base-200"
                    : `w-2 h-2 ${days >= mark.day ? "bg-primary" : "bg-base-content/20"}`
                }`}
                style={isFirst || isLast ? undefined : { left: `${(mark.day / ESCALATE_AFTER_DAYS) * 100}%` }}
              />
            );
          })}
        </div>
        <div className="relative h-8 mx-3 text-xs text-base-content/50">
          {marks.map((mark, i) => {
            const isFirst = i === 0;
            const isLast = i === marks.length - 1;
            const isNext = mark.day === highlightDay;
            return (
              <span
                key={mark.day}
                className={`absolute whitespace-nowrap ${isFirst ? "left-0" : isLast ? "right-0 text-right" : "-translate-x-1/2 text-center"} ${
                  isNext ? "text-primary font-semibold" : ""
                }`}
                style={isFirst || isLast ? undefined : { left: `${(mark.day / ESCALATE_AFTER_DAYS) * 100}%` }}
              >
                {mark.label}
                <br />
                {formatShortDate(openedAt + mark.day * DAY_MS)}
              </span>
            );
          })}
        </div>
        <details className="collapse collapse-arrow bg-base-100 rounded-box">
          <summary className="collapse-title text-xs font-medium py-2 min-h-0">
            Case opened {formatAbsoluteDate(openedAt)}, {Math.max(0, Math.floor(days))} days ago
          </summary>
          <div className="collapse-content text-xs text-base-content/60 space-y-2 pb-3">
            <p>
              Companies have 30 days to respond, extendable to 60 days for complex
              requests, but they must notify you if extending.
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Day 14: send a gentle reminder if you have not heard back.</li>
              <li>Day 30: follow up formally, referencing the statutory deadline.</li>
              <li>Day 60: consider filing a complaint with your national authority if still unresolved.</li>
            </ul>
            <button className="link" onClick={() => window.api.openExternal(GUIDE_URL)}>
              Read our guide on exercising your GDPR rights
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}

export default function CaseDetail(): JSX.Element {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const id = Number(caseId);

  const [caseDetail, setCaseDetail] = useState<GdprCaseDetail>();
  const [replies, setReplies] = useState<GdprCaseReplies>({
    threadMatches: [],
    otherReplies: [],
    linkedMessageIds: [],
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [canSend, setCanSend] = useState(true);
  const [sendAction, setSendAction] = useState<"reminder" | "followup" | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [alsoRequestDeletion, setAlsoRequestDeletion] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  // One error channel for whichever modal is open (only one is ever open at a time).
  const [modalError, setModalError] = useState<string>();
  const [flash, setFlash] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    const [detail, replyData] = await Promise.all([
      window.api.getGdprCase(id),
      window.api.getGdprCaseReplies(id),
    ]);
    setCaseDetail(detail);
    setReplies(replyData);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([refresh(), window.api.getAccountInfo(), Promise.resolve(window.api.getSettings())])
      .then(([, info, settings]) => {
        setAccountEmail(info.email);
        setCanSend(canAccountSend(info));
        if (settings.userName) setUserName(settings.userName);
        // Fire-and-forget: clears the unseen-reply state for next time, after
        // this render already used the pre-view lastViewedAt to highlight it.
        if (id) window.api.markGdprCaseViewed(id);
      })
      .finally(() => setLoading(false));
  }, [refresh, id]);

  const communication = useMemo(() => {
    if (!caseDetail) return [];
    return buildCommunicationTimeline(
      caseDetail.events,
      replies,
      caseDetail.requestType,
      caseDetail.lastViewedAt,
    );
  }, [caseDetail, replies]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!caseDetail) {
    return (
      <div className="space-y-4">
        <button className="btn btn-ghost btn-sm gap-1" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <p className="text-error">Case not found</p>
      </div>
    );
  }

  const {
    requestType,
    vendorName,
    vendorDomain,
    openedAt,
    status,
    outcome,
    nextAction,
    events,
    accountEmail: vendorAccountEmail,
  } = caseDetail;
  const isActive = status === "active";
  const requestEvent = [...events].reverse().find((e) => e.actionType === "gdpr_request_sent");

  const handleToggleLink = async (messageId: string, linked: boolean): Promise<void> => {
    setLinkLoading(true);
    setFlash(null);
    try {
      if (linked) {
        await window.api.linkGdprCaseMessage(id, messageId);
      } else {
        await window.api.unlinkGdprCaseMessage(id, messageId);
      }
      await refresh();
    } catch (err) {
      setFlash({ type: "error", text: errText(err, "Could not update the case.") });
    } finally {
      setLinkLoading(false);
    }
  };
  const emailLanguage = detectLanguageFromDomain(vendorDomain);

  const buildActionEmail = (action: "reminder" | "followup") => {
    const build = action === "reminder" ? buildReminderEmail : buildFollowupEmail;
    return build(
      requestEvent?.subject,
      requestType,
      openedAt,
      vendorAccountEmail || accountEmail,
      emailLanguage,
      userName || undefined,
    );
  };
  // Built once per render (not 3×) and reused by the modal preview, the copy
  // button, and handleSend so what we send is exactly what was shown.
  const pendingEmail = sendAction ? buildActionEmail(sendAction) : null;

  const handleSend = async (): Promise<void> => {
    if (!sendAction || !caseDetail.recipientEmail || !pendingEmail) return;
    setActionLoading(true);
    setModalError(undefined);
    try {
      const result = await window.api.sendEmail(
        caseDetail.recipientEmail,
        pendingEmail.subject,
        pendingEmail.body,
        caseDetail.sentMessageId,
      );
      if (!result.success) {
        setModalError(result.error ?? "Could not send the email.");
        return;
      }
      // The email is already out. If recording it fails, say so explicitly and
      // stop — never silently succeed (the user would resend and double-mail
      // the company).
      try {
        await window.api.addGdprCaseEvent(
          id,
          sendAction === "reminder" ? "reminder_sent" : "followup_sent",
          { subject: pendingEmail.subject, body: pendingEmail.body },
        );
      } catch (err) {
        setModalError(
          errText(
            err,
            "The email was sent, but recording it on the case failed. Don't resend — reload the case to check.",
          ),
        );
        return;
      }
      const label = sendAction === "reminder" ? "Reminder sent" : "Follow-up sent";
      setSendAction(null);
      await refresh();
      setFlash({ type: "success", text: label });
    } catch (err) {
      setModalError(errText(err, "Could not send the email."));
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async (): Promise<void> => {
    setActionLoading(true);
    setModalError(undefined);
    try {
      await window.api.closeGdprCase(id);
      setCloseOpen(false);
      if (alsoRequestDeletion && vendorDomain) {
        navigate(`/accounts/${encodeURIComponent(vendorDomain)}`, { state: { openDataTab: true } });
        return;
      }
      await refresh();
      setFlash({ type: "success", text: "Case closed" });
    } catch (err) {
      setModalError(errText(err, "Could not close the case."));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async (): Promise<void> => {
    setActionLoading(true);
    setFlash(null);
    try {
      await window.api.reopenGdprCase(id);
      await refresh();
      setFlash({ type: "success", text: "Case reopened" });
    } catch (err) {
      setFlash({ type: "error", text: errText(err, "Could not reopen the case.") });
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalate = async (): Promise<void> => {
    setActionLoading(true);
    setModalError(undefined);
    try {
      await window.api.escalateGdprCase(id);
      setEscalateOpen(false);
      await refresh();
      setFlash({ type: "success", text: "Marked as escalated" });
    } catch (err) {
      setModalError(errText(err, "Could not escalate the case."));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {flash && (
        <div
          role="alert"
          className={`alert text-sm ${flash.type === "success" ? "alert-success" : "alert-error"}`}
        >
          <span>{flash.text}</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <button className="btn btn-ghost btn-sm gap-1" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          {!isActive && (
            <button
              className="btn btn-sm btn-ghost"
              disabled={actionLoading}
              onClick={handleReopen}
            >
              Reopen case
            </button>
          )}
          {isActive && (
            <button
              className="btn btn-sm btn-neutral"
              onClick={() => { setAlsoRequestDeletion(false); setModalError(undefined); setCloseOpen(true); }}
            >
              Close case
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold">
            {gdprRequestLabel(requestType)}
          </h1>
          {!isActive && outcome && (
            <span className="badge badge-soft">{CASE_OUTCOME_LABELS[outcome]}</span>
          )}
        </div>
        <p className="text-sm text-base-content/50 mt-1">
          <button
            className="cursor-pointer hover:underline hover:text-base-content/80"
            onClick={() =>
              navigate(`/accounts/${encodeURIComponent(vendorDomain ?? String(caseDetail.vendorId))}`)
            }
          >
            {vendorName}
          </button>
          {caseDetail.recipientEmail && <> · {caseDetail.recipientEmail}</>}
          {" · "}opened {formatAbsoluteDate(openedAt)}
          {caseDetail.closedAt && <> · closed {formatAbsoluteDate(caseDetail.closedAt)}</>}
        </p>
      </div>

      {isActive && <Timeline openedAt={openedAt} nextAction={nextAction} />}

      {isActive && caseDetail.hasUnseenReply && (
        <div className="card bg-base-200">
          <div className="card-body p-4 flex-row items-center justify-between gap-4">
            <p className="text-sm">
              {vendorName} may have responded. Read our guide for what to do next.
            </p>
            <button
              className="btn btn-neutral btn-sm shrink-0"
              onClick={() => window.api.openExternal(GUIDE_URL)}
            >
              Read the guide
            </button>
          </div>
        </div>
      )}

      {isActive && !canSend && (nextAction === "reminder" || nextAction === "followup") && (
        <div className="card bg-warning/10 border border-warning/30">
          <div className="card-body p-4 flex-row items-center justify-between gap-4">
            <p className="text-sm">
              This account can&apos;t send email on its own. Connect an account with SMTP to
              send reminders and follow-ups from Paperweight.
            </p>
            <button className="btn btn-sm btn-ghost shrink-0" onClick={() => navigate("/settings")}>
              Open settings
            </button>
          </div>
        </div>
      )}

      {isActive && nextAction && (
        <div className="card bg-base-200">
          <div className="card-body p-4 flex-row items-center justify-between gap-4">
            {nextAction === "reminder" && (
              <>
                <p className="text-sm">
                  No response yet. A gentle reminder often helps, and it also shows you
                  followed up if you escalate later.
                </p>
                <button
                  className="btn btn-primary btn-sm shrink-0"
                  disabled={!caseDetail.recipientEmail || actionLoading || !canSend}
                  onClick={() => { setModalError(undefined); setSendAction("reminder"); }}
                >
                  Send reminder
                </button>
              </>
            )}
            {nextAction === "followup" && (
              <>
                <p className="text-sm">
                  The official deadline has passed. Send a formal follow-up referencing the
                  deadline.
                </p>
                <button
                  className="btn btn-primary btn-sm shrink-0"
                  disabled={!caseDetail.recipientEmail || actionLoading || !canSend}
                  onClick={() => { setModalError(undefined); setSendAction("followup"); }}
                >
                  Send follow-up
                </button>
              </>
            )}
            {nextAction === "escalate" && (
              <>
                <p className="text-sm">
                  More than 60 days without resolution. Check our data protection authority
                  directory, then mark the case escalated when you file a complaint.
                </p>
                <div className="flex gap-2 shrink-0">
                  <button
                    className="btn btn-sm btn-ghost gap-1"
                    onClick={() => window.api.openExternal(AUTHORITIES_URL)}
                  >
                    DPA directory <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={actionLoading}
                    onClick={() => { setModalError(undefined); setEscalateOpen(true); }}
                  >
                    I escalated
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card bg-base-200">
        <div className="card-body p-4 gap-0">
          <h3 className="text-sm font-semibold mb-1">Messages</h3>
          <p className="text-xs text-base-content/50 mb-3">
            What you sent and what arrived from {vendorName} since this case opened.
            {" "}
            <span className="badge badge-xs badge-soft badge-info">Case</span> marks
            emails that are part of this case — matched automatically or added by you.
          </p>
          {communication.length === 0 ? (
            <p className="text-sm text-base-content/50">No messages yet.</p>
          ) : (
            <div className="flex flex-col gap-0.5 -mx-1 px-1">
              {communication.map((item) => (
                <CommunicationRow
                  key={item.id}
                  item={item}
                  caseActive={isActive}
                  linkLoading={linkLoading}
                  onToggleLink={handleToggleLink}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {sendAction && (
        <ActionModal
          isOpen
          title={sendAction === "reminder" ? "Send reminder" : "Send follow-up"}
          confirmLabel="Send"
          confirmVariant="primary"
          copyText={pendingEmail?.body}
          onConfirm={handleSend}
          onCancel={() => { if (!actionLoading) setSendAction(null); }}
          loading={actionLoading}
          error={modalError}
        >
          <p>
            Before sending, check your inbox for a response — we try to match related
            messages, but companies sometimes reply from a different address.
          </p>
          <p>
            Paperweight will send this from your account to{" "}
            <strong>{caseDetail.recipientEmail}</strong>, as a reply to your original request:
          </p>
          <pre className="whitespace-pre-wrap text-sm text-base-content/70 bg-base-100 rounded-lg p-3 max-h-64 overflow-y-auto">
            {pendingEmail?.body}
          </pre>
          {requestEvent?.body && (
            <>
              <p className="text-xs text-base-content/50">Your original request:</p>
              <pre className="whitespace-pre-wrap text-sm text-base-content/50 bg-base-100 rounded-lg p-3 max-h-40 overflow-y-auto">
                {requestEvent.body}
              </pre>
            </>
          )}
        </ActionModal>
      )}

      {closeOpen && (
        <ActionModal
          isOpen
          title="Close case"
          confirmLabel="Close case"
          confirmVariant="primary"
          onConfirm={handleClose}
          onCancel={() => { if (!actionLoading) setCloseOpen(false); }}
          loading={actionLoading}
          error={modalError}
        >
          <p>Close this case? You can reopen it later if you need to.</p>
          {requestType === "access" && (
            <label className="flex items-center gap-2 cursor-pointer mt-4">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={alsoRequestDeletion}
                onChange={(e) => setAlsoRequestDeletion(e.target.checked)}
              />
              <span>
                Want this data gone too? Start a deletion request for{" "}
                <strong>{vendorName}</strong>.
              </span>
            </label>
          )}
        </ActionModal>
      )}

      {escalateOpen && (
        <ActionModal
          isOpen
          title="Mark as escalated"
          confirmLabel="Close case as escalated"
          confirmVariant="primary"
          onConfirm={handleEscalate}
          onCancel={() => { if (!actionLoading) setEscalateOpen(false); }}
          loading={actionLoading}
          error={modalError}
        >
          <p>
            This logs that you escalated to your data protection authority and closes the case.
            You can reopen it later if needed.
          </p>
        </ActionModal>
      )}
    </div>
  );
}
