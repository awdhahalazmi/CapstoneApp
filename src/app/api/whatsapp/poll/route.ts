import { NextRequest, NextResponse } from "next/server";
import { waManager } from "@/lib/whatsapp/manager";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { userId, waJid, question, options, announcementText } =
    await req.json();

  if (!userId || !waJid || !question || !options?.length) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (waManager.getStatus(userId) !== "connected") {
    return NextResponse.json({ error: "WhatsApp not connected" }, { status: 400 });
  }

  if (announcementText) {
    await waManager.sendText(userId, waJid, announcementText);
  }

  // sendPoll registers the poll (encKey + creator identity) internally, keyed by groupId === waJid.
  const { messageId, encKeyBase64 } = await waManager.sendPoll(userId, waJid, question, options);
  if (!messageId) {
    return NextResponse.json({ error: "Failed to send poll" }, { status: 500 });
  }

  return NextResponse.json({ messageId, encKeyBase64 });
}
