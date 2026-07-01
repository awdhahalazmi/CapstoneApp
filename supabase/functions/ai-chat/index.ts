import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── OpenRouter chat completion ────────────────────────────────────────────────

interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OAIToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

async function chatCompletion(
  messages: OAIMessage[],
  tools: OAIToolDef[],
): Promise<OAIMessage> {
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
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? "auto" : undefined,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json.choices[0].message as OAIMessage;
}

// ── Supabase tools ────────────────────────────────────────────────────────────

const TOOL_DEFS: OAIToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_user_groups",
      description: "Returns the signed-in user's groups and their members.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_friends",
      description: "Returns the user's accepted friends and their interests — useful for group planning.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_places",
      description:
        "Fetches real Kuwait places from the Beyond Kw database. Filter by category (e.g. 'Café', 'Restaurant', 'Outdoor', 'Mall') or tag (e.g. 'beach', 'coffee', 'family').",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Place category to filter by" },
          tag: { type: "string", description: "Tag to filter by" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_group_activity",
      description: "Returns a summary of the user's recent group activity — useful for notifications or recaps.",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function runTool(
  name: string,
  args: Record<string, string>,
  sb: ReturnType<typeof createClient>,
): Promise<string> {
  if (name === "get_user_groups") {
    const { data: memberRows } = await sb.from("group_members").select("group_id");
    const ids = (memberRows ?? []).map((r: { group_id: string }) => r.group_id);
    if (!ids.length) return "The user is not in any groups yet.";

    const { data: groups } = await sb
      .from("groups")
      .select("id, name, emoji, is_public")
      .in("id", ids);

    if (!groups || groups.length === 0) return "The user is not in any groups yet.";

    const { data: members } = await sb
      .from("group_members")
      .select("group_id, profile:profiles!group_members_member_id_fkey(name, username)")
      .in("group_id", ids);

    const byGroup: Record<string, string[]> = {};
    for (const m of members ?? []) {
      const p = (m.profile as { name?: string; username?: string } | null);
      if (!p) continue;
      (byGroup[m.group_id] ??= []).push(p.name || p.username || "Unknown");
    }

    return (groups as { id: string; name: string; emoji: string; is_public: boolean }[])
      .map((g) => `${g.emoji} ${g.name} (${g.is_public ? "public" : "private"}) — members: ${(byGroup[g.id] ?? []).join(", ") || "none yet"}`)
      .join("\n");
  }

  if (name === "get_user_friends") {
    const { data } = await sb
      .from("friendships")
      .select("friend:profiles!friendships_friend_id_fkey(name, username, interests)")
      .eq("status", "accepted");

    const friends = ((data ?? []) as { friend: unknown }[])
      .map((r) => r.friend as { name?: string; username?: string; interests?: string[] } | null)
      .filter((f): f is { name?: string; username?: string; interests?: string[] } => !!f);

    if (friends.length === 0) return "The user has no friends yet.";
    return friends
      .map((f) => `${f.name || f.username}${f.interests?.length ? ` (interests: ${f.interests.join(", ")})` : ""}`)
      .join("\n");
  }

  if (name === "get_places") {
    const { category, tag } = args;
    let q = sb.from("places").select("name, category, area, price_level, rating, tags, ai_reason").limit(30);
    if (category) q = q.ilike("category", `%${category}%`);
    if (tag) q = q.contains("tags", [tag.toLowerCase()]);

    const { data } = await q;
    if (!data || data.length === 0) return "No matching places found.";
    return (data as { name: string; category: string; area: string; price_level: number; rating: number; tags: string[]; ai_reason: string }[])
      .map((p) => `• ${p.name} — ${p.category}, ${p.area} | Rating: ${p.rating}/5 | Price: ${"$".repeat(p.price_level || 1)} | Tags: ${(p.tags ?? []).join(", ")}\n  Why: ${p.ai_reason}`)
      .join("\n");
  }

  if (name === "get_group_activity") {
    const { data: memberRows } = await sb.from("group_members").select("group_id");
    const ids = (memberRows ?? []).map((r: { group_id: string }) => r.group_id);
    if (!ids.length) return "No group activity yet.";

    const { data: groups } = await sb
      .from("groups")
      .select("name, emoji, created_at")
      .in("id", ids)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!groups || groups.length === 0) return "No recent group activity.";
    return (groups as { name: string; emoji: string }[])
      .map((g) => `${g.emoji} ${g.name} — joined/created recently`)
      .join("\n");
  }

  return "Unknown tool.";
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (!OPENROUTER_KEY) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY is not set" }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const jwt = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { messages = [], group = null, interests = [] } = await req.json();

    // Build system prompt
    let system =
      "You are the Beyond Kw assistant — a friendly local guide for KUWAIT ONLY. " +
      "You help young adults in Kuwait plan outings and discover places. " +
      "RULES: (1) Only recommend real places in Kuwait. " +
      "(2) Always name specific places with their area. " +
      "(3) Give 3–5 concrete options with a one-line reason and rough KWD budget. " +
      "(4) For outing requests give a short timeline: time → place → activity. " +
      "(5) Use your tools to fetch real data about the user's groups, friends, and places — don't make things up. " +
      "(6) For group planning, use get_user_groups and get_user_friends to personalise suggestions.";

    if (group) {
      const memberNames = ((group as { members?: { name?: string }[] }).members ?? []).map((m) => m.name).join(", ");
      system += ` The user is planning for the group "${(group as { name: string }).name}"${memberNames ? ` with: ${memberNames}` : ""}.`;
    }
    if ((interests as string[]).length) {
      system += ` The user's interests: ${(interests as string[]).join(", ")}.`;
    }

    const oaiMessages: OAIMessage[] = [
      { role: "system", content: system },
      ...(messages as { role: string; content: string }[]).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // Agentic loop
    let response = await chatCompletion(oaiMessages, TOOL_DEFS);
    let iterations = 0;

    while (response.tool_calls && response.tool_calls.length > 0 && iterations < 5) {
      iterations++;
      oaiMessages.push(response);

      for (const tc of response.tool_calls) {
        let args: Record<string, string> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { /* empty args */ }

        const result = await runTool(tc.function.name, args, sb);
        oaiMessages.push({
          role: "tool",
          content: result,
          tool_call_id: tc.id,
          name: tc.function.name,
        });
      }

      response = await chatCompletion(oaiMessages, TOOL_DEFS);
    }

    return new Response(JSON.stringify({ reply: response.content }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
