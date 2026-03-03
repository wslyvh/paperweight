import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ActivityEntry } from "@shared/types";
import { formatAbsoluteDate, formatBytes } from "@shared/formatting";
import Pagination from "../components/Pagination";

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

const LIMIT = 50;

export default function Activity(): JSX.Element {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const offset = (page - 1) * LIMIT;
    const data = await window.api.getActivityLog(LIMIT, offset);
    setEntries(data.entries);
    setTotal(data.total);
    setLoading(false);
  }, [page]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Activity log</h1>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : entries.length === 0 ? (
        <p className="text-base-content/50 text-sm">
          No activity yet. Actions you take on mailing lists will appear here.
        </p>
      ) : (
        <>
          <div className="font-mono text-sm divide-y divide-base-300">
            {entries.map((entry) => {
              const groupKey = entry.vendorSlug ?? entry.vendorDomain ?? String(entry.vendorId);
              return (
                <div
                  key={entry.id}
                  className="grid grid-cols-[130px_160px_1fr_auto] items-center gap-4 py-2"
                >
                  <span className="text-base-content/40 shrink-0">
                    {formatAbsoluteDate(entry.actionedAt)}
                  </span>
                  <span className={`shrink-0 ${ACTION_COLORS[entry.actionType]}`}>
                    {ACTION_LABELS[entry.actionType]}
                  </span>
                  <button
                    className="text-left truncate text-base-content/80 hover:text-base-content transition-colors"
                    onClick={() => navigate(`/accounts/${encodeURIComponent(groupKey)}`)}
                  >
                    {entry.vendorName}
                  </button>
                  <span className="text-base-content/40 text-right shrink-0">
                    {entry.messageCount.toLocaleString()} emails
                    {entry.sizeBytes > 0 && ` · ${formatBytes(entry.sizeBytes)}`}
                  </span>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}
