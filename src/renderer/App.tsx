import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { LicenseStatus } from "@shared/types";
import type { UpdateInfo } from "@shared/ipc";
import AppShell from "./components/AppShell";
import UpdateBanner from "./components/UpdateBanner";
import { LicenseProvider } from "./context/LicenseContext";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Mail from "./pages/Mail";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import Data from "./pages/Data";
import Cases from "./pages/Cases";
import CaseDetail from "./pages/CaseDetail";
import Profile from "./pages/Profile";
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
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [paperweightEgg, setPaperweightEgg] = useState(false);

  useEffect(() => {
    let buffer = "";
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key.length !== 1) return;
      buffer = (buffer + e.key.toLowerCase()).slice(-11);
      if (buffer === "paperweight") {
        buffer = "";
        setPaperweightEgg(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!paperweightEgg) return;
    const t = setTimeout(() => setPaperweightEgg(false), 1600);
    return () => clearTimeout(t);
  }, [paperweightEgg]);

  useEffect(() => {
    window.api
      .getLastUpdateInfo()
      .then((info) => {
        if (info) setUpdateInfo(info);
      })
      .catch(() => {
        // no-op; this is best-effort hydration for missed early events
      });

    return window.api.onUpdateDownloaded((info) => setUpdateInfo(info));
  }, []);

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
      <div
        className={
          paperweightEgg ? "animate-[shake_0.5s_ease-in-out_2]" : undefined
        }
      >
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[min(720px,calc(100vw-2rem))]">
          <UpdateBanner
            info={updateInfo}
            onDismiss={() => setUpdateInfo(null)}
          />
        </div>
        {paperweightEgg && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70]">
            <div role="alert" className="alert alert-info shadow-lg">
              <span>Immovable. Like a paperweight.</span>
            </div>
          </div>
        )}
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
            <Route path="data" element={<Data />} />
            <Route path="cases" element={<Cases />} />
            <Route path="cases/:caseId" element={<CaseDetail />} />
            <Route path="profile" element={<Profile />} />
            <Route path="settings" element={<Settings />} />
            <Route path="support" element={<Support />} />
            <Route path="activity" element={<Activity />} />
          </Route>
        </Routes>
      </div>
    </HashRouter>
  );
}
