"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  CommunityIcon,
  AiIcon,
  GroupsIcon,
  ProfileIcon,
} from "./icons";

const tabs = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/community", label: "Community", Icon: CommunityIcon },
  { href: "/ai", label: "AI", Icon: AiIcon },
  { href: "/groups", label: "Groups", Icon: GroupsIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
];

export default function SideNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-outline-variant/30 bg-surface/95 backdrop-blur-md">
      {/* Brand */}
      <div className="px-6 py-6">
        <span className="text-xl font-bold text-primary">Beyond Kw</span>
        <p className="text-[12px] text-on-surface-variant mt-0.5">Plan outings with friends</p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {tabs.map(({ href, label, Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary-fixed text-on-primary-fixed-variant"
                      : "text-on-surface-variant hover:bg-surface-low hover:text-on-surface"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 text-[11px] text-on-surface-variant/60">
        © 2025 Beyond Kw
      </div>
    </aside>
  );
}
