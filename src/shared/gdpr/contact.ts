import type { VendorDetail } from "../types";

export function isNoReplyEmail(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  return /no[-_.]?reply|do[-_.]?not[-_.]?reply/.test(local);
}

export function pickGdprContactEmail(
  company: VendorDetail["company"],
  senders: VendorDetail["senders"],
): string | undefined {
  if (company?.email && !isNoReplyEmail(company.email)) return company.email;
  const sender = senders.find(
    (entry) => entry.sender_email && !isNoReplyEmail(entry.sender_email),
  )?.sender_email;
  if (sender) return sender;
  return company?.email ?? senders[0]?.sender_email;
}
