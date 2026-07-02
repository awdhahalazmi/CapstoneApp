const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const KUWAIT_LAT = 29.3759;
const KUWAIT_LNG = 47.9774;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_PLACES_API_KEY secret not set" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const { query, maxResults = 5 } = await req.json();
    if (!query) {
      return new Response(
        JSON.stringify({ error: "query is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.rating",
          "places.userRatingCount",
          "places.priceLevel",
          "places.types",
          "places.currentOpeningHours",
          "places.photos",
        ].join(","),
      },
      body: JSON.stringify({
        textQuery: `${query} in Kuwait`,
        languageCode: "en",
        locationBias: {
          circle: {
            center: { latitude: KUWAIT_LAT, longitude: KUWAIT_LNG },
            radius: 50000.0,
          },
        },
        maxResultCount: Math.min(maxResults, 10),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[google-places] API error:", res.status, err);
      return new Response(
        JSON.stringify({ error: `Google Places error ${res.status}` }),
        { status: res.status, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();

    // deno-lint-ignore no-explicit-any
    const places = (data.places ?? []).map((p: any) => {
      // New Places API photo name format: "places/{placeId}/photos/{photoRef}"
      // The last segment is the photo_reference compatible with the Maps photo URL.
      const photoName: string | null = p.photos?.[0]?.name ?? null;
      const photoRef = photoName ? photoName.split("/").pop() : null;
      const photoUrl = photoRef
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${apiKey}`
        : null;

      return {
        id: p.id ?? "",
        name: p.displayName?.text ?? "",
        address: p.formattedAddress ?? "",
        rating: p.rating ?? null,
        reviewCount: p.userRatingCount ?? 0,
        price: PRICE_MAP[p.priceLevel as string] ?? null,
        types: (p.types ?? []).slice(0, 3),
        openNow: p.currentOpeningHours?.openNow ?? null,
        photoUrl,
      };
    });

    return new Response(
      JSON.stringify({ places }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[google-places] error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
