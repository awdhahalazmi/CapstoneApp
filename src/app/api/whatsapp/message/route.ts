import { NextRequest, NextResponse } from "next/server";
import { waManager } from "@/lib/whatsapp/manager";

export const runtime = "nodejs";

/** POST /api/whatsapp/message — relay a chat message to a WA group */
export async function POST(req: NextRequest) {
  const { userId, waJid, content } = await req.json();
  if (!userId || !waJid || !content?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (waManager.getStatus(userId) !== "connected") {
    return NextResponse.json({ sent: false, reason: "not_connected" });
  }
  try {
    await waManager.sendText(userId, waJid, content.trim());
    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("[WA] relay error:", err);
    return NextResponse.json({ sent: false, reason: "error" });
  }
}
