import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get("input") ?? "";
  if (input.length < 2) return NextResponse.json({ predictions: [] });

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Google Places API key not configured" }, { status: 500 });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input);
  url.searchParams.set("key", key);
  url.searchParams.set("types", "establishment");
  url.searchParams.set("components", "country:kw");
  url.searchParams.set("location", "29.3759,47.9774"); // Kuwait centre
  url.searchParams.set("radius", "60000");
  url.searchParams.set("language", "en");

  const res = await fetch(url.toString(), { next: { revalidate: 60 } });
  const data = await res.json();

  const predictions = (data.predictions ?? []).slice(0, 5).map(
    (p: { place_id: string; structured_formatting?: { main_text?: string; secondary_text?: string }; description?: string }) => ({
      placeId: p.place_id,
      mainText: p.structured_formatting?.main_text ?? p.description ?? "",
      secondaryText: p.structured_formatting?.secondary_text ?? "",
    })
  );

  return NextResponse.json({ predictions });
}
