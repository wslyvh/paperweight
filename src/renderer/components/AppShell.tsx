import { APP_CONFIG } from "@shared/config";
import { Outlet, NavLink } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import makeBlockie from "ethereum-blockies-base64";
import SyncStatusBar from "./SyncStatusBar";
import { Check, Contact, Inbox, Mail, Settings } from "lucide-react";
import { useAccounts } from "../hooks/useAccounts";

const navItems = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: <Inbox className="w-5 h-5" aria-hidden="true" />,
  },
  {
    to: "/mail",
    label: "Mailing lists",
    icon: <Mail className="w-5 h-5" aria-hidden="true" />,
  },
  {
    to: "/accounts",
    label: "Accounts",
    icon: <Contact className="w-5 h-5" aria-hidden="true" />,
  },
];

export default function AppShell(): JSX.Element {
  const { accounts } = useAccounts();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeAccount = accounts.find((a) => a.isActive);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const handleSwitch = async (email: string) => {
    setDropdownOpen(false);
    if (activeAccount && email !== activeAccount.email) {
      await window.api.switchAccount(email);
      // App.tsx onAccountSwitched handler navigates to /dashboard and remounts the route tree
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-18 xl:w-60 transition-all duration-200 bg-base-200 border-r border-base-300 flex flex-col shrink-0">
        {/* Branding */}
        <div className="h-14 flex items-center justify-center xl:justify-start xl:px-4 border-b border-base-300">
          <NavLink to="/dashboard" className="text-lg font-bold">
            <span className="xl:hidden">🗿</span>
            <span className=" hidden xl:inline">{APP_CONFIG.NAME} 🗿</span>
          </NavLink>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 p-2 mt-2 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 transition-colors justify-center xl:justify-start tooltip tooltip-right xl:before:hidden xl:after:hidden ${isActive
                  ? "bg-neutral text-neutral-content"
                  : "hover:bg-base-300"
                }`
              }
              data-tip={item.label}
            >
              {item.icon}
              <span className="hidden xl:inline text-sm font-medium">
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Active account switcher */}
        {activeAccount && (
          <div ref={dropdownRef} className="relative p-2">
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-base-300 transition-colors justify-center xl:justify-start"
            >
              <img src={makeBlockie(activeAccount.email)} alt="" className="w-5 h-5 rounded-sm shrink-0" />
              <span className="hidden xl:inline text-sm truncate text-base-content/70">{activeAccount.email}</span>
            </button>

            {dropdownOpen && (
              <div className="absolute bottom-0 left-full ml-2 w-64 bg-base-200 border border-base-300 rounded-lg shadow-lg overflow-hidden z-50">
                {accounts.map((acc) => (
                  <button
                    key={acc.email}
                    onClick={() => handleSwitch(acc.email)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-base-300 transition-colors text-left"
                  >
                    <img src={makeBlockie(acc.email)} alt="" className="w-7 h-7 rounded-md shrink-0" />
                    <span className="text-sm truncate flex-1">{acc.email}</span>
                    {acc.isActive && <Check className="w-4 h-4 shrink-0 text-success" />}
                  </button>
                ))}
                <div className="border-t border-base-300">
                  <NavLink
                    to="/settings"
                    onClick={() => setDropdownOpen(false)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-base-300 transition-colors text-sm text-base-content/60"
                  >
                    Manage accounts
                    <span aria-hidden="true">›</span>
                  </NavLink>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings at bottom */}
        <nav className="flex flex-col gap-1 p-2 border-t border-base-300">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 transition-colors justify-center xl:justify-start tooltip tooltip-right xl:before:hidden xl:after:hidden ${isActive ? "bg-neutral text-neutral-content" : "hover:bg-base-300"
              }`
            }
            data-tip="Settings"
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
            <span className="hidden xl:inline text-sm font-medium">Settings</span>
          </NavLink>
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col min-w-0">
        <SyncStatusBar />
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
