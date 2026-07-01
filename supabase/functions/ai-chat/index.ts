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
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "HTTP-Referer": "https://beyond-kw.app",
        "X-Title": "Beyond Kw",
      },
      body: JSON.stringify({
        model: "mistralai/mistral-small-3.2-24b-instruct:free",
        messages,
        tools: tools.length ? tools : undefined,
        tool_choice: tools.length ? "auto" : undefined,
        max_tokens: 400,
      }),
    });

    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 4000));
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const isRate = res.status === 429 || text.includes("rate") || text.includes("429");
      if (isRate && attempt < 2) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 4000));
        continue;
      }
      throw new Error(`OpenRouter error ${res.status}: ${text}`);
    }

    const json = await res.json();
    if (!json.choices || json.choices.length === 0) {
      const errMsg = json.error?.message ?? JSON.stringify(json);
      const isRate = errMsg.includes("429") || errMsg.toLowerCase().includes("rate");
      if (isRate && attempt < 2) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 4000));
        continue;
      }
      throw new Error(`OpenRouter: ${errMsg}`);
    }
    return json.choices[0].message as OAIMessage;
  }
  throw new Error("AI service is busy — please try again in a moment.");
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
  {
    type: "function",
    function: {
      name: "create_event",
      description:
        "Creates a group event in Beyond Kw. Always call get_user_groups first to get the correct group ID. If the user hasn't specified a group, ask them which group this event is for BEFORE calling this tool.",
      parameters: {
        type: "object",
        required: ["groupId", "title"],
        properties: {
          groupId: { type: "string", description: "UUID of the group (from get_user_groups [id:...] field)" },
          title: { type: "string", description: "Event title" },
          description: { type: "string", description: "Optional event description" },
          placeName: { type: "string", description: "Venue or place name" },
          eventDate: { type: "string", description: "Date in YYYY-MM-DD format" },
          eventTime: { type: "string", description: "Time in HH:MM 24h format" },
        },
      },
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
      .map((g) => `${g.emoji} ${g.name} [id:${g.id}] (${g.is_public ? "public" : "private"}) — members: ${(byGroup[g.id] ?? []).join(", ") || "none yet"}`)
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

  if (name === "create_event") {
    const { groupId, title, description, placeName, eventDate, eventTime } = args as {
      groupId: string; title: string; description?: string;
      placeName?: string; eventDate?: string; eventTime?: string;
    };
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return "Error: Not authenticated.";
    const { data, error } = await sb.from("events").insert({
      group_id: groupId, title,
      description: description || null,
      place_name: placeName || null,
      event_date: eventDate || null,
      event_time: eventTime || null,
      created_by: user.id,
    }).select().single();
    if (error) return `Failed to create event: ${error.message}`;
    const ev = data as { title: string; event_date?: string; place_name?: string };
    return `Event created! "${ev.title}"${ev.place_name ? ` at ${ev.place_name}` : ""}${ev.event_date ? ` on ${ev.event_date}` : ""} has been added to the group.`;
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
    const today = new Date().toISOString().split("T")[0];
    let system =
      "You are the Beyond Kw assistant — a local guide for KUWAIT ONLY. " +
      "SCOPE: Only answer about places, outings, and events in Kuwait. " +
      "For anything else, say: 'I only help with places and outings in Kuwait 🇰🇼' " +
      "STYLE: Be very short and direct. No long explanations. No intro sentences. No filler. " +
      "When listing places, just show: name, area, one short reason. That's it. " +
      "Max 5 places. Never write more than 6 lines total for a place list. " +
      "RULES: " +
      "(1) Only real Kuwait places. Never mention places outside Kuwait. " +
      "(2) Use your tools to get real data — call get_places when asked about places. " +
      "(3) For group planning, call get_user_groups and get_user_friends. " +
      "(4) EVENT CREATION: If the user asks to create an event, ask which group (if not specified). " +
      "Call get_user_groups to get the group ID, then call create_event. " +
      `Today is ${today}. Convert day names like 'Sunday' to nearest upcoming YYYY-MM-DD. ` +
      "(5) FORMATTING: Plain text only. No markdown, no tables, no asterisks, no headings. " +
      "Use a simple numbered or dashed list for places. One emoji max per response.";

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
