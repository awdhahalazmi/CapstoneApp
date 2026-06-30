import { NextRequest, NextResponse } from "next/server";
import { waManager } from "@/lib/whatsapp/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  return NextResponse.json({ status: waManager.getStatus(userId) });
}
