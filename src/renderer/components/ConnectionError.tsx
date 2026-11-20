import { useState } from "react";
import { Lock, AlertCircle } from "lucide-react";
import { isStorageError, secureStorageHelpUrl } from "@shared/secureStorage";

interface ConnectionErrorProps {
  error: string;
  onRetry: () => void | Promise<void>;
  reconnect?: boolean;
}

export default function ConnectionError({ error, onRetry, reconnect = false }: ConnectionErrorProps) {
  const [retrying, setRetrying] = useState(false);
  const storageError = isStorageError(error);
  const Icon = storageError || reconnect ? Lock : AlertCircle;
  const helpUrl = secureStorageHelpUrl(window.api.platform);

  async function retry() {
    setRetrying(true);
    try {
      await onRetry();
    } catch {
      // The caller retains the operation's error if retry fails.
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div role="alert" className={`p-4 border rounded-box space-y-3 ${storageError ? "bg-error/10 border-error/20" : "bg-warning/10 border-warning/20"}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${storageError ? "text-error" : "text-warning"}`} aria-hidden="true" />
        <div>
          {(storageError || reconnect) && <p className="font-semibold">{reconnect ? "Reconnect your account" : "Secure storage unavailable"}</p>}
          <p className="text-sm text-base-content/70 whitespace-pre-line">{error}</p>
        </div>
      </div>
      {(storageError || reconnect) && (
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-sm btn-primary" disabled={retrying} onClick={() => { void retry(); }}>
            {retrying ? (reconnect ? "Connecting…" : "Checking…") : (reconnect ? "Reconnect" : "Retry")}
          </button>
          {storageError && <button type="button" className="btn btn-sm" onClick={() => { void window.api.openExternal(helpUrl); }}>Learn more</button>}
        </div>
      )}
    </div>
  );
}
