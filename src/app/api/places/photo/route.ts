import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name") ?? "";
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key || name.length < 2) return NextResponse.json({ url: null });

  try {
    const findRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(name)}&inputtype=textquery&fields=photos&locationbias=circle:60000@29.3759,47.9774&key=${key}`
    );
    const findData = await findRes.json();
    const photoRef = findData.candidates?.[0]?.photos?.[0]?.photo_reference;
    if (!photoRef) return NextResponse.json({ url: null });

    const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${key}`;
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ url: null });
  }
}
