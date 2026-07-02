import { NextRequest, NextResponse } from "next/server";
import { waManager } from "@/lib/whatsapp/manager";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/whatsapp/qr-image?userId=… — returns current QR or status (polling-friendly, no SSE) */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  // Kick off session start if not already running
  const status = waManager.getStatus(userId);
  if (status === "idle" || status === "disconnected") {
    waManager.startSession(userId).catch(console.error);
  }

  const currentStatus = waManager.getStatus(userId);
  if (currentStatus === "connected") {
    return NextResponse.json({ type: "connected" });
  }

  const raw = waManager.getCurrentQR(userId);
  if (!raw) {
    return NextResponse.json({ type: currentStatus }); // "connecting" | "qr" | etc.
  }

  const image = await QRCode.toDataURL(raw, { width: 280, margin: 2 });
  return NextResponse.json({ type: "qr", image });
}
