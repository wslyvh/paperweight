import Link from "next/link";
import type { NavLinkItem } from "@/utils/nav";

interface NavDropdownProps {
  label: string;
  href: string;
  links: NavLinkItem[];
}

export function NavDropdown({ label, href, links }: NavDropdownProps) {
  return (
    <details className="dropdown dropdown-end">
      <summary className="btn btn-ghost btn-sm list-none">{label}</summary>
      <div className="dropdown-content z-10 w-52 pt-2">
        <ul className="menu rounded-box max-h-80 w-full overflow-y-auto bg-base-200 p-2 shadow-lg backdrop-blur">
          <li>
            <Link href={href}>{label} overview</Link>
          </li>
          {links.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
