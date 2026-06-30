import { NextRequest, NextResponse } from "next/server";
import { waManager } from "@/lib/whatsapp/manager";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  await waManager.disconnect(userId);
  return NextResponse.json({ ok: true });
}
