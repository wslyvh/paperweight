import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import AppShell from "./components/AppShell";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Mail from "./pages/Mail";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import Settings from "./pages/Settings";
import Support from "./pages/Support";
import Activity from "./pages/Activity";

function AuthGate({ children }: { children: React.ReactNode }): JSX.Element {
  const [connected, setConnected] = useState<boolean>();

  useEffect(() => {
    window.api.getConnectionStatus().then(setConnected);
  }, []);

  if (connected === undefined) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!connected) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
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
