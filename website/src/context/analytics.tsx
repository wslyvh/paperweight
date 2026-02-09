import PlausibleProvider from "next-plausible";
import type { ComponentProps, PropsWithChildren } from "react";
import { SITE_CONFIG } from "@/utils/config";

export function AnalyticsProvider(props: PropsWithChildren) {
  const children = props.children as ComponentProps<
    typeof PlausibleProvider
  >["children"];

  return (
    <PlausibleProvider domain={SITE_CONFIG.DOMAIN} trackOutboundLinks={true}>
      {children}
    </PlausibleProvider>
  );
}
