/**
 * Polls Supabase for due event reminders and sends them to the WhatsApp group.
 * Runs as a globalThis-guarded interval so it survives Next.js hot reloads and
 * only ever runs once per server process — mirrors the waManager singleton.
 *
 * Takes the manager instance as a parameter (instead of importing it) to avoid
 * a circular import with manager.ts, which initializes this scheduler.
 */
interface WAManagerLike {
  getStatus(userId: string): string;
  sendText(userId: string, jid: string, text: string): Promise<void>;
}

const POLL_INTERVAL_MS = 60_000;

type DueReminder = {
  reminder_id: string;
  event_id: string;
  label: string;
  title: string;
  description: string | null;
  place_name: string | null;
  event_date: string | null;
  event_time: string | null;
  poll_summary: string | null;
  group_id: string;
  wa_jid: string | null;
  sender_user_id: string | null;
};

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[Reminders] ${fn} failed:`, res.status, await res.text());
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error(`[Reminders] ${fn} error:`, e);
    return null;
  }
}

function formatReminderMessage(r: DueReminder): string {
  const when = [r.event_date, r.event_time].filter(Boolean).join(" at ");
  const where = r.place_name ? ` @ ${r.place_name}` : "";
  const base = `⏰ Reminder: ${r.title} is coming up${when ? ` — ${when}` : ""}${where}.`;
  return r.description ? `${base}\n${r.description}` : base;
}

async function tick(wa: WAManagerLike): Promise<void> {
  const due = await rpc<DueReminder[]>("get_due_reminders", {});
  if (!due || due.length === 0) return;

  for (const r of due) {
    if (!r.wa_jid || !r.sender_user_id) continue;
    if (wa.getStatus(r.sender_user_id) !== "connected") continue;
    try {
      await wa.sendText(r.sender_user_id, r.wa_jid, formatReminderMessage(r));
      await rpc("mark_reminder_sent", { p_reminder_id: r.reminder_id });
    } catch (e) {
      console.error("[Reminders] send error:", e);
    }
  }
}

export function initReminderScheduler(wa: WAManagerLike): void {
  const g = globalThis as Record<string, unknown>;
  if (g.__reminderScheduler) return;
  g.__reminderScheduler = true;
  setInterval(() => {
    tick(wa).catch((e) => console.error("[Reminders] tick error:", e));
  }, POLL_INTERVAL_MS);
}
