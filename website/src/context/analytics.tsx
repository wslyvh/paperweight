import PlausibleProvider from "next-plausible";
import type { PropsWithChildren } from "react";
import { SITE_CONFIG } from "@/utils/config";

export function AnalyticsProvider(props: PropsWithChildren) {
  return (
    <PlausibleProvider domain={SITE_CONFIG.DOMAIN} trackOutboundLinks={true}>
      {props.children as any}
    </PlausibleProvider>
  );
}
