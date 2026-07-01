import { NextRequest, NextResponse } from "next/server";
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function makeSupabase(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

// ── Tools ────────────────────────────────────────────────────────────────────

const getUserGroupsTool = (jwt: string) =>
  tool(
    async () => {
      const sb = makeSupabase(jwt);
      const { data: memberRows } = await sb
        .from("group_members")
        .select("group_id");
      const ids = (memberRows ?? []).map((r: { group_id: string }) => r.group_id);

      const { data: groups } = ids.length
        ? await sb
            .from("groups")
            .select("id, name, emoji, is_public")
            .in("id", ids)
        : { data: [] };

      if (!groups || groups.length === 0) return "The user is not in any groups yet.";

      const { data: members } = await sb
        .from("group_members")
        .select("group_id, profile:profiles!group_members_member_id_fkey(name, username)")
        .in("group_id", ids);

      const byGroup: Record<string, string[]> = {};
      for (const m of members ?? []) {
        const p = m.profile as { name?: string; username?: string } | null;
        if (!p) continue;
        (byGroup[m.group_id] ??= []).push(p.name || p.username || "Unknown");
      }

      return groups
        .map(
          (g: { id: string; name: string; emoji: string; is_public: boolean }) =>
            `${g.emoji} ${g.name} (${g.is_public ? "public" : "private"}) — members: ${(byGroup[g.id] ?? []).join(", ") || "none yet"}`,
        )
        .join("\n");
    },
    {
      name: "get_user_groups",
      description: "Returns the signed-in user's groups and their members.",
      schema: z.object({}),
    },
  );

const getUserFriendsTool = (jwt: string) =>
  tool(
    async () => {
      const sb = makeSupabase(jwt);
      const { data } = await sb
        .from("friendships")
        .select(
          "friend:profiles!friendships_friend_id_fkey(name, username, interests)",
        )
        .eq("status", "accepted");

      const friends = ((data ?? []) as { friend: unknown }[])
        .map((r) => r.friend as { name?: string; username?: string; interests?: string[] } | null)
        .filter((f): f is { name?: string; username?: string; interests?: string[] } => !!f);

      if (friends.length === 0) return "The user has no friends yet.";
      return friends
        .map(
          (f) =>
            `${f.name || f.username}${f.interests?.length ? ` (interests: ${f.interests.join(", ")})` : ""}`,
        )
        .join("\n");
    },
    {
      name: "get_user_friends",
      description:
        "Returns the user's accepted friends and their interests — useful for group planning.",
      schema: z.object({}),
    },
  );

const getPlacesTool = (jwt: string) =>
  tool(
    async ({ category, tag }: { category?: string; tag?: string }) => {
      const sb = makeSupabase(jwt);
      let q = sb
        .from("places")
        .select("name, category, area, price_level, rating, tags, ai_reason")
        .limit(30);

      if (category) q = q.ilike("category", `%${category}%`);
      if (tag) q = q.contains("tags", [tag.toLowerCase()]);

      const { data } = await q;
      if (!data || data.length === 0) return "No matching places found.";
      return (data as {
        name: string;
        category: string;
        area: string;
        price_level: number;
        rating: number;
        tags: string[];
        ai_reason: string;
      }[])
        .map(
          (p) =>
            `• ${p.name} — ${p.category}, ${p.area} | Rating: ${p.rating}/5 | Price: ${"$".repeat(p.price_level || 1)} | Tags: ${(p.tags ?? []).join(", ")}\n  Why: ${p.ai_reason}`,
        )
        .join("\n");
    },
    {
      name: "get_places",
      description:
        "Fetches real Kuwait places from the Beyond Kw database. Filter by category (e.g. 'Café', 'Restaurant', 'Outdoor', 'Mall') or tag (e.g. 'beach', 'coffee', 'family').",
      schema: z.object({
        category: z.string().optional().describe("Place category to filter by"),
        tag: z.string().optional().describe("Tag to filter by"),
      }),
    },
  );

const getGroupActivityTool = (jwt: string) =>
  tool(
    async () => {
      const sb = makeSupabase(jwt);
      const { data: memberRows } = await sb
        .from("group_members")
        .select("group_id");
      const ids = (memberRows ?? []).map((r: { group_id: string }) => r.group_id);
      if (!ids.length) return "No group activity yet.";

      const { data: groups } = await sb
        .from("groups")
        .select("name, emoji, created_at")
        .in("id", ids)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!groups || groups.length === 0) return "No recent group activity.";
      return (groups as { name: string; emoji: string; created_at: string }[])
        .map((g) => `${g.emoji} ${g.name} — joined/created recently`)
        .join("\n");
    },
    {
      name: "get_group_activity",
      description:
        "Returns a summary of the user's recent group activity — useful for notifications or recaps.",
      schema: z.object({}),
    },
  );

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set in .env.local" },
      { status: 500 },
    );
  }

  const jwt = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!jwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messages = [], group = null, interests = [] } = await req.json();

  const tools = [
    getUserGroupsTool(jwt),
    getUserFriendsTool(jwt),
    getPlacesTool(jwt),
    getGroupActivityTool(jwt),
  ];

  const model = new ChatAnthropic({
    model: "claude-haiku-4-5-20251001",
    apiKey,
    maxTokens: 1200,
  }).bindTools(tools);

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
    const memberNames = (group.members ?? []).map((m: { name?: string }) => m.name).join(", ");
    system += ` The user is planning for the group "${group.name}"${memberNames ? ` with: ${memberNames}` : ""}.`;
  }
  if (interests.length) {
    system += ` The user's interests: ${interests.join(", ")}.`;
  }

  // Convert history to LangChain messages
  const history = (messages as { role: string; content: string }[]).map((m) =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
  );

  // Agentic loop — handle tool calls
  let response = await model.invoke([new SystemMessage(system), ...history]);

  let iterations = 0;
  while (response.tool_calls && response.tool_calls.length > 0 && iterations < 5) {
    iterations++;
    const toolMessages: ToolMessage[] = [];
    for (const tc of response.tool_calls) {
      const t = tools.find((t) => t.name === tc.name);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = t ? await (t.invoke as (a: any) => Promise<unknown>)(tc.args) : "Tool not found.";
      toolMessages.push(new ToolMessage({ content: String(result), tool_call_id: tc.id! }));
    }
    response = await model.invoke([
      new SystemMessage(system),
      ...history,
      response,
      ...toolMessages,
    ]);
  }

  return NextResponse.json({ reply: response.content });
}
