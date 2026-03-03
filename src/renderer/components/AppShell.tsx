import { APP_CONFIG } from "@shared/config";
import { Outlet, NavLink } from "react-router-dom";
import SyncStatusBar from "./SyncStatusBar";
import { Contact, Inbox, Mail, Settings } from "lucide-react";

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

const bottomItems = [
  {
    to: "/settings",
    label: "Settings",
    icon: <Settings className="w-5 h-5" aria-hidden="true" />,
  },
];

export default function AppShell(): JSX.Element {
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
                `flex items-center gap-3 rounded-lg px-3 py-2 transition-colors justify-center xl:justify-start tooltip tooltip-right xl:before:hidden xl:after:hidden ${
                  isActive
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

        {/* Activity + Settings at bottom */}
        <nav className="flex flex-col gap-1 p-2 border-t border-base-300">
          {bottomItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 transition-colors justify-center xl:justify-start tooltip tooltip-right xl:before:hidden xl:after:hidden ${
                  isActive
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
