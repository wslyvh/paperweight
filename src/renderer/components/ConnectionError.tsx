import { useEffect, useState } from "react";
import { Lock, AlertCircle } from "lucide-react";
import { isStorageError, STORAGE_SAVE_ERROR } from "@shared/secureStorage";

interface ConnectionErrorProps {
  error: string;
  onRetry: () => void | Promise<void>;
  reconnect?: boolean;
}

export default function ConnectionError({ error, onRetry, reconnect = false }: ConnectionErrorProps) {
  const [platform, setPlatform] = useState("");
  const [retrying, setRetrying] = useState(false);
  const storageError = reconnect || isStorageError(error);
  const Icon = storageError ? Lock : AlertCircle;
  useEffect(() => {
    if (storageError) window.api.getSecureStorageStatus().then((status) => setPlatform(status.platform)).catch(() => {});
  }, [storageError]);

  const helpUrl = platform === "linux"
    ? "https://help.gnome.org/seahorse/keyring.html"
    : platform === "darwin"
      ? "https://support.apple.com/guide/keychain-access/mac-keychain-password-kyca1242/mac"
      : "https://github.com/wslyvh/paperweight/issues";

  async function retry() {
    setRetrying(true);
    try {
      if (reconnect || !storageError || (await window.api.getSecureStorageStatus()).available) await onRetry();
    } catch {
      // Keep the warning visible when the storage check still fails.
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div role="alert" className="p-4 bg-warning/10 border border-warning/20 rounded-box space-y-3">
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          {storageError && <p className="font-semibold">Secure storage unavailable</p>}
          <p className="text-sm text-base-content/70 whitespace-pre-line">{storageError ? STORAGE_SAVE_ERROR : error}</p>
        </div>
      </div>
      {storageError && (
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-sm btn-primary" disabled={retrying} onClick={() => { void retry(); }}>
            {retrying ? (reconnect ? "Connecting…" : "Checking…") : (reconnect ? "Reconnect" : "Retry")}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => { void window.api.openExternal(helpUrl); }}>Learn more</button>
        </div>
      )}
    </div>
  );
}
