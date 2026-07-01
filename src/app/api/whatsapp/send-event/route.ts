import { NextRequest, NextResponse } from "next/server";
import { waManager } from "@/lib/whatsapp/manager";

export const runtime = "nodejs";

function mapsLink(placeName?: string | null, lat?: number | null, lng?: number | null) {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  if (placeName) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName)}`;
  }
  return null;
}

/** POST /api/whatsapp/send-event — announce a created event to its WA group */
export async function POST(req: NextRequest) {
  const { userId, waJid, title, placeName, placeLat, placeLng, eventDate, eventTime, description, pollSummary } =
    await req.json();

  if (!userId || !waJid || !title) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (waManager.getStatus(userId) !== "connected") {
    return NextResponse.json({ error: "WhatsApp not connected" }, { status: 400 });
  }

  const link = mapsLink(placeName, placeLat, placeLng);
  const lines = [
    `📅 ${title}`,
    placeName ? `📍 ${placeName}` : null,
    link ? `🗺️ ${link}` : null,
    eventDate || eventTime ? `🗓️ ${[eventDate, eventTime].filter(Boolean).join(" at ")}` : null,
    description ? `\n${description}` : null,
    pollSummary ? `\n🏆 ${pollSummary}` : null,
  ].filter((l) => l !== null);

  const message = lines.join("\n");

  try {
    await waManager.sendText(userId, waJid, message);
    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("[WA] send-event error:", err);
    return NextResponse.json({ error: "Failed to send event" }, { status: 500 });
  }
}
