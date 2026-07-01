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

  // Send a photo for each place option before the poll so members can see the venues
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (googleKey) {
    for (const opt of options as string[]) {
      const photoUrl = await fetchPlacePhotoUrl(opt, googleKey);
      if (photoUrl) {
        await waManager.sendImageUrl(userId, waJid, photoUrl, opt);
      }
    }
  }

  // sendPoll registers the poll (encKey + creator identity) internally, keyed by groupId === waJid.
  const { messageId, encKeyBase64 } = await waManager.sendPoll(userId, waJid, question, options);
  if (!messageId) {
    return NextResponse.json({ error: "Failed to send poll" }, { status: 500 });
  }

  return NextResponse.json({ messageId, encKeyBase64 });
}
