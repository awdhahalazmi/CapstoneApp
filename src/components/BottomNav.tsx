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

  return (
    <nav className="shrink-0 border-t border-outline-variant/40 bg-card/80 backdrop-blur-md">
      <ul className="flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-2.5 transition-colors ${
                  active ? "text-primary" : "text-outline"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 2} />
                <span className="text-[11px] font-semibold">{label}</span>
                <span
                  className={`h-1 w-1 rounded-full ${active ? "bg-primary" : "bg-transparent"}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
