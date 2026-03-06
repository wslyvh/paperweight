import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Copy } from "lucide-react";
import type { SupportInfo } from "@shared/types";
import DeviceInfoCard from "../components/DeviceInfoCard";
import HelpSection from "../components/HelpSection";
import { useLicense } from "../context/LicenseContext";

export default function Support(): JSX.Element {
  const navigate = useNavigate();
  const license = useLicense();
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          className="btn btn-ghost btn-sm btn-square"
          onClick={() => navigate("/settings")}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-2xl font-bold">Support</h1>
      </div>

      <div className="max-w-xl space-y-6">
        <DeviceInfoCard info={info} />

        {/* App Info */}
        <div className="card bg-base-200">
          <div className="card-body space-y-3">
            <h3 className="font-semibold">App Info</h3>
            {info && (
              <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <span className="text-base-content/50">Provider</span>
                <span>{formatProvider(info.providerType)}</span>

                <span className="text-base-content/50">License</span>
                <span>{license.active ? "Active" : "Free"}</span>

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

        <HelpSection />
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
              <button className="btn btn-ghost btn-xs gap-1" onClick={copyLogs}>
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
