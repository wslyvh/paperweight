import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Copy } from "lucide-react";
import type { SupportInfo } from "@shared/types";

export default function Support(): JSX.Element {
  const navigate = useNavigate();
  const [info, setInfo] = useState<SupportInfo>();
  const [logContent, setLogContent] = useState("");
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    window.api.getSupportInfo().then(setInfo);
    window.api.readLogFile().then(setLogContent);
  }, []);

  const refreshLogs = async () => {
    const content = await window.api.readLogFile();
    setLogContent(content);
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  };

  const copyLogs = async () => {
    await navigator.clipboard.writeText(logContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDateTime = (ts?: number): string => {
    if (!ts) return "Never";
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatProvider = (type: string): string => {
    if (type === "gmail") return "Gmail (OAuth)";
    if (type === "imap") return "IMAP";
    return "Not connected";
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <button
          className="btn btn-ghost btn-sm btn-square"
          onClick={() => navigate("/settings")}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-bold">Support</h1>
      </div>

      {/* Device Info */}
      <div className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">Device Info</h3>
          {info && (
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
          )}
        </div>
      </div>

      {/* App Info */}
      <div className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">App Info</h3>
          {info && (
            <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <span className="text-base-content/50">Provider</span>
              <span>{formatProvider(info.providerType)}</span>

              <span className="text-base-content/50">License</span>
              <span>{info.licenseActive ? "Active" : "Free"}</span>

              <span className="text-base-content/50">Messages synced</span>
              <span>{info.totalMessages.toLocaleString()}</span>

              <span className="text-base-content/50">Last sync</span>
              <span>{formatDateTime(info.lastSyncAt)}</span>

              <span className="text-base-content/50">Database size</span>
              <span>{info.dbSizeMb} MB</span>
            </div>
          )}
        </div>
      </div>

      {/* Links */}
      <div className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">Help</h3>
          <div className="flex flex-col gap-2 text-sm">
            <button
              className="link link-primary w-fit"
              onClick={() =>
                window.api.openExternal(
                  "https://github.com/wslyvh/paperweight/issues"
                )
              }
            >
              Report an issue on GitHub
            </button>
            <button
              className="link link-primary w-fit"
              onClick={() =>
                window.api.openExternal("mailto:hello@paperweight.email")
              }
            >
              Contact hello@paperweight.email
            </button>
          </div>
        </div>
      </div>

      {/* Log Viewer */}
      <div className="card bg-base-200">
        <div className="card-body space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Logs</h3>
            <div className="flex gap-2">
              <button
                className="btn btn-ghost btn-xs gap-1"
                onClick={refreshLogs}
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
              <button
                className="btn btn-ghost btn-xs gap-1"
                onClick={copyLogs}
              >
                <Copy className="w-3 h-3" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          {info && (
            <p className="text-xs text-base-content/50 break-all">
              {info.logPath}
            </p>
          )}
          <textarea
            ref={logRef}
            className="textarea textarea-bordered w-full h-64 font-mono text-xs leading-relaxed"
            readOnly
            value={logContent}
          />
        </div>
      </div>
    </div>
  );
}
