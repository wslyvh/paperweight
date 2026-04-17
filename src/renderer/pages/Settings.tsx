import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import makeBlockie from "ethereum-blockies-base64";
import { HelpCircle, Lock } from "lucide-react";
import type {
  AccountInfo,
  EmailConnection,
  LicenseStatus,
  WhitelistEntry,
} from "@shared/types";
import { useLicense, useRefreshLicense } from "../context/LicenseContext";
import {
  ProviderSelect,
  GmailConnect,
  MicrosoftConnect,
  AppleConnect,
  ProtonConnect,
  ImapConnect,
} from "../components/ProviderConnect";
import { useAccounts } from "../hooks/useAccounts";

type AddAccountView = "provider" | "gmail" | "microsoft" | "apple" | "proton" | "imap";

export default function Settings(): JSX.Element {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountInfo>();
  const [connection, setConnection] = useState<EmailConnection | null>(null);
  const [autoLaunch, setAutoLaunch] = useState(() => !!window.api.getSettings().autoLaunch);
  const [launchMinimized, setLaunchMinimized] = useState(() => !!window.api.getSettings().launchMinimized);
  const [showResyncModal, setShowResyncModal] = useState(false);
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
  const { accounts, refresh: refreshAccounts } = useAccounts();
  const [removeAccountEmail, setRemoveAccountEmail] = useState<string | null>(
    null,
  );
  const [removeInProgress, setRemoveInProgress] = useState(false);
  const [switchingEmail, setSwitchingEmail] = useState<string | null>(null);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [addAccountView, setAddAccountView] =
    useState<AddAccountView>("provider");
  const licenseSectionRef = useRef<HTMLDivElement>(null);

  const fetchWhitelist = async (): Promise<void> => {
    const entries = await window.api.getWhitelistEntries();
    setWhitelistEntries(entries);
  };

  useEffect(() => {
    window.api.getAccountInfo().then(setAccount);
    window.api.getEmailConnection().then(setConnection);
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

  const handleResync = async (): Promise<void> => {
    await window.api.resyncData();
    setShowResyncModal(false);
    window.api.startSync();
    window.api.getAccountInfo().then(setAccount);
  };

  const handleWipe = async (): Promise<void> => {
    await window.api.wipeData();
    setShowWipeModal(false);
  };

  const handleSwitchAccount = async (email: string): Promise<void> => {
    setSwitchingEmail(email);
    try {
      await window.api.switchAccount(email);
      // accountSwitched event triggers App remount
    } catch {
      setSwitchingEmail(null);
    }
  };

  const handleAddAccount = async (): Promise<void> => {
    const result = await window.api.addAccount();
    if (result?.blocked && result.reason === "license_required") {
      licenseSectionRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setAddAccountView("provider");
    setShowAddAccountModal(true);
  };

  const handleAddAccountSuccess = (): void => {
    setShowAddAccountModal(false);
    refreshAccounts();
  };

  const formatProvider = (type: string): string => {
    if (type === "gmail") return "Google";
    if (type === "microsoft") return "Microsoft";
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

  const actionBusy = switchingEmail !== null || removeInProgress;
  const needsLicense = !license.active && accounts.length >= 1;

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

      {/* Section 1: Accounts */}
      <div className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">Accounts</h3>
          <div className="space-y-2">
            {accounts.map((acc) => (
              <div
                key={acc.email}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={makeBlockie(acc.email)}
                    alt=""
                    className="w-9 h-9 rounded-lg shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {acc.email}
                      </span>
                      {acc.isActive && (
                        <span className="badge badge-xs badge-soft badge-success shrink-0">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-base-content/50">
                      {formatProvider(acc.providerType)}
                      {acc.registeredAt
                        ? ` · Registered ${formatDate(acc.registeredAt)}`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!acc.isActive && (
                    <button
                      className="btn btn-ghost btn-xs"
                      disabled={actionBusy}
                      onClick={() => handleSwitchAccount(acc.email)}
                    >
                      {switchingEmail === acc.email ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        "Switch"
                      )}
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-xs text-error"
                    disabled={actionBusy}
                    onClick={() => setRemoveAccountEmail(acc.email)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              className={`btn btn-sm w-fit ${needsLicense ? "btn-ghost" : "btn-primary"}`}
              onClick={handleAddAccount}
            >
              {needsLicense && <Lock className="w-3.5 h-3.5" />}
              Add account
            </button>
            {needsLicense && (
              <span className="text-xs text-base-content/50">
                *requires a license
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: License */}
      <div ref={licenseSectionRef} className="card bg-base-200">
        <div className="card-body space-y-4">
          <h3 className="font-semibold">License</h3>

          {account && (
            <>
              {license.active ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                    <span className="text-base-content/50">Type</span>
                    <span>{tierLabel(license)}</span>

                    <span className="text-base-content/50">Key</span>
                    <span className="font-mono">
                      {license.key
                        ? `XXXX-XXXX-${license.key.slice(-4)}`
                        : ""}
                    </span>

                    {license.expiresAt && (
                      <>
                        <span className="text-base-content/50">Expires</span>
                        <span>
                          {new Date(license.expiresAt).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        window.api.openExternal(
                          license.portalUrl || "https://paperweight.email",
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
                    Activate a license key to unlock full email history sync and multi-account support.
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

      {/* Section 3: Sync */}
      <div className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">Sync</h3>

          {account && (
            <>
              <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
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

              {(account.providerType === "gmail" ||
                account.providerType === "microsoft") && (
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

      {/* Section 4: App Settings */}
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

      {/* Section 5: Whitelist */}
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

      {/* Section 6: Danger Zone */}
      <div className="card bg-base-200 border border-error/30">
        <div className="card-body space-y-4">
          <h3 className="font-semibold text-error">Danger Zone</h3>
          <div>
            <p className="text-sm text-base-content/60">
              Re-sync email data for {account?.email ?? "this account"}. Your
              connections, settings, and whitelists are kept.
            </p>
            <button
              className="btn btn-error btn-outline btn-sm w-fit mt-2"
              onClick={() => setShowResyncModal(true)}
            >
              Re-sync Data
            </button>
          </div>
          <div>
            <p className="text-sm text-base-content/60">
              Delete everything including all accounts, emails, settings,
              stored credentials, and your license.
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

      {/* Add account modal */}
      {showAddAccountModal && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Add account</h3>

            {addAccountView === "provider" && (
              <>
                <ProviderSelect
                  onGmail={() => setAddAccountView("gmail")}
                  onMicrosoft={() => setAddAccountView("microsoft")}
                  onApple={() => setAddAccountView("apple")}
                  onProton={() => setAddAccountView("proton")}
                  onImap={() => setAddAccountView("imap")}
                />
                <div className="modal-action mt-4">
                  <button
                    className="btn btn-ghost"
                    onClick={() => setShowAddAccountModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {addAccountView === "gmail" && (
              <GmailConnect
                onSuccess={handleAddAccountSuccess}
                onBack={() => setAddAccountView("provider")}
              />
            )}

            {addAccountView === "microsoft" && (
              <MicrosoftConnect
                onSuccess={handleAddAccountSuccess}
                onBack={() => setAddAccountView("provider")}
              />
            )}

            {addAccountView === "apple" && (
              <AppleConnect
                onSuccess={handleAddAccountSuccess}
                onBack={() => setAddAccountView("provider")}
              />
            )}

            {addAccountView === "proton" && (
              <ProtonConnect
                onSuccess={handleAddAccountSuccess}
                onBack={() => setAddAccountView("provider")}
              />
            )}

            {addAccountView === "imap" && (
              <ImapConnect
                onSuccess={handleAddAccountSuccess}
                onBack={() => setAddAccountView("provider")}
              />
            )}
          </div>
          {addAccountView === "provider" && (
            <form method="dialog" className="modal-backdrop">
              <button onClick={() => setShowAddAccountModal(false)}>
                close
              </button>
            </form>
          )}
        </dialog>
      )}

      {/* Re-sync confirmation modal */}
      {showResyncModal && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Re-sync data?</h3>
            <p className="py-4">
              All synced emails and sender data for{" "}
              <span className="font-medium">{account?.email}</span> will be
              deleted. Paperweight will re-sync from scratch. Your connections,
              settings, and whitelists are kept.
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setShowResyncModal(false)}
              >
                Cancel
              </button>
              <button className="btn btn-warning" onClick={handleResync}>
                Re-sync
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowResyncModal(false)}>close</button>
          </form>
        </dialog>
      )}

      {/* Remove account confirmation modal */}
      {removeAccountEmail && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Remove account?</h3>
            <p className="py-4">
              This will permanently delete the account data for{" "}
              <span className="font-medium">{removeAccountEmail}</span>, including
              synced emails and settings.
            </p>
            <p className="py-4">Your license is not affected.</p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                disabled={removeInProgress}
                onClick={() => setRemoveAccountEmail(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-error"
                disabled={removeInProgress}
                onClick={async () => {
                  const email = removeAccountEmail;
                  setRemoveInProgress(true);
                  try {
                    await window.api.removeAccount(email);
                    refreshAccounts();
                  } finally {
                    setRemoveAccountEmail(null);
                    setRemoveInProgress(false);
                  }
                }}
              >
                {removeInProgress ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  "Remove"
                )}
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
            <h3 className="font-bold text-lg">Wipe all data?</h3>
            <p className="py-4">
              This will permanently delete <strong>all accounts</strong>,
              synced emails, credentials, settings, and your license. This
              action cannot be undone.
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setShowWipeModal(false)}
              >
                Cancel
              </button>
              <button className="btn btn-error" onClick={handleWipe}>
                Wipe everything
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
