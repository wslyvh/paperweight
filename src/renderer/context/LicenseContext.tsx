import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { LicenseStatus } from "@shared/types";
import { APP_CONFIG } from "@shared/config";

import { useNavigate } from "react-router";
import ActionModal from "../components/ActionModal";

const PRICING_URL = `${APP_CONFIG.WEBSITE}/pricing`;

export const PRO_UPGRADE_HEADLINE = "Clean up what you've found";
export const PRO_UPGRADE_BODY =
  "Paperweight Free gives you the full picture. Pro lets you act on it: unsubscribe, remove unwanted mail, send privacy requests, use multiple accounts, and connect MCP agents.";

interface LicenseContextValue {
  license: LicenseStatus;
  allowAction: (intent: "curate" | "execute") => boolean;
  refreshLicense: () => Promise<void>;
}

export function useOpenProUpgrade() {
  const navigate = useNavigate();
  return useCallback(() => {
    navigate("/settings", { state: { scrollToLicense: true } });
    window.api.openExternal(PRICING_URL);
  }, [navigate]);
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function useLicense(): LicenseStatus {
  const ctx = useContext(LicenseContext);
  return ctx?.license ?? { active: false };
}

export function useActionAccess() {
  const ctx = useContext(LicenseContext);
  return ctx?.allowAction ?? (() => false);
}

export function useRefreshLicense(): () => Promise<void> {
  const ctx = useContext(LicenseContext);
  return ctx?.refreshLicense ?? (async () => {});
}

interface LicenseProviderProps {
  initialLicense: LicenseStatus;
  children: React.ReactNode;
}

export function LicenseProvider({
  initialLicense,
  children,
}: LicenseProviderProps) {
  const [license, setLicense] = useState<LicenseStatus>(initialLicense);
  const [blocked, setBlocked] = useState(false);
  const openProUpgrade = useOpenProUpgrade();
  const allowAction = (intent: "curate" | "execute") => {
    if (intent === "execute" && !license.active) {
      setBlocked(true);
      return false;
    }
    return true;
  };

  const refreshLicense = useCallback(async () => {
    const status = await window.api.getLicenseStatus();
    setLicense(status);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => { void refreshLicense(); }, 30_000);
    return () => clearInterval(timer);
  }, [refreshLicense]);

  return (
    <LicenseContext.Provider value={{ license, refreshLicense, allowAction }}>
      {license.error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 p-4 bg-warning/10 border border-warning/20 rounded-box">
          <span className="flex-1 text-sm">{license.error}</span>
          <button className="btn btn-sm" onClick={() => { void refreshLicense(); }}>Retry</button>
        </div>
      )}
      {children}
      <ActionModal
        isOpen={blocked}
        title={license.error ? "License unavailable" : PRO_UPGRADE_HEADLINE}
        confirmLabel={license.error ? "Retry" : "Upgrade to Pro"}
        confirmVariant="primary"
        cancelLabel="Maybe later"
        cancelVariant="neutral"
        onConfirm={() => {
          setBlocked(false);
          if (license.error) void refreshLicense();
          else openProUpgrade();
        }}
        onCancel={() => setBlocked(false)}
      >
        {license.error ?? PRO_UPGRADE_BODY}
      </ActionModal>
    </LicenseContext.Provider>
  );
}
