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

/*
  Bottom navigation (DESIGN.md > Bottom Navigation):
  white bar with blur, 24px icons, active state in Primary Violet with a 4px dot.
*/

const tabs = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/community", label: "Community", Icon: CommunityIcon },
  { href: "/ai", label: "AI", Icon: AiIcon },
  { href: "/groups", label: "Groups", Icon: GroupsIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  // No app chrome on the login screen
  if (pathname === "/login") return null;

  return (
    <nav className="shrink-0 border-t border-outline-variant/30 bg-surface/90 backdrop-blur-md">
      <ul className="flex items-stretch justify-around px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className="flex flex-col items-center gap-1"
                aria-current={active ? "page" : undefined}
              >
                {/* MD3 active-indicator pill behind the icon */}
                <span
                  className={`flex h-8 w-16 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-primary-fixed" : "bg-transparent"
                  }`}
                >
                  <Icon
                    className={`h-6 w-6 ${
                      active ? "text-on-primary-fixed-variant" : "text-on-surface-variant"
                    }`}
                  />
                </span>
                <span
                  className={`text-[12px] ${
                    active
                      ? "font-semibold text-on-surface"
                      : "font-medium text-on-surface-variant"
                  }`}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
