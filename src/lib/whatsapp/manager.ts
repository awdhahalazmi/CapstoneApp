/**
 * WhatsApp session manager using Baileys.
 * Stored as a globalThis singleton so it survives Next.js hot reloads.
 */
import path from "path";
import fs from "fs";

export interface WAGroup {
  id: string;
  name: string;
  participantCount: number;
}

export type SessionStatus = "idle" | "connecting" | "qr" | "connected" | "disconnected";

interface Session {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket: any | null;
  status: SessionStatus;
  qr: string | null;
  groups: WAGroup[];
  qrListeners: Set<(qr: string) => void>;
}

interface PollEntry {
  groupId: string;
  options: string[];
  // Accumulated poll update messages for getAggregateVotesInPollMessage
  pollUpdates: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
}

class WhatsAppManager {
  private sessions = new Map<string, Session>();
  private sessionsDir = path.join(process.cwd(), ".wa-sessions");
  private pollRegistry = new Map<string, PollEntry>();
  private liveVotes = new Map<string, Map<string, number[]>>();
  // Cache `${userId}:${waJid}` → groupId to avoid repeated DB lookups
  private groupLinkCache = new Map<string, string>();
  // Prevents duplicate startSession calls while async init is in flight
  private starting = new Set<string>();

  constructor() {
    fs.mkdirSync(this.sessionsDir, { recursive: true });
    // Auto-reconnect any sessions that have saved credentials
    this._reconnectSaved();
  }

  private _reconnectSaved(): void {
    try {
      const userDirs = fs.readdirSync(this.sessionsDir);
      for (const userId of userDirs) {
        const credsPath = path.join(this.sessionsDir, userId, "creds.json");
        if (fs.existsSync(credsPath)) {
          console.log("[WA] Auto-reconnecting saved session for", userId.slice(0, 8));
          this.startSession(userId).catch(console.error);
        }
      }
    } catch { /* ignore */ }
  }

  async startSession(userId: string): Promise<void> {
    const existing = this.sessions.get(userId);
    if (existing?.status === "connected") return;
    if (this.starting.has(userId)) return;  // async init already in flight
    if (existing?.status === "qr" || existing?.status === "connecting") {
      if (existing.socket) return;          // socket alive — don't restart
      this.sessions.delete(userId);         // socket null AND not starting → stale
    }

    this.starting.add(userId);
    const sessionDir = path.join(this.sessionsDir, userId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const session: Session = {
      socket: null,
      status: "connecting",
      qr: null,
      groups: [],
      qrListeners: new Set(),
    };
    this.sessions.set(userId, session);

    try {
      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        Browsers,
        getAggregateVotesInPollMessage,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } = (await import("@whiskeysockets/baileys")) as any;

      const pino = ((await import("pino")) as any).default ?? (await import("pino"));
      const logger = pino({ level: "warn" });

      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu("Chrome"),
        connectTimeoutMs: 60_000,
        logger,
      });
      session.socket = sock;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sock.ev.on("connection.update", async (update: any) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
          console.log("[WA] QR generated for", userId.slice(0, 8));
          session.qr = qr;
          session.status = "qr";
          session.qrListeners.forEach((cb) => cb(qr));
        }

        if (connection === "open") {
          console.log("[WA] Connected for", userId.slice(0, 8));
          session.status = "connected";
          session.qr = null;
          try {
            const raw = await sock.groupFetchAllParticipating();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            session.groups = Object.values(raw).map((g: any) => ({
              id: g.id,
              name: g.subject || "Group",
              participantCount: (g.participants ?? []).length,
            }));
          } catch { /* non-fatal */ }

          // Reload poll registry from Supabase so votes still work after server restart
          try {
            const pollsRes = await fetch(
              `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/whatsapp_polls?select=wa_message_id,group_id,options&wa_message_id=not.is.null`,
              {
                headers: {
                  apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
                  Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
                },
              }
            );
            if (pollsRes.ok) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const polls: any[] = await pollsRes.json();
              for (const p of polls) {
                if (p.wa_message_id && !this.pollRegistry.has(p.wa_message_id)) {
                  this.pollRegistry.set(p.wa_message_id, {
                    groupId: p.group_id,
                    options: Array.isArray(p.options) ? p.options : [],
                    pollUpdates: [],
                  });
                }
              }
              console.log(`[WA] Loaded ${polls.length} polls from Supabase`);
            }
          } catch (e) { console.error("[WA] poll registry load error:", e); }
        }

        if (connection === "close") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const code = (lastDisconnect?.error as any)?.output?.statusCode;
          const reason = (lastDisconnect?.error as any)?.message ?? "unknown";
          console.log("[WA] Connection closed for", userId.slice(0, 8), "code:", code, "reason:", reason);
          if (code !== DisconnectReason.loggedOut) {
            session.status = "connecting";
            session.socket = null;
            setTimeout(() => this.startSession(userId), 5_000);
          } else {
            session.status = "disconnected";
            this.sessions.delete(userId);
          }
        }
      });

      sock.ev.on("creds.update", saveCreds);

      // ── Message listener (poll votes + text capture) ─────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
        for (const msg of messages) {

          // ── Poll vote handling ──────────────────────────────────────────
          const pollUpdate = msg?.message?.pollUpdateMessage;
          if (pollUpdate) {
            const pollMsgId: string | undefined =
              pollUpdate.pollCreationMessageKey?.id;
            if (!pollMsgId) continue;

            const entry = this.pollRegistry.get(pollMsgId);
            if (!entry) {
              console.log("[WA] Poll vote ignored — poll not in registry:", pollMsgId?.slice(0, 8));
              continue;
            }

            const voterJid: string =
              msg.key?.participant || msg.key?.remoteJid || "unknown";

            entry.pollUpdates.push({
              vote: pollUpdate.vote,
              pollUpdateMessageKey: msg.key,
            });

            const fakeCreationMsg = {
              pollCreationMessage: {
                options: entry.options.map((name: string) => ({ optionName: name })),
              },
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const aggregated: { name: string; voters: string[] }[] =
              getAggregateVotesInPollMessage(
                { message: fakeCreationMsg, pollUpdates: entry.pollUpdates },
                sock.user?.id
              );

            const voterVotes = new Map<string, number[]>();
            for (let i = 0; i < aggregated.length; i++) {
              for (const voter of aggregated[i].voters) {
                if (!voterVotes.has(voter)) voterVotes.set(voter, []);
                voterVotes.get(voter)!.push(i);
              }
            }
            this.liveVotes.set(pollMsgId, voterVotes);

            const votedIndices = voterVotes.get(voterJid) ?? [];
            console.log(
              `[WA] Poll ${pollMsgId.slice(0, 8)} — ${voterJid.split("@")[0]} voted:`,
              votedIndices,
              "| totals:", aggregated.map((a) => `${a.name}:${a.voters.length}`)
            );

            fetch(
              `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/update_poll_votes`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
                },
                body: JSON.stringify({
                  p_wa_message_id: pollMsgId,
                  p_voter_jid: voterJid,
                  p_option_indices: votedIndices,
                }),
              }
            ).catch((e) => console.error("[WA] vote persist error:", e));
            continue; // poll vote handled — skip text capture below
          }

          // ── Text message capture ────────────────────────────────────────
          // Only process freshly-received group messages, not history loads
          if (type !== "notify") continue;
          const remoteJid: string = msg.key?.remoteJid ?? "";
          if (!remoteJid.endsWith("@g.us")) continue;

          const content: string =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            "";
          if (!content.trim()) continue;
          if (msg.message?.pollCreationMessage) continue;

          const groupId = await this._getGroupIdForJid(userId, remoteJid);
          if (!groupId) continue;

          const senderJid: string = msg.key?.participant || remoteJid;
          const senderName: string =
            (msg.pushName as string | undefined) ||
            senderJid.split("@")[0] ||
            "Unknown";
          const isFromMe: boolean = msg.key?.fromMe ?? false;
          const waMessageId: string | null = msg.key?.id ?? null;

          console.log(
            `[WA] Message in ${remoteJid.split("@")[0]} from ${senderName}: ${content.slice(0, 40)}`
          );

          fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/store_wa_message`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
              },
              body: JSON.stringify({
                p_group_id: groupId,
                p_wa_jid: remoteJid,
                p_sender_jid: senderJid,
                p_sender_name: senderName,
                p_content: content.trim(),
                p_is_from_me: isFromMe,
                p_wa_message_id: waMessageId,
              }),
            }
          ).catch((e) => console.error("[WA] message store error:", e));
        }
      });
    } catch (err) {
      console.error("[WA] startSession error:", err);
      session.status = "disconnected";
      this.sessions.delete(userId);
    } finally {
      this.starting.delete(userId);
    }
  }

  /** Look up the app group_id linked to a WA JID for a given user. Cached. */
  private async _getGroupIdForJid(userId: string, waJid: string): Promise<string | null> {
    const cacheKey = `${userId}:${waJid}`;
    const cached = this.groupLinkCache.get(cacheKey);
    if (cached) return cached;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/whatsapp_group_links` +
          `?wa_jid=eq.${encodeURIComponent(waJid)}&user_id=eq.${userId}&select=group_id&limit=1`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
          },
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const groupId: string | null = data[0]?.group_id ?? null;
      if (groupId) this.groupLinkCache.set(cacheKey, groupId);
      return groupId;
    } catch {
      return null;
    }
  }

  getStatus(userId: string): SessionStatus {
    return this.sessions.get(userId)?.status ?? "idle";
  }

  getCurrentQR(userId: string): string | null {
    return this.sessions.get(userId)?.qr ?? null;
  }

  onQR(userId: string, cb: (qr: string) => void): () => void {
    const s = this.sessions.get(userId);
    if (!s) return () => {};
    s.qrListeners.add(cb);
    return () => s.qrListeners.delete(cb);
  }

  async refreshGroups(userId: string): Promise<WAGroup[]> {
    const s = this.sessions.get(userId);
    if (!s?.socket || s.status !== "connected") return s?.groups ?? [];
    try {
      const raw = await s.socket.groupFetchAllParticipating();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      s.groups = Object.values(raw).map((g: any) => ({
        id: (g as any).id,
        name: (g as any).subject || "Group",
        participantCount: ((g as any).participants ?? []).length,
      }));
    } catch { /* use cached */ }
    return s.groups;
  }

  async sendPoll(
    userId: string, jid: string, question: string, options: string[],
  ): Promise<string | null> {
    const s = this.sessions.get(userId);
    if (!s?.socket || s.status !== "connected") return null;
    try {
      const msg = await s.socket.sendMessage(jid, {
        poll: { name: question, values: options, selectableCount: 1 },
      });
      return msg?.key?.id ?? null;
    } catch (err) {
      console.error("[WA] sendPoll error:", err);
      return null;
    }
  }

  /** Called right after sending a poll so we can decode incoming votes. */
  registerPoll(pollMsgId: string, groupId: string, options: string[]): void {
    this.pollRegistry.set(pollMsgId, { groupId, options, pollUpdates: [] });
  }

  /**
   * Returns live vote counts for all polls belonging to a group.
   * Shape: { [wa_message_id]: { "0": count, "1": count, … } }
   */
  getLiveVoteCounts(groupId: string): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    for (const [pollMsgId, entry] of this.pollRegistry) {
      if (entry.groupId !== groupId) continue;
      const voterMap = this.liveVotes.get(pollMsgId);
      if (!voterMap) continue;
      const counts: Record<string, number> = {};
      for (const indices of voterMap.values()) {
        for (const idx of indices) {
          counts[String(idx)] = (counts[String(idx)] ?? 0) + 1;
        }
      }
      result[pollMsgId] = counts;
    }
    return result;
  }

  async sendText(userId: string, jid: string, text: string): Promise<void> {
    const s = this.sessions.get(userId);
    if (!s?.socket || s.status !== "connected") return;
    try {
      await s.socket.sendMessage(jid, { text });
    } catch (err) {
      console.error("[WA] sendText error:", err);
    }
  }

  async disconnect(userId: string): Promise<void> {
    const s = this.sessions.get(userId);
    if (s?.socket) {
      try { await s.socket.logout(); } catch { /* ignore */ }
      try { s.socket.end(undefined); } catch { /* ignore */ }
    }
    this.sessions.delete(userId);
    const dir = path.join(this.sessionsDir, userId);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const g = globalThis as Record<string, unknown>;
if (!g.__waManager) {
  g.__waManager = new WhatsAppManager();
}
export const waManager = g.__waManager as WhatsAppManager;
