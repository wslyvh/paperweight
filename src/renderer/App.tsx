import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { LicenseStatus } from "@shared/types";
import AppShell from "./components/AppShell";
import { LicenseProvider } from "./context/LicenseContext";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Mail from "./pages/Mail";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import Settings from "./pages/Settings";
import Support from "./pages/Support";
import Activity from "./pages/Activity";

function AuthGate({ children }: { children: React.ReactNode }): JSX.Element {
  const [state, setState] = useState<{
    connected?: boolean;
    license?: LicenseStatus;
  }>({});

  useEffect(() => {
    Promise.all([
      window.api.getConnectionStatus(),
      window.api.getLicenseStatus(),
    ]).then(([connected, license]) => setState({ connected, license }));
  }, []);

  if (state.connected === undefined) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!state.connected) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <LicenseProvider initialLicense={state.license ?? { active: false }}>
      {children}
    </LicenseProvider>
  );
}

export default function App(): JSX.Element {
  const [accountKey, setAccountKey] = useState(0);

  useEffect(() => {
    return window.api.onAccountSwitched(() => {
      window.location.reload();
    });
  }, []);

  useEffect(() => {
    return window.api.onNoAccountsRemaining(() => {
      window.location.hash = "#/onboarding";
      setAccountKey((k) => k + 1);
    });
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          key={accountKey}
          path="/"
          element={
            <AuthGate>
              <AppShell />
            </AuthGate>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="mail" element={<Mail />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="accounts/:groupKey" element={<AccountDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="support" element={<Support />} />
          <Route path="activity" element={<Activity />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
