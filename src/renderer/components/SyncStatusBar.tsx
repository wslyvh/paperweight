import { useEffect, useState } from "react";
import type { SyncStatus } from "@shared/types";
import { formatRunningSyncStatus, isOAuthTokenError } from "./syncStatus";

function formatMonthYear(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SyncStatusBar() {
  const [status, setStatus] = useState<SyncStatus>({
    running: false,
    progress: 0,
    total: 0,
    message: "",
  });
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const unsub = window.api.onSyncProgress(setStatus);
    window.api.getSyncStatus().then(setStatus);
    return unsub;
  }, []);

  // Tick every 30s to keep relative and elapsed times fresh
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleSync = () => {
    window.api.startSync();
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      const account = await window.api.getAccountInfo();
      const intent = {
        type: "reconnect",
        email: account.email,
      } as const;
      let result: { success: boolean; error?: string };
      if (account.providerType === "microsoft") {
        result = await window.api.startMicrosoftAuth(intent);
      } else if (account.providerType === "gmail") {
        result = await window.api.startGmailAuth(intent);
      } else {
        result = {
          success: false,
          error: "Reconnect is only available for Gmail and Microsoft accounts",
        };
      }
      if (result.success) {
        window.api.startSync();
      } else {
        setStatus((s) => ({ ...s, error: result.error ?? "Reconnect failed" }));
      }
    } finally {
      setReconnecting(false);
    }
  };

  const showReconnect = isOAuthTokenError(status.error);
  const analyzingMessages =
    status.running && status.message === "Analyzing messages";

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-base-200 border-b border-base-300">
      <div className="flex items-center gap-2 text-sm">
        {status.running ? (
          <>
            <span className="loading loading-spinner loading-xs"></span>
            <span className="text-warning">
              {analyzingMessages
                ? "Analyzing messages…"
                : formatRunningSyncStatus(status, now)}
            </span>
          </>
        ) : status.error ? (
          <>
            <span className="inline-block w-2 h-2 rounded-full bg-error"></span>
            <span className="text-error">Sync failed</span>
            <span
              className="text-base-content/50 truncate max-w-lg"
              title={status.error}
            >
              {status.error}
            </span>
          </>
        ) : status.analysisPending ? (
          <>
            <span className="inline-block w-2 h-2 rounded-full bg-warning"></span>
            <span className="text-base-content/70">
              Refresh to analyze messages
            </span>
          </>
        ) : (
          <>
            <span className="inline-block w-2 h-2 rounded-full bg-success"></span>
            <span className="text-base-content/70">Synced</span>
            {status.lastSyncAt && (
              <span className="text-base-content/50">
                {formatRelativeTime(status.lastSyncAt)}
              </span>
            )}
            {!status.historicalDone && status.historicalCursor && (
              <span className="text-base-content/40">
                · history back to {formatMonthYear(status.historicalCursor)}
              </span>
            )}
          </>
        )}
      </div>
      <button
        className={`btn btn-xs ${
          status.analysisPending && !status.running
            ? "btn-primary"
            : "btn-ghost"
        }`}
        onClick={showReconnect ? handleReconnect : handleSync}
        disabled={status.running || reconnecting}
      >
        {status.running
          ? analyzingMessages
            ? "Analyzing..."
            : "Syncing..."
          : reconnecting
            ? "Reconnecting..."
            : showReconnect
              ? "Reconnect"
              : "Refresh"}
      </button>
    </div>
  );
}
