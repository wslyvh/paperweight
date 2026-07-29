// Unsubscribe resolution: rfc8058 > list-unsubscribe > footer link
// priority. Header facts and the body link list are the inputs;
// the prose text is never searched. Footer links are matched on anchor text
// first, then on the href itself (generic "click here" links), bottom-up.
import { UNSUBSCRIBE_LINK_TEXT, UNSUBSCRIBE_URL } from "../data/lexicons";
import type { ExtractedBody } from "../extract/body";
import type { HeaderFacts } from "../extract/headers";
import type { UnsubscribeMethod } from "../types";

export interface UnsubscribeResult {
  method: UnsubscribeMethod;
  target: string;
  /** Offset of a footer link's visible text in the HTML-derived body. Internal
   *  adapter metadata; it is not part of the public Analysis.unsubscribe. */
  anchorStart?: number;
}

export function resolveFooterLink(
  body: ExtractedBody,
): UnsubscribeResult | undefined {
  // Footer links live at the bottom; scan back to front.
  const links = [...body.links].reverse();
  for (const link of links) {
    if (UNSUBSCRIBE_LINK_TEXT.some((pattern) => pattern.test(link.text))) {
      return { method: "footer", target: link.href, anchorStart: link.start };
    }
  }
  for (const link of links) {
    if (UNSUBSCRIBE_URL.some((pattern) => pattern.test(link.href))) {
      return { method: "footer", target: link.href, anchorStart: link.start };
    }
  }
  return undefined;
}

export function resolveUnsubscribe(
  header: HeaderFacts,
  body: ExtractedBody,
): UnsubscribeResult | undefined {
  const urls = header.listUnsubscribe?.urls ?? [];
  const mailtos = header.listUnsubscribe?.mailtos ?? [];
  const httpsUrl = urls.find((url) => /^https:/i.test(url));
  const httpUrl = urls.find((url) => /^http:/i.test(url));

  if (header.listUnsubscribePost && httpsUrl) {
    return { method: "rfc8058", target: httpsUrl };
  }
  if (httpsUrl) return { method: "list-unsubscribe", target: httpsUrl };
  if (httpUrl) return { method: "list-unsubscribe", target: httpUrl };
  if (mailtos[0]) {
    return { method: "list-unsubscribe", target: mailtos[0] };
  }
  return resolveFooterLink(body);
}
