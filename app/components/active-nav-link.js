"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function ActiveNavLink({ href, children }) {
  const pathname = usePathname();

  return (
    <Link className={isActive(pathname, href) ? "active" : ""} href={href}>
      {children}
    </Link>
  );
}
