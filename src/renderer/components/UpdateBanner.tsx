import type { UpdateInfo } from "@shared/ipc";

interface UpdateBannerProps {
  info: UpdateInfo | null;
  onDismiss: () => void;
}

export default function UpdateBanner({ info, onDismiss }: UpdateBannerProps): JSX.Element | null {
  if (!info) return null;

  return (
    <div className="flex items-start gap-3 p-4 bg-base-200 rounded-2xl">
      <span className={`mt-0.5 ${info.isMajor ? "text-warning" : "text-info"}`}>
        {info.isMajor ? "⚠" : "↑"}
      </span>
      <div className="flex-1">
        <p className="font-medium">
          {info.isMajor
            ? `Major update available — v${info.latest}`
            : `New version available — v${info.latest}`}
        </p>
        <p className="text-sm text-base-content/60 mt-0.5">
          {info.isMajor
            ? "This release contains significant new features and changes. "
            : `You have v${info.current}. `}
          <button
            className="underline hover:no-underline"
            onClick={() => window.api.openExternal("https://github.com/wslyvh/paperweight/releases")}
          >
            View release
          </button>
        </p>
        <button
          className="btn btn-primary btn-sm mt-2"
          onClick={() => window.api.installUpdate()}
        >
          Restart to update
        </button>
      </div>
      <button
        className="btn btn-ghost btn-xs"
        onClick={onDismiss}
        aria-label="Dismiss update notification"
      >
        ✕
      </button>
    </div>
  );
}
