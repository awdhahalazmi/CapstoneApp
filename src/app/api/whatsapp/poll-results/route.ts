import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Poll votes are now embedded directly in WAInMemoryMessage.pollVotes
// and returned via /api/whatsapp/messages — this endpoint is no longer needed.
export async function GET() {
  return NextResponse.json({ votes: {} });
}
