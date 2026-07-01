import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function makeSupabase(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

type PollRow = {
  id: string;
  question: string;
  options: string[];
  vote_counts: Record<string, number>;
  created_at: string;
};

export async function POST(req: NextRequest) {
  const jwt = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!jwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = await req.json();
  if (!groupId) {
    return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
  }

  const sb = makeSupabase(jwt);

  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: group } = await sb
    .from("groups")
    .select("id, name, emoji, owner_id")
    .eq("id", groupId)
    .maybeSingle();

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  if (group.owner_id !== user.id) {
    return NextResponse.json({ error: "Only the group owner can run AI Plan Event" }, { status: 403 });
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
      .map((r) => (r.profile as unknown as { interests?: string[] } | null)?.interests ?? [])
      .flat(),
  ));
  const previousPlaces = (pastEvents ?? [])
    .map((e) => (e as { place_name?: string; title: string }).place_name || e.title)
    .filter(Boolean);

  if (polls.length === 0 && interests.length === 0 && previousPlaces.length === 0) {
    return NextResponse.json({
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
    });
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

  const userMessage =
    `IMPORTANT: Do NOT call any tools. All data is provided below — use only what is given.\n\n` +
    `Analyze WhatsApp group "${group.name}" ${group.emoji} (Kuwait only).\n\n` +
    `Recent polls:\n${pollsText}\n\n` +
    `Member interests: ${interests.join(", ") || "none recorded"}\n` +
    `Previous places/events: ${previousPlaces.join(", ") || "none yet"}\n\n` +
    `Reply with ONLY a raw JSON object (no markdown, no explanation, no tool calls) matching exactly:\n` +
    `{"groupInterests":["tag"],"suggestedPlaces":[{"name":"...","reason":"..."}],"pollAnalysis":[{"pollId":"...","question":"...","winningOption":"...or null","winningVotes":0,"totalVotes":0,"voteSummary":"..."}],"recommendedEvent":{"title":"...","place":"...or null","date":"YYYY-MM-DD or null","time":"HH:mm or null","description":"...","pollSummary":"..."}}`;

  // Call the deployed ai-chat edge function — it already has OPENROUTER_API_KEY
  const edgeRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!edgeRes.ok) {
    const err = await edgeRes.json().catch(() => ({}));
    return NextResponse.json({ error: (err as { error?: string }).error ?? "AI request failed" }, { status: 500 });
  }

  const { reply } = await edgeRes.json() as { reply: string };

  // Strip markdown fences if the model wrapped the JSON
  const cleaned = reply.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    const result = JSON.parse(cleaned);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid JSON from AI", raw: reply }, { status: 500 });
  }
}
