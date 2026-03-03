import { getDb } from "../db";
import { toUtcDayString, utcMidnightMs } from "@shared/formatting";
import type { DashboardStats, AttentionStats, ChartTrend, ImpactStats, RiskCounts, ActivityEntry } from "@shared/types";
import { getSetting } from "./settings";
import { COMPUTED_RISK_CASE } from "./vendors";

export function getDashboardStats(): DashboardStats {
  const d = getDb();
  const totalMessages = (
    d.prepare("SELECT COUNT(*) as c FROM messages").get() as { c: number }
  ).c;
  const uniqueVendors = (
    d.prepare("SELECT COUNT(*) as c FROM vendors").get() as { c: number }
  ).c;
  const mailingListCount = (
    d
      .prepare(
        `SELECT COUNT(*) as c FROM vendors v
         WHERE v.has_marketing = 1
         AND EXISTS (
           SELECT 1 FROM messages m
           WHERE m.vendor_id = v.id
             AND m.type = 'bulk'
             AND (m.status IS NULL OR m.status != 'unsubscribed')
             AND NOT EXISTS (
               SELECT 1 FROM whitelist w
               WHERE (w.value LIKE '%@%' AND m.sender_email = w.value)
                  OR (w.value NOT LIKE '%@%' AND (
                        m.sender_email LIKE '%@' || w.value
                     OR m.sender_email LIKE '%.' || w.value
                  ))
             )
         )`
      )
      .get() as { c: number }
  ).c;

  // Count vendors likely affected by a known breach (first_seen < breach_date)
  const breachesAttached = !!(
    d.prepare("SELECT name FROM pragma_database_list WHERE name = 'breaches'").get()
  );
  const breachedCount = breachesAttached
    ? (
        d
          .prepare(
            `SELECT COUNT(*) as c FROM vendors
             WHERE EXISTS (
               SELECT 1 FROM breaches.breaches b
               WHERE (b.domain = vendors.root_domain OR vendors.root_domain LIKE '%.' || b.domain)
               AND vendors.first_seen IS NOT NULL
               AND vendors.first_seen < strftime('%s', b.breach_date) * 1000
             )
             AND NOT EXISTS (
               SELECT 1 FROM action_log al WHERE al.vendor_id = vendors.id LIMIT 1
             )`
          )
          .get() as { c: number }
      ).c
    : 0;

  return { totalMessages, uniqueVendors, mailingListCount, breachedCount };
}

export function getAttentionStats(): AttentionStats {
  const d = getDb();

  const bulkEmailsToReview = (
    d
      .prepare(
        `SELECT COUNT(DISTINCT m.vendor_id) as c FROM messages m
         WHERE m.type = 'bulk'
         AND (m.status IS NULL OR m.status != 'unsubscribed')
         AND NOT EXISTS (
           SELECT 1 FROM whitelist w
           WHERE (w.value LIKE '%@%' AND m.sender_email = w.value)
              OR (w.value NOT LIKE '%@%' AND (
                    m.sender_email LIKE '%@' || w.value
                 OR m.sender_email LIKE '%.' || w.value
              ))
         )`
      )
      .get() as { c: number }
  ).c;

  const vendorsToReview = (
    d
      .prepare(
        `SELECT COUNT(*) as c FROM vendors v
         WHERE (v.status IS NULL OR v.status != 'reviewed')
         AND EXISTS (
           SELECT 1 FROM messages m WHERE m.vendor_id = v.id LIMIT 1
         )
         AND NOT EXISTS (
           SELECT 1 FROM whitelist w, messages m
           WHERE m.vendor_id = v.id
           AND ((w.value LIKE '%@%' AND m.sender_email = w.value)
                OR (w.value NOT LIKE '%@%' AND m.sender_email LIKE '%@' || w.value))
         )`
      )
      .get() as { c: number }
  ).c;

  return { bulkEmailsToReview, vendorsToReview };
}

export function getImpactStats(): ImpactStats {
  const d = getDb();
  const row = d.prepare(
    `SELECT
      SUM(CASE WHEN action_type = 'unsubscribed' THEN 1 ELSE 0 END) as lists_unsubscribed,
      SUM(CASE WHEN action_type IN ('trashed', 'spam_reported') THEN message_count ELSE 0 END) as emails_deleted,
      COALESCE(SUM(size_bytes), 0) as data_reclaimed_bytes
     FROM action_log`
  ).get() as { lists_unsubscribed: number | null; emails_deleted: number | null; data_reclaimed_bytes: number };
  return {
    listsUnsubscribed: row.lists_unsubscribed ?? 0,
    emailsDeleted: row.emails_deleted ?? 0,
    dataReclaimedBytes: row.data_reclaimed_bytes,
  };
}

export function getRiskCounts(): RiskCounts {
  const d = getDb();
  const rows = d.prepare(
    `SELECT ${COMPUTED_RISK_CASE} AS computed_risk, COUNT(*) as count
     FROM vendors
     GROUP BY computed_risk`
  ).all() as Array<{ computed_risk: string; count: number }>;
  const counts: RiskCounts = { high: 0, medium: 0, low: 0 };
  for (const row of rows) {
    if (row.computed_risk === "high") counts.high = row.count;
    else if (row.computed_risk === "medium") counts.medium = row.count;
    else if (row.computed_risk === "low") counts.low = row.count;
  }
  return counts;
}

export function getActivityLog(limit: number, offset: number): { entries: ActivityEntry[]; total: number } {
  const d = getDb();
  const total = (d.prepare("SELECT COUNT(*) as c FROM action_log").get() as { c: number }).c;
  const rows = d.prepare(
    `SELECT a.id, a.vendor_id,
            COALESCE(NULLIF(v.name, ''), v.root_domain, 'Unknown') as vendor_name,
            v.root_domain as vendor_domain,
            v.company_slug as vendor_slug, a.action_type, a.message_count, a.size_bytes, a.actioned_at
     FROM action_log a
     JOIN vendors v ON v.id = a.vendor_id
     ORDER BY a.actioned_at DESC
     LIMIT ? OFFSET ?`
  ).all(limit, offset) as Array<{
    id: number; vendor_id: number; vendor_name: string;
    vendor_domain: string | null; vendor_slug: string | null;
    action_type: string; message_count: number; size_bytes: number; actioned_at: number;
  }>;
  return {
    total,
    entries: rows.map((r) => ({
      id: r.id,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      vendorDomain: r.vendor_domain ?? undefined,
      vendorSlug: r.vendor_slug ?? undefined,
      actionType: r.action_type as ActivityEntry["actionType"],
      messageCount: r.message_count,
      sizeBytes: r.size_bytes,
      actionedAt: r.actioned_at,
    })),
  };
}

interface DailyCountRow {
  day: string;
  count: number;
}

export function getDashboardTrend(windowDays: number): ChartTrend {
  const d = getDb();
  const safeDays = Math.min(365, Math.max(1, Math.floor(windowDays)));

  const endDayStart = utcMidnightMs(Date.now());
  const dayMs = 24 * 60 * 60 * 1000;
  const startDayStart = endDayStart - (safeDays - 1) * dayMs;
  const endMs = endDayStart + dayMs - 1;

  const rows = d
    .prepare(
      `
      WITH RECURSIVE days(d) AS (
        SELECT date(? / 1000, 'unixepoch')
        UNION ALL
        SELECT date(d, '+1 day') FROM days WHERE d < date(? / 1000, 'unixepoch')
      )
      SELECT
        days.d as day,
        COALESCE(c.cnt, 0) as count
      FROM days
      LEFT JOIN (
        SELECT date(date / 1000, 'unixepoch') as day, COUNT(*) as cnt
        FROM messages
        WHERE date BETWEEN ? AND ?
        GROUP BY day
      ) c ON c.day = days.d
      ORDER BY days.d ASC
    `
    )
    .all(startDayStart, endDayStart, startDayStart, endMs) as DailyCountRow[];

  const startedUsingAtRaw = getSetting("registeredAt");
  const startedUsingAt =
    (startedUsingAtRaw ? parseInt(startedUsingAtRaw, 10) : 0) || undefined;

  const startDay = toUtcDayString(startDayStart);
  const endDay = toUtcDayString(endDayStart);
  const seriesRows =
    rows.length > 0
      ? rows
      : [
          { day: startDay, count: 0 },
          { day: endDay, count: 0 },
        ];

  const labels = seriesRows.map((r) => r.day);
  const values = seriesRows.map((r) => r.count);

  const markers =
    startedUsingAt && labels.length > 0
      ? (() => {
          const startedDay = toUtcDayString(startedUsingAt);

          let point = labels.findIndex((d) => d === startedDay);
          if (point === -1) {
            point = labels.findIndex((d) => d > startedDay);
            if (point === -1) point = labels.length - 1;
          }
          if (point < 0) point = 0;
          if (point >= labels.length) point = labels.length - 1;

          return [{ key: "Started using Paperweight", point }];
        })()
      : undefined;

  return {
    labels,
    series: [{ key: "emailCount", values }],
    markers: markers ?? [],
  };
}
