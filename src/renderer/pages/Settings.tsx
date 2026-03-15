import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import makeBlockie from "ethereum-blockies-base64";
import { HelpCircle } from "lucide-react";
import type {
  AccountInfo,
  AccountSummary,
  EmailConnection,
  LicenseStatus,
  WhitelistEntry,
} from "@shared/types";
import { useLicense, useRefreshLicense } from "../context/LicenseContext";

export default function Settings(): JSX.Element {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountInfo>();
  const [connection, setConnection] = useState<EmailConnection | null>(null);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [launchMinimized, setLaunchMinimized] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const license = useLicense();
  const refreshLicense = useRefreshLicense();
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseError, setLicenseError] = useState("");
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [whitelistEntries, setWhitelistEntries] = useState<WhitelistEntry[]>(
    [],
  );
  const [newEntry, setNewEntry] = useState("");
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [removeAccountEmail, setRemoveAccountEmail] = useState<string | null>(null);

  const fetchWhitelist = async (): Promise<void> => {
    const entries = await window.api.getWhitelistEntries();
    setWhitelistEntries(entries);
  };

  useEffect(() => {
    window.api.getAccountInfo().then(setAccount);
    window.api.getSettings().then((s) => {
      setAutoLaunch(!!s.autoLaunch);
      setLaunchMinimized(!!s.launchMinimized);
    });
    window.api.getEmailConnection().then(setConnection);
    window.api.listAccounts().then(setAccounts);
    fetchWhitelist();
  }, []);

  const handleAddEntry = async (): Promise<void> => {
    const value = newEntry.trim().toLowerCase();
    if (!value) return;
    if (!value.includes(".")) return;
    await window.api.addWhitelistEntry(value);
    setNewEntry("");
    fetchWhitelist();
  };

  const handleRemoveWhitelistEntry = async (value: string): Promise<void> => {
    await window.api.removeWhitelistEntry(value);
    fetchWhitelist();
  };

  const handleActivateLicense = async (): Promise<void> => {
    const key = licenseKey.trim();
    if (!key) return;
    setLicenseLoading(true);
    setLicenseError("");
    try {
      const status = await window.api.activateLicense(key);
      await refreshLicense();
      if (!status.active) {
        setLicenseError("Invalid or expired license key.");
      } else {
        setLicenseKey("");
        window.api.startSync();
      }
    } catch (err) {
      setLicenseError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setLicenseLoading(false);
    }
  };

  const handleDeactivateLicense = async (): Promise<void> => {
    await window.api.deactivateLicense();
    await refreshLicense();
  };

  const handleClearSync = async (): Promise<void> => {
    await window.api.clearSyncData();
    setShowClearModal(false);
    window.api.getAccountInfo().then(setAccount);
  };

  const handleWipe = async (): Promise<void> => {
    const result = await window.api.wipeData();
    setShowWipeModal(false);
    if (!result?.willRelaunch) {
      navigate("/onboarding");
    }
  };

  const formatProvider = (type: string): string => {
    if (type === "gmail") return "Gmail (OAuth)";
    if (type === "microsoft") return "Microsoft (OAuth)";
    if (type === "imap") return "IMAP";
    return "Not connected";
  };

  const formatDate = (ts?: number): string => {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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

  const tierLabel = (status: LicenseStatus): string => {
    if (!status.active) return "Free";
    if (status.tier === "lifetime") return "Lifetime";
    if (status.tier === "test") return "Test";
    return "Licensed";
  };

  const connectionHealthy = connection ? connection.canRead : false;

  const handleReconnect = async (): Promise<void> => {
    setReconnectLoading(true);
    try {
      let result: { success: boolean; error?: string };
      if (account?.providerType === "microsoft") {
        result = await window.api.startMicrosoftAuth();
      } else {
        result = await window.api.startGmailAuth();
      }
      if (result.success) {
        const conn = await window.api.getEmailConnection();
        setConnection(conn);
        setAccount(await window.api.getAccountInfo());
        window.api.startSync();
      }
    } finally {
      setReconnectLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <button
          className="btn btn-ghost btn-sm btn-square"
          onClick={() => navigate("/support")}
          title="Support"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {/* Section 1: Account */}
      <div className="card bg-base-200">
        <div className="card-body space-y-4">
          <h3 className="font-semibold">Account</h3>

          {account && (
            <>
              <div className="flex items-start gap-4">
                <img
                  src={makeBlockie(account.email)}
                  alt=""
                  className="w-12 h-12 rounded-lg"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {account.email}
                    </span>
                    <span className="badge badge-xs badge-soft badge-accent shrink-0">
                      early adopter
                    </span>
                  </div>
                  <p className="text-xs text-base-content/50 mt-0.5">
                    Registered {formatDate(account.registeredAt)}
                  </p>
                </div>
              </div>

              <h4 className="text-sm font-semibold text-base-content/70 pt-2">
                License
              </h4>

              {license.active ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                    <span className="text-base-content/50">Type</span>
                    <span>{tierLabel(license)}</span>

                    <span className="text-base-content/50">Key</span>
                    <span className="font-mono">
                      {license.key ? `XXXX-XXXX-${license.key.slice(-4)}` : ""}
                    </span>

                    {license.expiresAt && (
                      <>
                        <span className="text-base-content/50">Expires</span>
                        <span>
                          {new Date(
                            license.expiresAt,
                          ).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        window.api.openExternal(
                          license.portalUrl ||
                            "https://paperweight.email",
                        )
                      }
                    >
                      Manage
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handleDeactivateLicense}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-base-content/60">
                    Activate a license key to unlock full email history sync.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input input-bordered input-sm flex-1"
                      placeholder="License key"
                      value={licenseKey}
                      onChange={(e) => setLicenseKey(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleActivateLicense()
                      }
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={licenseLoading || !licenseKey.trim()}
                      onClick={handleActivateLicense}
                    >
                      {licenseLoading ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        "Activate"
                      )}
                    </button>
                  </div>
                  {licenseError && (
                    <p className="text-xs text-error">{licenseError}</p>
                  )}
                  <button
                    className="btn btn-ghost btn-sm w-fit"
                    onClick={() =>
                      window.api.openExternal("https://paperweight.email")
                    }
                  >
                    Buy License
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Section 2: Email Provider */}
      <div className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">Email Provider</h3>

          {account && (
            <>
              <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <span className="text-base-content/50">Email</span>
                <span>{account.email}</span>

                <span className="text-base-content/50">Connection</span>
                <span className="flex items-center gap-2">
                  {formatProvider(account.providerType)}
                  <span
                    className={`w-2 h-2 rounded-full ${connectionHealthy ? "bg-success" : "bg-error"}`}
                  />
                </span>

                <span className="text-base-content/50">Last sync</span>
                <span>{formatDateTime(account.lastSyncAt)}</span>

                <span className="text-base-content/50">Messages synced</span>
                <span>{account.totalMessages.toLocaleString()}</span>

                <span className="text-base-content/50">Sync period</span>
                <span>{license.active ? "Full history" : "30 days"}</span>
              </div>

              {(account.providerType === "gmail" || account.providerType === "microsoft") && (
                <button
                  className="btn btn-sm btn-primary w-fit"
                  onClick={handleReconnect}
                  disabled={reconnectLoading}
                >
                  {reconnectLoading ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    "Reconnect"
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Section 3: App Settings */}
      <div className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">App Settings</h3>
          <div className="form-control">
            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={autoLaunch}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setAutoLaunch(enabled);
                  if (!enabled) setLaunchMinimized(false);
                  window.api.saveSettings({
                    autoLaunch: enabled,
                    launchMinimized: enabled ? launchMinimized : false,
                  });
                }}
              />
              <span className="text-sm font-medium">Launch at login</span>
            </label>
          </div>
          {autoLaunch && (
            <div className="form-control">
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm"
                  checked={launchMinimized}
                  onChange={(e) => {
                    const minimized = e.target.checked;
                    setLaunchMinimized(minimized);
                    window.api.saveSettings({ launchMinimized: minimized });
                  }}
                />
                <span className="text-sm font-medium">Open in background</span>
              </label>
              <p className="text-xs text-base-content/50 ml-12">
                Start hidden when auto-launched at login
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Whitelist */}
      <div className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">Whitelist</h3>
          <p className="text-sm text-base-content/60">
            Whitelisted domains and addresses are hidden from Mail. Add a domain
            (e.g. example.com) to whitelist all senders from it, or an address
            (e.g. user@example.com) to whitelist a single sender.
          </p>
          {whitelistEntries.length > 0 && (
            <div className="space-y-1">
              {whitelistEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between text-sm py-1"
                >
                  <span>{entry.value}</span>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => handleRemoveWhitelistEntry(entry.value)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              className="input input-bordered input-sm flex-1"
              placeholder="example.com or user@example.com"
              value={newEntry}
              onChange={(e) => setNewEntry(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddEntry()}
            />
            <button className="btn btn-primary btn-sm" onClick={handleAddEntry}>
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Section 5: Accounts */}
      {accounts.length > 0 && (
        <div className="card bg-base-200">
          <div className="card-body space-y-3">
            <h3 className="font-semibold">Accounts</h3>
            <div className="space-y-2">
              {accounts.map((acc) => (
                <div key={acc.email} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={makeBlockie(acc.email)}
                      alt=""
                      className="w-8 h-8 rounded-md shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{acc.email}</p>
                      <p className="text-xs text-base-content/50">{formatProvider(acc.providerType)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {acc.isActive ? (
                      <span className="badge badge-xs badge-soft badge-success">Active</span>
                    ) : (
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => window.api.switchAccount(acc.email)}
                      >
                        Switch
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => setRemoveAccountEmail(acc.email)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="btn btn-primary btn-sm w-fit"
              onClick={() => navigate("/onboarding")}
            >
              Add Account
            </button>
          </div>
        </div>
      )}

      {/* Section 6: Danger Zone */}
      <div className="card bg-base-200 border border-error/30">
        <div className="card-body space-y-4">
          <h3 className="font-semibold text-error">Danger Zone</h3>
          <div>
            <p className="text-sm text-base-content/60">
              Clear all synced emails and sender data. Your connection,
              settings, and whitelist are kept so you can re-sync.
            </p>
            <button
              className="btn btn-error btn-outline btn-sm w-fit mt-2"
              onClick={() => setShowClearModal(true)}
            >
              Clear Data
            </button>
          </div>
          <div>
            <p className="text-sm text-base-content/60">
              Delete everything including emails, settings, and stored
              credentials.
            </p>
            <button
              className="btn btn-error btn-sm w-fit mt-2"
              onClick={() => setShowWipeModal(true)}
            >
              Wipe All Data
            </button>
          </div>
        </div>
      </div>

      {/* Clear sync data confirmation modal */}
      {showClearModal && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Clear sync data?</h3>
            <p className="py-4">
              This will delete all synced emails, sender data, and detected
              accounts. Your connection, settings, and whitelist will be kept.
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setShowClearModal(false)}
              >
                Cancel
              </button>
              <button className="btn btn-warning" onClick={handleClearSync}>
                Clear Sync Data
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowClearModal(false)}>close</button>
          </form>
        </dialog>
      )}

      {/* Remove account confirmation modal */}
      {removeAccountEmail && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Remove account?</h3>
            <p className="py-4">
              This will permanently delete all local data for{" "}
              <span className="font-medium">{removeAccountEmail}</span>, including
              synced emails and credentials. This action cannot be undone.
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setRemoveAccountEmail(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-error"
                onClick={async () => {
                  const email = removeAccountEmail;
                  setRemoveAccountEmail(null);
                  await window.api.removeAccount(email);
                  // If the app didn't relaunch (non-active or last account removed),
                  // refresh state
                  const updated = await window.api.listAccounts();
                  if (updated.length === 0) {
                    navigate("/onboarding");
                  } else {
                    setAccounts(updated);
                  }
                }}
              >
                Remove
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setRemoveAccountEmail(null)}>close</button>
          </form>
        </dialog>
      )}

      {/* Wipe confirmation modal */}
      {showWipeModal && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Are you sure?</h3>
            <p className="py-4">
              This will permanently delete all local data, including your email
              database and stored credentials. This action cannot be undone.
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setShowWipeModal(false)}
              >
                Cancel
              </button>
              <button className="btn btn-error" onClick={handleWipe}>
                Wipe Everything
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowWipeModal(false)}>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
}
