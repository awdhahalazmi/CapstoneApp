import { NextRequest, NextResponse } from "next/server";
import { waManager } from "@/lib/whatsapp/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/whatsapp/poll-results?groupId=X
 *  Returns { votes: { [wa_message_id]: { "0": n, "1": n, … } } }
 */
export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("groupId");
  if (!groupId) {
    return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
  }
  const votes = waManager.getLiveVoteCounts(groupId);
  return NextResponse.json({ votes });
}
