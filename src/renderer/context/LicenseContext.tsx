import { createContext, useCallback, useContext, useState } from "react";
import type { LicenseStatus } from "@shared/types";

interface LicenseContextValue {
  license: LicenseStatus;
  refreshLicense: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function useLicense(): LicenseStatus {
  const ctx = useContext(LicenseContext);
  return ctx?.license ?? { active: false };
}

export function useRefreshLicense(): () => Promise<void> {
  const ctx = useContext(LicenseContext);
  return ctx?.refreshLicense ?? (async () => {});
}

export function LicenseProvider({
  initialLicense,
  children,
}: {
  initialLicense: LicenseStatus;
  children: React.ReactNode;
}): JSX.Element {
  const [license, setLicense] = useState<LicenseStatus>(initialLicense);

  const refreshLicense = useCallback(async () => {
    const status = await window.api.getLicenseStatus();
    setLicense(status);
  }, []);

  return (
    <LicenseContext.Provider value={{ license, refreshLicense }}>
      {children}
    </LicenseContext.Provider>
  );
}
