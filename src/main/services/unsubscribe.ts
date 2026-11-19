import { requirePro } from "./settings";
import type { UnsubscribeEntry } from "@shared/types";
import { PAPERWEIGHT_UNSUB_BODY, parseMailto } from "@shared/utils";
import { actionLog } from "../utils/log";
import { sendEmail } from "./email";
import {
  getAllUnsubscribeMethodsForVendor,
  markListUnsubscribed,
} from "./messages";

export interface UnsubscribeResult {
  status: "unsubscribed" | "manual_required" | "not_available" | "failed";
  method?: "one_click" | "email" | "browser";
  url?: string;
  remainingTargets?: number;
  error?: string;
}

const METHOD_PRIORITY = ["rfc8058", "list-unsubscribe", "footer"] as const;

function pickBestMethod(methods: UnsubscribeEntry[]): UnsubscribeEntry | undefined {
  for (const method of METHOD_PRIORITY) {
    const entry = methods.find((candidate) => candidate.method === method);
    if (entry) return entry;
  }
  return undefined;
}

function countRemainingTargets(vendorId: number): number {
  return getAllUnsubscribeMethodsForVendor(vendorId).length;
}

function httpUnsubscribeUrl(url: string): string | undefined {
  const trimmed = url.replace(/^<|>$/g, "").trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return trimmed;
  } catch {
    return undefined;
  }
}

export async function executeRfc8058Unsubscribe(
  url: string,
): Promise<{ success: boolean; error?: string }> {
  await requirePro();
  if (!url.startsWith("https://")) {
    return { success: false, error: "One-click unsubscribe requires HTTPS." };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    actionLog.info(`RFC 8058 unsubscribe POST: ${response.status}`);
    if (response.ok) return { success: true };
    return { success: false, error: `Server returned HTTP ${response.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    actionLog.error("RFC 8058 POST failed:", message);
    return { success: false, error: message };
  }
}

export async function unsubscribeVendor(vendorId: number): Promise<UnsubscribeResult> {
  await requirePro();
  const entry = pickBestMethod(getAllUnsubscribeMethodsForVendor(vendorId));
  if (!entry) return { status: "not_available", remainingTargets: 0 };

  if (entry.method === "rfc8058") {
    const result = await executeRfc8058Unsubscribe(entry.url);
    if (!result.success) {
      return { status: "failed", method: "one_click", error: result.error };
    }
    markListUnsubscribed(vendorId, entry.url);
    return {
      status: "unsubscribed",
      method: "one_click",
      url: entry.url,
      remainingTargets: countRemainingTargets(vendorId),
    };
  }

  if (!entry.url.toLowerCase().startsWith("mailto:")) {
    const url = httpUnsubscribeUrl(entry.url);
    if (!url) return { status: "not_available", remainingTargets: countRemainingTargets(vendorId) };
    return {
      status: "manual_required",
      method: "browser",
      url,
      remainingTargets: countRemainingTargets(vendorId),
    };
  }

  const { to, subject, body } = parseMailto(entry.url);
  if (!to.includes("@")) {
    return { status: "failed", method: "email", error: "Invalid unsubscribe email address." };
  }

  const sent = await sendEmail(to, subject, body || PAPERWEIGHT_UNSUB_BODY);
  if (!sent.success) {
    return { status: "failed", method: "email", error: sent.error };
  }
  markListUnsubscribed(vendorId, entry.url);
  return {
    status: "unsubscribed",
    method: "email",
    url: entry.url,
    remainingTargets: countRemainingTargets(vendorId),
  };
}
