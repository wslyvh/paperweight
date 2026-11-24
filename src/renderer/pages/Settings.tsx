import WipeDataModal from "../components/WipeDataModal";
import ConnectionError from "../components/ConnectionError";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import makeBlockie from "ethereum-blockies-base64";
import { HelpCircle, Lock, Moon, Sun } from "lucide-react";
import {
  type AccountInfo,
  type AgentAccess,
  type EmailConnection,
  type LicenseStatus,
  type McpSetup,
  type WhitelistEntry,
} from "@shared/types";
import { APP_CONFIG } from "@shared/config";
import { formatBytes } from "@shared/formatting";
import {
  useLicense,
  useRefreshLicense,
  useActionAccess,
  PRO_UPGRADE_BODY,
} from "../context/LicenseContext";
import {
  ProviderSelect,
  OAuthSelectRow,
  GmailConnect,
  MicrosoftConnect,
  AppleConnect,
  ProtonConnect,
  ImapConnect,
} from "../components/ProviderConnect";
import ServerSettingsModal from "../components/ServerSettingsModal";
import { useAccounts } from "../hooks/useAccounts";
import {
  readColorTheme,
  setColorTheme as applyAndSaveColorTheme,
  type ColorTheme,
} from "../utils/colorTheme";
import { GoogleLogo, MicrosoftLogo } from "@shared/provider-logos";

type AddAccountView = "provider" | "gmail" | "microsoft" | "apple" | "proton" | "imap";

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [account, setAccount] = useState<AccountInfo>();
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [connection, setConnection] = useState<EmailConnection | null>(null);
  const [autoLaunch, setAutoLaunch] = useState(() => !!window.api.getSettings().autoLaunch);
  const [launchMinimized, setLaunchMinimized] = useState(() => !!window.api.getSettings().launchMinimized);
  const [colorTheme, setColorTheme] = useState<ColorTheme>(readColorTheme);
  const [agentAccess, setAgentAccess] = useState<AgentAccess>(
    () => window.api.getSettings().agentAccess ?? "off",
  );
  const [agentMaskPersonalData, setAgentMaskPersonalData] = useState(
    () => window.api.getSettings().agentMaskPersonalData !== false,
  );
  const [showAgentActionsModal, setShowAgentActionsModal] = useState(false);
  const [showAgentUnmaskModal, setShowAgentUnmaskModal] = useState(false);
  const [mcpSetup, setMcpSetup] = useState<McpSetup>();
  const [mcpConfigCopied, setMcpConfigCopied] = useState(false);
  const [showResyncModal, setShowResyncModal] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const license = useLicense();
  const allowAction = useActionAccess();
  const refreshLicense = useRefreshLicense();
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseError, setLicenseError] = useState("");
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const [whitelistEntries, setWhitelistEntries] = useState<WhitelistEntry[]>(
    [],
  );
  const [newEntry, setNewEntry] = useState("");
  const [reconnectAccount, setReconnectAccount] = useState<AccountInfo>();
  const [reconnectStarted, setReconnectStarted] = useState(false);
  const [reconnectCopyFirst, setReconnectCopyFirst] = useState(false);
  async function refreshAccount() {
    setAccount(await window.api.getAccountInfo());
  }
  const { accounts, refresh: refreshAccounts } = useAccounts();
  const [removeAccountEmail, setRemoveAccountEmail] = useState<string | null>(
    null,
  );
  const [removeInProgress, setRemoveInProgress] = useState(false);
  const [switchingEmail, setSwitchingEmail] = useState<string | null>(null);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [addAccountView, setAddAccountView] =
    useState<AddAccountView>("provider");
  const [addAccountCopyFirst, setAddAccountCopyFirst] = useState(false);
  const licenseSectionRef = useRef<HTMLDivElement>(null);
  const accountsSectionRef = useRef<HTMLDivElement>(null);
  const syncSectionRef = useRef<HTMLDivElement>(null);

  const mcpConfig = mcpSetup?.server
    ? JSON.stringify({ mcpServers: { paperweight: mcpSetup.server } }, null, 2)
    : undefined;

  const fetchWhitelist = async (): Promise<void> => {
    const entries = await window.api.getWhitelistEntries();
    setWhitelistEntries(entries);
  };

  useEffect(() => {
    window.api.getAccountInfo().then(setAccount);
    window.api.getEmailConnection().then(setConnection);
    window.api.getMcpSetup().then(setMcpSetup);
    fetchWhitelist();
  }, []);

  useEffect(() => {
    setColorTheme(readColorTheme());
  }, [location.pathname]);

  useEffect(() => {
    const state = location.state as {
      openServerSettings?: boolean;
      scrollToLicense?: boolean;
      scrollToAccounts?: boolean;
      scrollToSync?: boolean;
    } | null;
    if (!state?.openServerSettings && !state?.scrollToLicense && !state?.scrollToAccounts && !state?.scrollToSync) return;
    if (state.openServerSettings) {
      setShowServerSettings(true);
    }
    if (state.scrollToSync) {
      syncSectionRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    }
    if (state.scrollToLicense) {
      licenseSectionRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    }
    if (state.scrollToAccounts) {
      accountsSectionRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  const handleAddEntry = async (): Promise<void> => {
    if (!allowAction("curate")) return;
    const value = newEntry.trim().toLowerCase();
    if (!value) return;
    if (!value.includes(".")) return;
    await window.api.addWhitelistEntry(value);
    setNewEntry("");
    fetchWhitelist();
  };

  const handleRemoveWhitelistEntry = async (value: string): Promise<void> => {
    if (!allowAction("curate")) return;
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
    refreshAccounts();
  };

  const handleResync = async (): Promise<void> => {
    if (!allowAction("curate")) return;
    await window.api.resyncData();
    setShowResyncModal(false);
    window.api.startSync();
    window.api.getAccountInfo().then(setAccount);
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
    if (status.tier === "pro") return "Paperweight Pro";
    if (status.tier === "cleanup") return "Cleanup Pass";
    if (status.tier === "lifetime") return "Lifetime Pro";
    return "Licensed";
  };

  const connectionHealthy = !!connection;

  const handleReconnect = (): void => {
    if (!account) return;
    if (account.providerType === "imap") {
      setShowServerSettings(true);
    } else if (account.providerType === "gmail" || account.providerType === "microsoft") {
      setReconnectStarted(false);
      setReconnectCopyFirst(false);
      setReconnectAccount(account);
    }
  };

  const handleReconnectSuccess = (): void => {
    setReconnectAccount(undefined);
    void refreshAccount();
    window.api.getEmailConnection().then(setConnection);
  };

  const actionBusy = switchingEmail !== null || removeInProgress;
  const needsLicense = !license.active && accounts.length >= 1;

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            title={
              colorTheme === "dim"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            onClick={() => {
              const theme: ColorTheme = colorTheme === "dim" ? "silk" : "dim";
              setColorTheme(theme);
              applyAndSaveColorTheme(theme);
            }}
          >
            {colorTheme === "dim" ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Sun className="w-4 h-4" />
            )}
          </button>
          <button
            className="btn btn-ghost btn-sm btn-square"
            onClick={() => navigate("/support")}
            title="Support"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
      {account?.storageError && !account.credentialsMissing ? (
        <ConnectionError
          error={account.storageError}
          onRetry={refreshAccount}
        />
      ) : account?.storageError && !showServerSettings && (
        <ConnectionError
          reconnect
          error={account.storageError}
          onRetry={handleReconnect}
        />
      )}

      {/* Section 1: Accounts */}
      <div id="accounts" ref={accountsSectionRef} className="card bg-base-200">
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
                      {` · ${formatBytes(acc.sizeBytes)}`}
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
                  {acc.isActive && acc.providerType === "imap" && account?.server && (
                    <button
                      className="btn btn-ghost btn-xs"
                      disabled={actionBusy}
                      onClick={() => setShowServerSettings(true)}
                    >
                      Configure
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-xs text-error"
                    disabled={actionBusy}
                    onClick={() => {
                      setDeletionError("");
                      setRemoveAccountEmail(acc.email);
                    }}
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
                Requires Pro
              </span>
            )}
            <button
              type="button"
              className="btn btn-link btn-sm px-0"
              onClick={() => navigate("/profile")}
            >
              Manage your profile
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: License */}
      <div id="license" ref={licenseSectionRef} className="card bg-base-200">
        <div className="card-body space-y-4">
          <h3 className="font-semibold">
            {license.active ? "License" : "Upgrade to Pro"}
          </h3>

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
                <div className="space-y-3">
                  <p className="text-sm text-base-content/60">
                    {PRO_UPGRADE_BODY}
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
                    className="btn btn-primary btn-sm w-fit"
                    onClick={() =>
                      window.api.openExternal(`${APP_CONFIG.WEBSITE}/pricing`)
                    }
                  >
                    View Pro plans
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Section 3: Sync */}
      <div ref={syncSectionRef} className="card bg-base-200">
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
                <span>Full history</span>
              </div>

              {!account.credentialsMissing && (account.providerType === "gmail" ||
                account.providerType === "microsoft" ||
                account.providerType === "imap") && (
                  <button
                    className="btn btn-sm btn-primary w-fit"
                    onClick={handleReconnect}
                  >
                    Reconnect
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

      {/* Section 5: AI Agent Access */}
      <div className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">AI Agent access (experimental)</h3>
          <p className="text-sm text-base-content/60">
            MCP access requires Pro. Choose what connected agents can do with Paperweight.
          </p>

          <div
            role="alert"
            className="flex items-start gap-3 p-4 bg-warning/10 border border-warning/20 rounded-box"
          >
            <Lock
              className="w-5 h-5 mt-0.5 text-warning shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="font-semibold">Only use with models you trust</p>
              <p className="text-sm text-base-content/60">
                Data might be shared with your model provider. Use a local model
                (e.g. Ollama) to keep all data on your device.
              </p>
            </div>
          </div>

          <label className="form-control w-full max-w-sm flex flex-col gap-2">
            <span className="label-text text-sm font-medium">Access</span>
            <select
              className="select select-bordered select-sm"
              value={agentAccess}
              onChange={(event) => {
                const access = event.target.value;
                if (access !== "off" && access !== "read" && access !== "actions") return;
                if (access === "actions" && agentAccess !== "actions") {
                  setShowAgentActionsModal(true);
                  return;
                }
                if (agentAccess === "off" && access !== "off") {
                  setAgentMaskPersonalData(true);
                }
                setAgentAccess(access);
                void window.api.saveSettings({ agentAccess: access });
              }}
            >
              <option value="off">Off</option>
              <option value="read" disabled={!license.active}>Read only</option>
              <option value="actions" disabled={!license.active}>Read &amp; write</option>
            </select>
          </label>
          {agentAccess === "actions" ? (
            <div className="space-y-1 max-w-2xl">
              <p className="text-sm text-base-content/60">
                Agents can unsubscribe, trash, report spam, and update
                Paperweight data for the selected mailbox.
              </p>
              <p className="text-xs text-base-content/50">
                Sending a privacy request or case follow-up asks for approval in
                the agent. Recommended to turn on tool-call approvals in your
                agent. Use at own risk.
              </p>
            </div>
          ) : (
            <p className="text-xs text-base-content/50">
              {agentAccess === "off"
                ? "Agents cannot access Paperweight."
                : "Agents can read data, but not change anything."}
            </p>
          )}

          {agentAccess !== "off" && (
            <>
              <div className="divider my-1" />

              <div className="space-y-2">
                <div className="form-control">
                  <label className="label cursor-pointer justify-start gap-3">
                    <input
                      type="checkbox"
                      className="toggle toggle-primary toggle-sm"
                      checked={agentMaskPersonalData}
                      onChange={(event) => {
                        if (!event.target.checked) {
                          setShowAgentUnmaskModal(true);
                          return;
                        }
                        setAgentMaskPersonalData(true);
                        void window.api.saveSettings({ agentMaskPersonalData: true });
                      }}
                    />
                    <span className="text-sm font-medium">Mask personal data</span>
                  </label>
                </div>
                {agentMaskPersonalData ? (
                  <>
                    <p className="text-sm text-base-content/60 max-w-2xl">
                      Paperweight masks known personal data such as your profile,
                      PII findings, addresses, and matches in message text. This
                      is best-effort, and undetected details in mail can still be
                      forwarded to your agent.
                    </p>
                    <p className="text-xs text-base-content/50 max-w-2xl">
                      Recommended when interacting with agents.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-warning max-w-2xl">
                    Personal data the App can show is visible to the agent,
                    including profile values and message text. Turn masking on
                    unless you use a local model you trust.
                  </p>
                )}
              </div>

              <div className="divider my-1" />

              <div className="space-y-3">
                <h4 className="text-sm font-semibold">MCP config</h4>
                <p className="text-sm text-base-content/60">
                  Add this server to your agent's MCP config, then restart the agent.
                </p>
                {mcpSetup?.available && mcpConfig ? (
                  <div className="space-y-2">
                    <pre className="rounded-box bg-base-300 p-3 overflow-x-auto text-xs">
                      <code>{mcpConfig}</code>
                    </pre>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(mcpConfig);
                        setMcpConfigCopied(true);
                        window.setTimeout(() => setMcpConfigCopied(false), 2_000);
                      }}
                    >
                      {mcpConfigCopied ? "Copied" : "Copy config"}
                    </button>
                  </div>
                ) : mcpSetup ? (
                  <p className="text-sm text-error">
                    This build doesn't include the Paperweight MCP server.
                  </p>
                ) : (
                  <span className="loading loading-spinner loading-xs" />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Section 6: Whitelist */}
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

      {/* Section 7: Danger Zone */}
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
              onClick={() => {
                setDeletionError("");
                setShowWipeModal(true);
              }}
            >
              Wipe All Data
            </button>
          </div>
        </div>
      </div>

      {showAgentActionsModal && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Enable Read &amp; write?</h3>
            <div className="py-4 space-y-3">
              <p>
                This allows agents to act on your behalf, such as unsubscribing,
                deleting, or reporting messages as spam. Sending a privacy request
                or follow-up will still ask for explicit approval before sending.
                Recommended to turn on tool-call approvals in your agent.
              </p>
              <p>Use at own risk.</p>
            </div>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setShowAgentActionsModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await window.api.saveSettings({
                    agentAccess: "actions",
                    confirmAgentActions: true,
                  });
                  if (agentAccess === "off") setAgentMaskPersonalData(true);
                  setAgentAccess("actions");
                  setShowAgentActionsModal(false);
                }}
              >
                Enable Read &amp; write
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowAgentActionsModal(false)}>close</button>
          </form>
        </dialog>
      )}

      {showAgentUnmaskModal && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Turn off personal-data masking?</h3>
            <p className="py-4">
              Your agent will receive any personal data that you discuss,
              including profile values and message text. Use only with a
              (local) model you trust or leave this turned on.
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setShowAgentUnmaskModal(false)}
              >
                Keep masking
              </button>
              <button
                className="btn btn-error"
                onClick={async () => {
                  await window.api.saveSettings({
                    agentMaskPersonalData: false,
                    confirmAgentUnmask: true,
                  });
                  setAgentMaskPersonalData(false);
                  setShowAgentUnmaskModal(false);
                }}
              >
                Turn off masking
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowAgentUnmaskModal(false)}>close</button>
          </form>
        </dialog>
      )}

      {reconnectAccount && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Reconnect account</h3>
            {!reconnectStarted ? (
              <>
                <OAuthSelectRow
                  logo={reconnectAccount.providerType === "gmail" ? <GoogleLogo /> : <MicrosoftLogo />}
                  label={reconnectAccount.providerType === "gmail" ? "Connect with Google" : "Connect with Microsoft"}
                  copyAriaLabel="Copy sign-in link"
                  onConnect={(copy) => {
                    setReconnectCopyFirst(copy);
                    setReconnectStarted(true);
                  }}
                />
                <div className="modal-action">
                  <button className="btn btn-ghost" onClick={() => setReconnectAccount(undefined)}>Cancel</button>
                </div>
              </>
            ) : reconnectAccount.providerType === "gmail" ? (
              <GmailConnect
                intent={{ type: "reconnect", email: reconnectAccount.email }}
                copyFirst={reconnectCopyFirst}
                onSuccess={handleReconnectSuccess}
                onBack={() => setReconnectAccount(undefined)}
              />
            ) : (
              <MicrosoftConnect
                intent={{ type: "reconnect", email: reconnectAccount.email }}
                copyFirst={reconnectCopyFirst}
                onSuccess={handleReconnectSuccess}
                onBack={() => setReconnectAccount(undefined)}
              />
            )}
          </div>
        </dialog>
      )}

      {/* Add account modal */}
      {showAddAccountModal && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Add account</h3>

            {addAccountView === "provider" && (
              <>
                <ProviderSelect
                  onGmail={(copy) => {
                    setAddAccountCopyFirst(copy);
                    setAddAccountView("gmail");
                  }}
                  onMicrosoft={(copy) => {
                    setAddAccountCopyFirst(copy);
                    setAddAccountView("microsoft");
                  }}
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
                intent={{ type: "add" }}
                copyFirst={addAccountCopyFirst}
                onSuccess={handleAddAccountSuccess}
                onBack={() => setAddAccountView("provider")}
              />
            )}

            {addAccountView === "microsoft" && (
              <MicrosoftConnect
                intent={{ type: "add" }}
                copyFirst={addAccountCopyFirst}
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

      {/* Server settings modal (IMAP accounts only) */}
      {showServerSettings && account?.providerType === "imap" && (
        <ServerSettingsModal
          email={account.email}
          initial={account.server}
          onClose={() => setShowServerSettings(false)}
          onSaved={() => {
            setShowServerSettings(false);
            window.api.getAccountInfo().then(setAccount);
            window.api.getEmailConnection().then(setConnection);
            window.api.startSync();
          }}
        />
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
            {deletionError && (
              <p className="text-sm text-error">{deletionError}</p>
            )}
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                disabled={removeInProgress}
                onClick={() => {
                  setDeletionError("");
                  setRemoveAccountEmail(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-error"
                disabled={removeInProgress}
                onClick={async () => {
                  const email = removeAccountEmail;
                  setRemoveInProgress(true);
                  setDeletionError("");
                  try {
                    await window.api.removeAccount(email);
                    refreshAccounts();
                    setRemoveAccountEmail(null);
                  } catch {
                    setDeletionError(
                      "Paperweight could not delete this account's local data. Close other programs using these files and try again.",
                    );
                  } finally {
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
            <button
              disabled={removeInProgress}
              onClick={() => {
                setDeletionError("");
                setRemoveAccountEmail(null);
              }}
            >
              close
            </button>
          </form>
        </dialog>
      )}

      {showWipeModal && <WipeDataModal onClose={() => setShowWipeModal(false)} />}
    </div>
  );
}
