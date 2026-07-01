import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PollRow = {
  id: string;
  question: string;
  options: string[];
  vote_counts: Record<string, number>;
  created_at: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (!OPENROUTER_KEY) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY is not set" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const jwt = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { groupId } = await req.json();
    if (!groupId) {
      return new Response(JSON.stringify({ error: "Missing groupId" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: group } = await sb
      .from("groups")
      .select("id, name, emoji, owner_id")
      .eq("id", groupId)
      .maybeSingle();

    if (!group) {
      return new Response(JSON.stringify({ error: "Group not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if ((group as { owner_id: string }).owner_id !== user.id) {
      return new Response(JSON.stringify({ error: "Only the group owner can run AI Plan Event" }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const [{ data: pollRows }, { data: memberRows }, { data: pastEvents }] = await Promise.all([
      sb.from("whatsapp_polls")
        .select("id, question, options, vote_counts, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(15),
      sb.from("group_members")
        .select("profile:profiles!group_members_member_id_fkey(interests)")
        .eq("group_id", groupId),
      sb.from("events")
        .select("title, place_name")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const polls = (pollRows ?? []) as PollRow[];
    const interests = Array.from(new Set(
      (memberRows ?? [])
        .map((r) => ((r.profile as unknown as { interests?: string[] } | null)?.interests ?? []))
        .flat(),
    ));
    const previousPlaces = (pastEvents ?? [])
      .map((e) => (e as { place_name?: string; title: string }).place_name || (e as { title: string }).title)
      .filter(Boolean);

    const g = group as { name: string; emoji: string };

    if (polls.length === 0 && interests.length === 0 && previousPlaces.length === 0) {
      return new Response(JSON.stringify({
        groupInterests: [],
        suggestedPlaces: [],
        pollAnalysis: [],
        recommendedEvent: {
          title: "",
          place: null,
          date: null,
          time: null,
          description: "No polls, interests, or event history yet for this group.",
          pollSummary: "Nothing to analyze yet — run a poll in the group first.",
        },
      }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    const pollsText = polls.length
      ? polls.map((p) => {
          const total = Object.values(p.vote_counts ?? {}).reduce((a, b) => a + b, 0);
          const opts = p.options
            .map((o, i) => `${o}: ${p.vote_counts?.[String(i)] ?? 0} vote(s)`)
            .join(", ");
          return `Poll ${p.id} (${new Date(p.created_at).toLocaleDateString()}) — "${p.question}" — options: ${opts} — total votes: ${total}`;
        }).join("\n")
      : "No polls yet for this group.";

    const prompt =
      `You are analyzing WhatsApp group "${g.name}" ${g.emoji} for the Beyond Kw app, Kuwait ONLY. ` +
      `Analyze ONLY the data below for THIS group — never invent data or reference other groups.\n\n` +
      `Recent polls:\n${pollsText}\n\n` +
      `Aggregated member interests: ${interests.join(", ") || "none recorded"}\n` +
      `Previously chosen places/events: ${previousPlaces.join(", ") || "none yet"}\n\n` +
      `Respond with ONLY valid JSON matching this exact schema (no markdown, no explanation):\n` +
      `{\n` +
      `  "groupInterests": ["tag1", "tag2"],\n` +
      `  "suggestedPlaces": [{"name": "...", "reason": "..."}],\n` +
      `  "pollAnalysis": [{"pollId": "...", "question": "...", "winningOption": "..." | null, "winningVotes": 0, "totalVotes": 0, "voteSummary": "..."}],\n` +
      `  "recommendedEvent": {"title": "...", "place": "..." | null, "date": "YYYY-MM-DD" | null, "time": "HH:mm" | null, "description": "...", "pollSummary": "..."}\n` +
      `}\n\n` +
      `Tasks:\n` +
      `1. groupInterests: short tags for this group's interests (max 10).\n` +
      `2. pollAnalysis: one entry per poll — winningOption is the option with most votes (null if tied/no votes), voteSummary like "Cafe X 5 · Cafe Y 2".\n` +
      `3. suggestedPlaces: 3-5 real Kuwait places matching this group's pattern (max 5).\n` +
      `4. recommendedEvent: ONE concrete event with best-effort date/time from polls (null if unclear).`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "HTTP-Referer": "https://beyond-kw.app",
        "X-Title": "Beyond Kw",
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b-it:free",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenRouter error ${res.status}: ${text}`);
    }

    const completion = await res.json();
    const raw = completion.choices[0].message.content as string;
    const result = JSON.parse(raw);

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
