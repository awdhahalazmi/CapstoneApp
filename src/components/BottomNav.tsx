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

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <nav
      className="shrink-0 backdrop-blur-xl"
      style={{
        background: "rgba(242,242,247,0.85)",
        borderTop: "0.5px solid rgba(0,0,0,0.15)",
      }}
    >
      <ul className="flex items-stretch justify-around px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className="flex flex-col items-center gap-0.5"
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={`h-6 w-6 transition-colors ${
                    active ? "text-primary" : "text-on-surface-variant"
                  }`}
                />
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    active ? "text-primary" : "text-on-surface-variant"
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
