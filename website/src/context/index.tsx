import type { PropsWithChildren } from "react";
import { AnalyticsProvider } from "./analytics";

export function Providers(props: PropsWithChildren) {
  return <AnalyticsProvider>{props.children}</AnalyticsProvider>;
}
