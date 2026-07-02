import { NextRequest, NextResponse } from "next/server";
import { waManager } from "@/lib/whatsapp/manager";

export const runtime = "nodejs";

async function fetchPlacePhotoUrl(placeName: string, googleKey: string): Promise<string | null> {
  try {
    const findRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(placeName)}&inputtype=textquery&fields=photos&locationbias=circle:60000@29.3759,47.9774&key=${googleKey}`
    );
    const findData = await findRes.json();
    const photoRef = findData.candidates?.[0]?.photos?.[0]?.photo_reference;
    if (!photoRef) return null;
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${googleKey}`;
  } catch {
    return null;
  }
}

async function sendPlacePhotos(
  userId: string,
  waJid: string,
  options: string[],
  placePhotoUrls: (string | null)[] | null,
): Promise<void> {
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  for (let i = 0; i < options.length; i++) {
    try {
      const photoUrl = placePhotoUrls?.[i] ?? (googleKey ? await fetchPlacePhotoUrl(options[i], googleKey) : null);
      if (photoUrl) await waManager.sendImageUrl(userId, waJid, photoUrl, options[i]);
    } catch { /* skip — photos are best-effort */ }
  }
}

export async function POST(req: NextRequest) {
  const { userId, waJid, question, options, announcementText, placePhotoUrls } =
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

  // Send poll first — this is the critical action.
  const { messageId, encKeyBase64 } = await waManager.sendPoll(userId, waJid, question, options);
  if (!messageId) {
    return NextResponse.json({ error: "Failed to send poll" }, { status: 500 });
  }

  // Send place photos after the poll (best-effort, non-blocking on the response).
  void sendPlacePhotos(userId, waJid, options as string[], placePhotoUrls ?? null);

  return NextResponse.json({ messageId, encKeyBase64 });
}
