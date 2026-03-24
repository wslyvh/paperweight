import { useEffect, useState } from "react";
import type { SyncStatus } from "@shared/types";

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

function isGmailTokenError(error?: string): boolean {
  return !!(
    error &&
    (error.includes("Gmail authorization expired") ||
      error.includes("Failed to refresh access token"))
  );
}

export default function SyncStatusBar(): JSX.Element {
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

  // Tick every 30s to keep relative time fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleSync = () => {
    window.api.startSync();
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      const result = await window.api.startGmailAuth();
      if (result.success) {
        window.api.startSync();
      } else {
        setStatus((s) => ({ ...s, error: result.error ?? "Reconnect failed" }));
      }
    } finally {
      setReconnecting(false);
    }
  };

  const showReconnect = isGmailTokenError(status.error);

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-base-200 border-b border-base-300">
      <div className="flex items-center gap-2 text-sm">
        {status.running ? (
          <>
            <span className="loading loading-spinner loading-xs"></span>
            <span className="text-warning">
              {status.phase === "historical" ? "Syncing history" : "Syncing..."}
            </span>
            {status.phase === "historical" && status.historicalCursor ? (
              <span className="text-base-content/50">
                — back to {formatMonthYear(status.historicalCursor)}
              </span>
            ) : status.progress > 0 ? (
              <span className="text-base-content/50">
                ({status.total > 0
                  ? `~${Math.min(Math.round((status.progress / status.total) * 100), 99)}%`
                  : `${status.progress.toLocaleString()} messages`})
              </span>
            ) : null}
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
        className="btn btn-xs btn-ghost"
        onClick={showReconnect ? handleReconnect : handleSync}
        disabled={status.running || reconnecting}
      >
        {status.running
          ? "Syncing..."
          : reconnecting
            ? "Reconnecting..."
            : showReconnect
              ? "Reconnect"
              : "Sync Now"}
      </button>
    </div>
  );
}
