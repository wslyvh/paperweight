import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  ChartTrend,
  DashboardStats,
} from "@shared/types";
import { useLicense } from "../context/LicenseContext";
import TrendChartCard from "../components/TrendChartCard";
import ImpactBlock from "../components/ImpactBlock";
import { ArrowRight, ChevronRight, Contact, Inbox, Mail } from "lucide-react";

export default function Dashboard(): JSX.Element {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalMessages: 0,
    uniqueVendors: 0,
    mailingListCount: 0,
    breachedCount: 0,
    mailingListsActioned: 0,
    activeSubscriptions: 0,
    reviewedVendors: 0,
    highRiskUnreviewed: 0,
  });
  const [trend, setTrend] = useState<ChartTrend>({
    labels: [],
    series: [],
    markers: [],
  });
  const license = useLicense();
  const [loading, setLoading] = useState(true);
  const [impactKey, setImpactKey] = useState(0);

  const fetchData = async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    const [statsData, trendData] = await Promise.all([
      window.api.getDashboardStats(),
      window.api.getDashboardTrend(),
    ]);
    setStats(statsData);
    setTrend(trendData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Re-fetch when sync updates or finishes (silent to avoid flashing)
  useEffect(() => {
    const unsub = window.api.onSyncProgress((status) => {
      if (
        status.message === "Vendor data updated" ||
        status.message === "Sender data updated"
      ) {
        fetchData(true);
      } else if (!status.running && status.message.includes("complete")) {
        fetchData();
        setImpactKey((k) => k + 1);
      }
    });
    return unsub;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  const hasActionItems =
    stats.breachedCount > 0 || stats.activeSubscriptions > 0 || stats.highRiskUnreviewed > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {!license.active && (
        <div
          className="flex items-center justify-between p-4 bg-primary/10 border border-primary/20 rounded-box cursor-pointer hover:bg-primary/15 transition-colors"
          onClick={() => navigate("/settings")}
        >
          <div>
            <p className="font-semibold text-base-content">
              Upgrade your account
            </p>
            <p className="text-sm text-base-content/60">
              Activate a license to unlock full email history sync and more.
            </p>
          </div>
          <ArrowRight
            className="w-5 h-5 text-primary shrink-0"
            aria-hidden="true"
          />
        </div>
      )}

      {/* Stat tiles — 3 in 1 row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className="stat border-none bg-base-200 rounded-box cursor-pointer hover:bg-base-300 transition-colors flex flex-col justify-between"
          onClick={() => navigate("/dashboard")}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold text-base text-base-content">
              Emails analyzed
            </div>
            <Inbox className="w-5 h-5 text-info" aria-hidden="true" />
          </div>
          <div className="stat-value text-info">
            {stats.totalMessages.toLocaleString()}
          </div>
          <p className="text-base-content/50 text-xs mt-1">&nbsp;</p>
        </div>

        <div
          className="stat border-none bg-base-200 rounded-box cursor-pointer hover:bg-base-300 transition-colors flex flex-col justify-between"
          onClick={() => navigate("/mail")}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold text-base text-base-content">
              Mailing lists
            </div>
            <Mail className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div className="stat-value text-primary">
            {stats.mailingListCount.toLocaleString()}
          </div>
          <p className="text-base-content/50 text-xs mt-1">
            {stats.mailingListsActioned.toLocaleString()} actioned · {stats.activeSubscriptions.toLocaleString()} priorities
          </p>
        </div>

        <div
          className="stat border-none bg-base-200 rounded-box cursor-pointer hover:bg-base-300 transition-colors flex flex-col justify-between"
          onClick={() => navigate("/accounts")}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold text-base text-base-content">
              Accounts
            </div>
            <Contact className="w-5 h-5 text-secondary" aria-hidden="true" />
          </div>
          <div className="stat-value text-secondary">
            {stats.uniqueVendors.toLocaleString()}
          </div>
          <p className="text-base-content/50 text-xs mt-1">
            {stats.reviewedVendors.toLocaleString()} reviewed · {stats.highRiskUnreviewed.toLocaleString()} high risk
          </p>
        </div>
      </div>

      <ImpactBlock refreshKey={impactKey} />

      {/* Action Items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Actions</h2>
          <button
            className="text-sm text-base-content/50 hover:text-base-content/80 transition-colors"
            onClick={() => navigate("/activity")}
          >
            View activity log →
          </button>
        </div>

        {hasActionItems ? (
          <div className="space-y-2">
            {stats.breachedCount > 0 && (
              <div
                className="flex items-center justify-between p-3 bg-base-200 rounded-lg border-l-4 border-error cursor-pointer hover:bg-base-300 transition-colors"
                onClick={() =>
                  navigate("/accounts", { state: { preset: "breached" } })
                }
              >
                <span>
                  {stats.breachedCount} account
                  {stats.breachedCount !== 1 ? "s are" : " is"} on a known data breach list
                </span>
                <ChevronRight
                  className="w-5 h-5 text-base-content/50"
                  aria-hidden="true"
                />
              </div>
            )}

            {stats.activeSubscriptions > 0 && (
              <div
                className="flex items-center justify-between p-3 bg-base-200 rounded-lg border-l-4 border-primary cursor-pointer hover:bg-base-300 transition-colors"
                onClick={() => navigate("/mail", { state: { preset: "priorities" } })}
              >
                <span>
                  {stats.activeSubscriptions} active mailing list
                  {stats.activeSubscriptions !== 1 ? "s" : ""} to unsubscribe
                </span>
                <ChevronRight
                  className="w-5 h-5 text-base-content/50"
                  aria-hidden="true"
                />
              </div>
            )}

            {stats.highRiskUnreviewed > 0 && (
              <div
                className="flex items-center justify-between p-3 bg-base-200 rounded-lg border-l-4 border-secondary cursor-pointer hover:bg-base-300 transition-colors"
                onClick={() =>
                  navigate("/accounts", { state: { preset: "highrisk" } })
                }
              >
                <span>
                  {stats.highRiskUnreviewed} high risk account
                  {stats.highRiskUnreviewed !== 1 ? "s" : ""} to review
                </span>
                <ChevronRight
                  className="w-5 h-5 text-base-content/50"
                  aria-hidden="true"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 bg-base-200 rounded-lg text-center text-base-content/60">
            You're all caught up
          </div>
        )}
      </div>

      {/* Trend chart */}
      <TrendChartCard
        trend={trend}
        title="Daily emails"
        description="Total emails received over time"
        trendDirection="down"
      />
    </div>
  );
}
