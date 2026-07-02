import { NextRequest, NextResponse } from "next/server";
import { waManager } from "@/lib/whatsapp/manager";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const waJid = req.nextUrl.searchParams.get("waJid");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);

  if (!userId || !waJid) {
    return NextResponse.json({ error: "userId and waJid are required" }, { status: 400 });
  }

  const messages = waManager.getMessages(userId, waJid, limit);
  return NextResponse.json({ messages });
}
