/**
 * Handles the /plan WhatsApp command.
 * When any group member sends "/plan" in a linked WhatsApp group, this module:
 *  1. Sends an acknowledgement
 *  2. Calls the AI (OpenRouter Grok 4) to suggest places
 *  3. Sends the suggestion as a formatted text message
 *  4. Sends a places poll + a time poll into the group
 *  5. Saves both polls to Supabase so they appear in the app
 *
 * Follows the same pattern as reminder-scheduler.ts — receives a WAManager-like
 * interface to avoid a circular import with manager.ts.
 */

interface WAManagerLike {
  sendText(userId: string, jid: string, text: string): Promise<void>;
  sendPoll(userId: string, jid: string, question: string, options: string[]): Promise<{ messageId: string | null; encKeyBase64: string | null }>;
}

type AISuggestion = {
  outingType: string;
  reason: string;
  places: { name: string; area: string; reason: string; emoji: string }[];
};


async function sbGet(path: string): Promise<unknown[] | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function sbInsert(table: string, body: Record<string, unknown>): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });
  } catch { /* non-critical */ }
}

async function askAI(groupName: string): Promise<AISuggestion> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const prompt =
    `IMPORTANT: Reply with raw JSON only — no markdown, no explanation.\n\n` +
    `Group "${groupName}" in Kuwait wants to plan a group outing.\n` +
    `Suggest the BEST outing type and recommend 4 real Kuwait places.\n\n` +
    `Reply ONLY:\n` +
    `{"outingType":"Café Outing","reason":"Short reason why...","places":[{"name":"Exact Place Name","area":"Area, Kuwait","reason":"Why perfect for a group","emoji":"☕"}]}`;

  // Route through the Supabase Edge Function which has the OpenRouter key in its secrets
  const res = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`AI function ${res.status}`);
  const data = await res.json() as { reply?: string };
  const raw = (data.reply ?? "").trim()
    .replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(raw) as AISuggestion;
}

// Prevent concurrent /plan executions per group (a single call can take ~5s)
const inProgress = new Set<string>();

export async function handlePlanCommand(
  wa: WAManagerLike,
  userId: string,
  groupJid: string,
  groupName: string,
): Promise<void> {
  if (inProgress.has(groupJid)) {
    await wa.sendText(userId, groupJid, "⏳ Already planning — hang tight!");
    return;
  }
  inProgress.add(groupJid);

  try {
    await wa.sendText(userId, groupJid, `🤖 Finding the best spots for *${groupName}*…`);

    // Get AI suggestions
    const suggestion = await askAI(groupName);

    // Send ONE places poll
    const question = `Where should we go? 📍`;
    const options = suggestion.places.map((p) => p.name);
    const { messageId } = await wa.sendPoll(userId, groupJid, question, options);

    // Resolve group_id and persist poll so it appears in the Beyond Kw app
    const links = await sbGet(
      `whatsapp_group_links?wa_jid=eq.${encodeURIComponent(groupJid)}&select=group_id,user_id&limit=1`,
    );
    const groupId: string | null = (links?.[0] as { group_id?: string })?.group_id ?? null;
    const createdBy: string | null = (links?.[0] as { user_id?: string })?.user_id ?? userId;

    if (groupId && createdBy) {
      await sbInsert("whatsapp_polls", {
        group_id: groupId,
        wa_jid: groupJid,
        wa_message_id: messageId,
        question,
        options,
        vote_counts: {},
        created_by: createdBy,
      });
    }

    console.log(`[WA] /plan completed for ${groupJid}`);
  } catch (err) {
    console.error("[WA] /plan error:", err);
    try {
      await wa.sendText(userId, groupJid, "❌ Couldn't plan right now — please try again in a moment.");
    } catch { /* ignore */ }
  } finally {
    inProgress.delete(groupJid);
  }
}
