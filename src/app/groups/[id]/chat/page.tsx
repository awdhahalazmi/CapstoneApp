"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, ChatIcon } from "@/components/icons";
import { useGroups } from "@/lib/groups-store";

const noopSubscribe = () => () => {};
function useIsHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export default function GroupChatPage() {
  const params = useParams<{ id: string }>();
  const { groups } = useGroups();
  const hydrated = useIsHydrated();
  const group = groups.find((g) => g.id === params.id);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-outline-variant/40 bg-surface/80 px-4 py-3.5 backdrop-blur-md">
        <Link
          href={`/groups/${params.id}`}
          aria-label="Back"
          className="grid h-10 w-10 place-items-center text-primary"
        >
          <ArrowLeftIcon />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold leading-tight">Group Chat</h1>
          <p className="truncate text-[12px] text-on-surface-variant">
            {hydrated && group ? group.name : "Decide together"}
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="fab h-14 w-14">
          <ChatIcon className="h-7 w-7" />
        </span>
        <p className="mt-4 font-semibold">Group chat is coming soon</p>
        <p className="mt-1 text-sm text-on-surface-variant">
          Real-time messages so your group can plan and agree on outings together — next on the
          roadmap.
        </p>
        <Link href={`/groups/${params.id}/map`} className="btn-secondary mt-5 h-11 px-5">
          Open the group map
        </Link>
      </div>
    </div>
  );
}
