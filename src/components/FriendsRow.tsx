"use client";

import { useEffect, useRef } from "react";
import Avatar from "./Avatar";
import { friends } from "@/lib/mock-data";

/*
  Horizontally scrollable "Friends Online" row.
  Touch-swipe works natively on mobile; the wheel handler translates a vertical
  mouse wheel into horizontal scroll so it's also scrollable on desktop, where
  the scrollbar is hidden for a cleaner look.
*/

export default function FriendsRow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      if (!el || el.scrollWidth <= el.clientWidth) return;
      // Only hijack a predominantly-vertical wheel gesture.
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={ref}
      className="no-scrollbar -mx-5 mt-4 flex gap-4 overflow-x-auto px-5 pb-1"
    >
      {friends.map((f, i) => (
        <button
          key={f.id}
          className="flex w-16 shrink-0 flex-col items-center gap-1.5"
        >
          <Avatar
            initials={f.initials}
            gradient={f.gradient}
            size="lg"
            online={f.online}
            ring={i === 0}
          />
          <span className="truncate text-[13px] font-semibold">{f.name}</span>
        </button>
      ))}
    </div>
  );
}
