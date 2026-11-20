import { useEffect, useState, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { secureStorageHelpUrl, type StorageState } from "@shared/secureStorage";
import WipeDataModal from "./WipeDataModal";

interface StorageGateProps {
  children: ReactNode;
}

export default function StorageGate({ children }: StorageGateProps) {
  const [state, setState] = useState<StorageState>();
  const [reset, setReset] = useState(false);
  const [retrying, setRetrying] = useState(false);
  async function initialize() {
    setRetrying(true);
    try { setState(await window.api.initializeStorage()); } catch { setState("failed"); }
    finally { setRetrying(false); }
  }
  useEffect(() => {
    void initialize();
  }, []);
  if (state === "ready") return children;
  if (!state) return <div className="flex items-center justify-center h-screen bg-base-100"><span className="loading loading-spinner loading-lg" aria-label="Checking secure storage" /></div>;
  const locked = state === "locked";
  const messages = {
    unavailable: {
      title: "Secure storage unavailable",
      description: "Paperweight couldn't access your computer's secure storage, which protects your sign-in details and encryption key. Access is needed before you can continue. Unlock or restore access to secure storage, then retry.",
    },
    locked: {
      title: "Couldn't unlock your data",
      description: "Your encryption key may be missing or unreadable. Restore the key or access to it, then retry. If it’s lost, reset to reconnect your accounts and scan again.",
    },
    busy: {
      title: "Paperweight data is in use",
      description: "Close other Paperweight instances and stop Paperweight MCP connections in your chat apps or editors, then retry.",
    },
    failed: {
      title: "Couldn't start Paperweight",
      description: "Paperweight couldn't finish preparing your local data. Retry, or contact support if the problem continues.",
    },
  }[state];
  const helpUrl = secureStorageHelpUrl(window.api.platform);
  return (
    <div className="flex flex-col sm:flex-row min-h-screen bg-base-100">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm" role="alert">
          <h1 className="text-2xl font-bold">{messages.title}</h1>
          <p className="text-sm text-base-content/70 mt-3 leading-relaxed">
            {messages.description}
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <button className="btn btn-primary" disabled={retrying} onClick={() => { void initialize(); }}>
              {retrying ? "Checking…" : "Retry"}
            </button>
            {locked && <button className="btn btn-ghost" disabled={retrying} onClick={() => setReset(true)}>Reset</button>}
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-12 bg-secondary text-secondary-content">
        <div className="max-w-sm text-center">
          <LockKeyhole className="w-10 h-10 mx-auto mb-6" aria-hidden="true" />
          <h2 className="text-2xl font-bold mb-3">Keeping your data private</h2>
          <p className="text-sm opacity-70 leading-relaxed">
            Your operating system provides a protected place for sensitive information, linked to your user account. It helps keep passwords and keys safe from unwanted access. Learn how to manage secure storage on your device.
          </p>
          <button className="btn btn-ghost text-secondary-content mt-6" onClick={() => { void window.api.openExternal(helpUrl); }}>Learn more</button>
        </div>
      </div>
      {reset && <WipeDataModal onClose={() => setReset(false)} />}
    </div>
  );
}
