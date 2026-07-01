import { NextRequest, NextResponse } from "next/server";
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { waManager } from "@/lib/whatsapp/manager";

export const runtime = "nodejs";

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
            `${g.emoji} ${g.name} [id:${g.id}] (${g.is_public ? "public" : "private"}) — members: ${(byGroup[g.id] ?? []).join(", ") || "none yet"}`,
        )
        .join("\n");
    },
    {
      name: "get_user_groups",
      description: "Returns the signed-in user's groups, their members, and their IDs. Always call this before create_event to find the correct group ID.",
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

const createEventTool = (jwt: string) =>
  tool(
    async ({ groupId, title, description, placeName, eventDate, eventTime }: {
      groupId: string;
      title: string;
      description?: string;
      placeName?: string;
      eventDate?: string;
      eventTime?: string;
    }) => {
      const sb = makeSupabase(jwt);
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return "Error: Not authenticated.";

      const { data, error } = await sb.from("events").insert({
        group_id: groupId,
        title,
        description: description || null,
        place_name: placeName || null,
        event_date: eventDate || null,
        event_time: eventTime || null,
        created_by: user.id,
      }).select().single();

      if (error) return `Failed to create event: ${error.message}`;

      const ev = data as { title: string; event_date?: string; event_time?: string; place_name?: string; description?: string };
      const confirm = `Event created! 🎉 "${ev.title}"${ev.place_name ? ` at ${ev.place_name}` : ""}${ev.event_date ? ` on ${ev.event_date}` : ""} has been added to the group.`;

      // Build a human-readable event announcement
      const lines = [`📅 New Event: ${title}`];
      if (ev.place_name) lines.push(`📍 ${ev.place_name}`);
      if (ev.event_date) lines.push(`🗓️ ${ev.event_date}${ev.event_time ? ` at ${ev.event_time}` : ""}`);
      if (ev.description) lines.push(`📝 ${ev.description}`);
      lines.push(`✨ Added via Beyond Kw AI`);
      const announcement = lines.join("\n");

      // Post to in-app group chat so all members see it
      try {
        await sb.from("group_messages").insert({
          group_id: groupId,
          sender_id: user.id,
          content: announcement,
        });
      } catch { /* ignore */ }

      // Also send to WhatsApp if ANY member has a connected WA session for this group
      try {
        const { data: links } = await sb
          .from("whatsapp_group_links")
          .select("wa_jid, user_id")
          .eq("group_id", groupId);

        for (const link of links ?? []) {
          if (waManager.getStatus(link.user_id) === "connected") {
            await waManager.sendText(link.user_id, link.wa_jid, announcement);
            break;
          }
        }
      } catch { /* WA send failure should not block the response */ }

      return confirm;
    },
    {
      name: "create_event",
      description:
        "Creates a group event in Beyond Kw. " +
        "IMPORTANT: Always call get_user_groups first to get the correct group ID. " +
        "If the user hasn't specified a group, ask them which group this event is for before calling this tool. " +
        "eventDate must be YYYY-MM-DD, eventTime must be HH:MM (24h).",
      schema: z.object({
        groupId: z.string().describe("UUID of the group from get_user_groups [id:...] field"),
        title: z.string().describe("Event title"),
        description: z.string().optional().describe("Optional description"),
        placeName: z.string().optional().describe("Venue or place name"),
        eventDate: z.string().optional().describe("Date in YYYY-MM-DD format"),
        eventTime: z.string().optional().describe("Time in HH:MM 24h format"),
      }),
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
    createEventTool(jwt),
  ];

  const model = new ChatAnthropic({
    model: "claude-haiku-4-5-20251001",
    apiKey,
    maxTokens: 1200,
  }).bindTools(tools);

  // Build system prompt
  let system =
    "You are the Beyond Kw assistant — a friendly local guide for KUWAIT ONLY. " +
    "Be concise: reply in 3–6 lines max. No long paragraphs. " +
    "RULES: (1) Only recommend real places in Kuwait. " +
    "(2) Give 2–3 options with a one-line reason and rough KWD budget. " +
    "(3) Use your tools to fetch real data — don't make things up. " +
    "(4) EVENT CREATION: ask which group if not specified, call get_user_groups for the ID, then create_event. " +
    "Today is " + new Date().toISOString().split("T")[0] + ". Convert day names to YYYY-MM-DD. " +
    "After creating, confirm briefly.";

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

  // Agentic loop — handle tool calls (parallel execution, max 3 rounds)
  let response = await model.invoke([new SystemMessage(system), ...history]);

  let iterations = 0;
  while (response.tool_calls && response.tool_calls.length > 0 && iterations < 3) {
    iterations++;
    // Run all tool calls in parallel
    const toolMessages: ToolMessage[] = await Promise.all(
      response.tool_calls.map(async (tc) => {
        const t = tools.find((t) => t.name === tc.name);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = t ? await (t.invoke as (a: any) => Promise<unknown>)(tc.args) : "Tool not found.";
        return new ToolMessage({ content: String(result), tool_call_id: tc.id! });
      })
    );
    response = await model.invoke([
      new SystemMessage(system),
      ...history,
      response,
      ...toolMessages,
    ]);
  }

  return NextResponse.json({ reply: response.content });
}
