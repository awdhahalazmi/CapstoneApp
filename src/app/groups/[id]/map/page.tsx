"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon } from "@/components/icons";
import { useGroups } from "@/lib/groups-store";

// Redirect users to the new plan page which has the full map experience
import { useRouter } from "next/navigation";

export default function GroupMapRedirect() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/groups/${params.id}/plan`);
  }, [params.id, router]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-on-surface-variant">Redirecting…</p>
    </div>
  );
}
