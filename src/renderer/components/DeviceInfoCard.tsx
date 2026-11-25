import type { SupportInfo } from "@shared/types";

interface DeviceInfoCardProps {
  info?: SupportInfo;
  /** Use card styling (Support page) vs plain (modal) */
  variant?: "card" | "plain";
}

export default function DeviceInfoCard({
  info,
  variant = "card",
}: DeviceInfoCardProps) {
  const content = info ? (
    <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <span className="text-base-content/50">OS</span>
      <span>{info.os}</span>

      <span className="text-base-content/50">App version</span>
      <span>{info.appVersion}</span>

      <span className="text-base-content/50">Electron</span>
      <span>{info.electronVersion}</span>

      <span className="text-base-content/50">Chrome</span>
      <span>{info.chromeVersion}</span>

      <span className="text-base-content/50">Node</span>
      <span>{info.nodeVersion}</span>

      <span className="text-base-content/50">Architecture</span>
      <span>{info.arch}</span>

      <span className="text-base-content/50">Platform</span>
      <span>{info.platform}</span>
    </div>
  ) : null;

  if (variant === "plain") {
    return (
      <div className="space-y-3">
        <h3 className="font-semibold">Device Info</h3>
        {content}
      </div>
    );
  }

  return (
    <div className="card bg-base-200">
      <div className="card-body space-y-3">
        <h3 className="font-semibold">Device Info</h3>
        {content}
      </div>
    </div>
  );
}
