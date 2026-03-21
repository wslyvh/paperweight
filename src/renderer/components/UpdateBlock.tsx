import type { UpdateInfo } from "@shared/ipc";

interface Props {
  info: UpdateInfo;
  onDismiss: () => void;
}

export default function UpdateBlock({ info, onDismiss }: Props): JSX.Element {
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
