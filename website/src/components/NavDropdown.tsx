"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { NavLinkItem } from "@/utils/nav";

interface NavDropdownProps {
  label: string;
  href?: string;
  links: NavLinkItem[];
}

export function NavDropdown({ label, href, links }: NavDropdownProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        detailsRef.current?.open &&
        !detailsRef.current.contains(event.target as Node)
      ) {
        detailsRef.current.removeAttribute("open");
      }
    }

    function handleToggle(event: Event) {
      const target = event.target as HTMLDetailsElement;
      if (target.open) {
        const allDetails = document.querySelectorAll("details.dropdown");
        allDetails.forEach((el) => {
          if (el !== target && el instanceof HTMLDetailsElement && el.open) {
            el.removeAttribute("open");
          }
        });
      }
    }

    const current = detailsRef.current;
    document.addEventListener("click", handleClickOutside);
    current?.addEventListener("toggle", handleToggle);

    return () => {
      document.removeEventListener("click", handleClickOutside);
      current?.removeEventListener("toggle", handleToggle);
    };
  }, []);

  const closeDropdown = () => {
    if (detailsRef.current?.open) {
      detailsRef.current.removeAttribute("open");
    }
  };

  return (
    <details ref={detailsRef} className="dropdown dropdown-end">
      <summary className="btn btn-ghost btn-sm list-none">{label}</summary>
      <div className="dropdown-content z-10 w-52 pt-2">
        <ul className="menu rounded-box max-h-80 w-full overflow-y-auto bg-base-200 p-2 shadow-lg backdrop-blur">
          {href ? (
            <li>
              <Link href={href} onClick={closeDropdown}>
                {label} overview
              </Link>
            </li>
          ) : null}
          {links.map((item) => (
            <li key={item.href}>
              <Link href={item.href} onClick={closeDropdown}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
