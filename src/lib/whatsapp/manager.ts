/**
 * WhatsApp session manager using Baileys.
 * Stored as a globalThis singleton so it survives Next.js hot reloads.
 * Messages persisted to local JSON files so history survives process restarts.
 */
import path from "path";
import fs from "fs";
import crypto from "crypto";

export interface WAGroup {
  id: string;
  name: string;
  participantCount: number;
}

export type WAMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "sticker"
  | "document"
  | "poll"
  | "reaction"
  | "location"
  | "unknown";

export interface WAInMemoryMessage {
  id: string;
  senderJid: string;
  senderName: string;
  isFromMe: boolean;
  timestampMs: number;
  msgType: WAMessageType;
  text: string;
  mediaBase64?: string;
  mimeType?: string;
  pollOptions?: string[];
  pollVotes?: Record<string, number>; // live vote counts { "0": n, "1": n }
  reactionEmoji?: string;
  reactionTargetId?: string;
  quotedId?: string;
  quotedText?: string;
  quotedSenderName?: string;
}

export type SessionStatus = "idle" | "connecting" | "qr" | "connected" | "disconnected";

interface Session {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket: any | null;
  status: SessionStatus;
  qr: string | null;
  groups: WAGroup[];
  qrListeners: Set<(qr: string) => void>;
  waMessages: Map<string, WAInMemoryMessage[]>;
}

interface PollEntry {
  groupId: string;
  options: string[];
  pollUpdates: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  encKey?: Buffer; // messageContextInfo.messageSecret of the poll creation message
  // WhatsApp accounts have both a phone-number JID and a "LID" JID; a fromMe
  // message could be addressed under either depending on the group's mode, so
  // we keep every candidate and try each one when decrypting (see decryptVoteAnyIdentity).
  creatorJidCandidates?: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function jidToFileName(waJid: string): string {
  return crypto.createHash("md5").update(waJid).digest("hex");
}

// Mirrors Baileys' internal getKeyAuthor, but returns every plausible identity
// for fromMe messages (PN JID and LID JID) since which one WhatsApp used for
// the vote HMAC isn't observable from outside Baileys' internal signal state.
function keyAuthorCandidates(key: { fromMe?: boolean; participant?: string; participantAlt?: string; remoteJid?: string; remoteJidAlt?: string } | undefined, meCandidates: string[]): string[] {
  if (!key) return [""];
  if (key.fromMe) return meCandidates.length ? meCandidates : [""];
  // Try every identity form (PN and LID), not just the first one found — which
  // of these WhatsApp used for a given voter's vote HMAC isn't observable from
  // outside Baileys' internal signal state, same as for our own votes above.
  const candidates = [key.participant, key.participantAlt, key.remoteJid, key.remoteJidAlt].filter((j): j is string => !!j);
  return candidates.length ? Array.from(new Set(candidates)) : [""];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function meIdentityCandidates(sock: any, jidNormalizedUser: (jid: string) => string): string[] {
  const me = sock?.authState?.creds?.me;
  const out: string[] = [];
  if (me?.id) out.push(jidNormalizedUser(me.id));
  if (me?.lid) out.push(jidNormalizedUser(me.lid));
  return Array.from(new Set(out.filter(Boolean)));
}

function uint8ToDataUrl(data: Uint8Array | Buffer | null | undefined, mime = "image/jpeg"): string | undefined {
  if (!data || data.length === 0) return undefined;
  return `data:${mime};base64,${Buffer.from(data).toString("base64")}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMessage(msg: any, sock: any): Omit<WAInMemoryMessage, "id" | "senderJid" | "senderName" | "isFromMe" | "timestampMs"> | null {
  const m = msg.message;
  if (!m) return null;

  const inner =
    m.ephemeralMessage?.message ||
    m.viewOnceMessage?.message ||
    m.viewOnceMessageV2?.message ||
    m;

  if (inner.conversation || inner.extendedTextMessage) {
    const text: string = inner.conversation || inner.extendedTextMessage?.text || "";
    const ctx = inner.extendedTextMessage?.contextInfo;
    const quotedId: string | undefined = ctx?.stanzaId;
    const qm = ctx?.quotedMessage;
    const quotedText: string | undefined =
      qm?.conversation ||
      qm?.extendedTextMessage?.text ||
      (qm?.imageMessage ? "📷 Photo" : undefined) ||
      (qm?.videoMessage ? "🎬 Video" : undefined) ||
      (qm?.stickerMessage ? "🎭 Sticker" : undefined) ||
      (qm?.audioMessage ? "🎵 Audio" : undefined) ||
      (qm?.pollCreationMessage ? `📊 ${qm.pollCreationMessage.name}` : undefined);
    const quotedSenderName: string | undefined = ctx?.participant?.split("@")[0];
    return { msgType: "text", text, quotedId, quotedText, quotedSenderName };
  }

  if (inner.imageMessage) {
    const im = inner.imageMessage;
    return { msgType: "image", text: im.caption || "", mediaBase64: uint8ToDataUrl(im.jpegThumbnail), mimeType: im.mimetype || "image/jpeg" };
  }

  if (inner.videoMessage) {
    const vm = inner.videoMessage;
    return { msgType: "video", text: vm.caption || "", mediaBase64: uint8ToDataUrl(vm.jpegThumbnail), mimeType: vm.mimetype || "video/mp4" };
  }

  if (inner.audioMessage) {
    return { msgType: "audio", text: "", mimeType: inner.audioMessage.mimetype || "audio/ogg" };
  }

  if (inner.stickerMessage) {
    const sm = inner.stickerMessage;
    return { msgType: "sticker", text: "", mediaBase64: uint8ToDataUrl(sm.jpegThumbnail, sm.mimetype || "image/webp"), mimeType: sm.mimetype || "image/webp" };
  }

  if (inner.documentMessage) {
    const dm = inner.documentMessage;
    return { msgType: "document", text: dm.title || dm.fileName || "Document", mimeType: dm.mimetype };
  }

  if (inner.pollCreationMessage || inner.pollCreationMessageV2 || inner.pollCreationMessageV3) {
    const pm = inner.pollCreationMessage || inner.pollCreationMessageV2 || inner.pollCreationMessageV3;
    return { msgType: "poll", text: pm.name || "Poll", pollOptions: (pm.options || []).map((o: any) => o.optionName || "") }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  if (inner.reactionMessage) {
    const rm = inner.reactionMessage;
    return { msgType: "reaction", text: rm.text || "", reactionEmoji: rm.text || "", reactionTargetId: rm.key?.id };
  }

  if (inner.locationMessage || inner.liveLocationMessage) {
    const lm = inner.locationMessage || inner.liveLocationMessage;
    return { msgType: "location", text: lm.name || lm.address || "📍 Location" };
  }

  return { msgType: "unknown", text: "" };
}

// ── Manager ────────────────────────────────────────────────────────────────────

class WhatsAppManager {
  private sessions = new Map<string, Session>();
  private sessionsDir = path.join(process.cwd(), ".wa-sessions");
  private pollRegistry = new Map<string, PollEntry>();
  private starting = new Set<string>();
  // pending file-save timers per (userId+jid)
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    fs.mkdirSync(this.sessionsDir, { recursive: true });
    this._reconnectSaved();
  }

  private _msgsFile(userId: string, waJid: string): string {
    const dir = path.join(this.sessionsDir, userId, "msgs");
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${jidToFileName(waJid)}.json`);
  }

  private _loadMessages(userId: string, waJid: string): WAInMemoryMessage[] {
    try {
      const raw = fs.readFileSync(this._msgsFile(userId, waJid), "utf8");
      return JSON.parse(raw) as WAInMemoryMessage[];
    } catch { return []; }
  }

  private _scheduleSave(userId: string, waJid: string, session: Session): void {
    const key = `${userId}:${waJid}`;
    if (this.saveTimers.has(key)) return;
    const t = setTimeout(() => {
      this.saveTimers.delete(key);
      const msgs = session.waMessages.get(waJid) ?? [];
      try { fs.writeFileSync(this._msgsFile(userId, waJid), JSON.stringify(msgs)); } catch { /* ignore */ }
    }, 500);
    this.saveTimers.set(key, t);
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

  private _storeMessage(userId: string, session: Session, remoteJid: string, entry: WAInMemoryMessage): void {
    const msgs = session.waMessages.get(remoteJid) ?? [];
    if (!msgs.some((m) => m.id === entry.id)) {
      msgs.push(entry);
      if (msgs.length > 500) msgs.splice(0, msgs.length - 500);
      session.waMessages.set(remoteJid, msgs);
      this._scheduleSave(userId, remoteJid, session);
    }
  }

  private _updatePollVotes(userId: string, session: Session, remoteJid: string, msgId: string, voteCounts: Record<string, number>): void {
    const msgs = session.waMessages.get(remoteJid);
    if (!msgs) return;
    const poll = msgs.find((m) => m.id === msgId);
    if (poll) {
      poll.pollVotes = voteCounts;
      this._scheduleSave(userId, remoteJid, session);
    }
  }

  // Merge poll registration: a Baileys-supplied encKey/creator always wins
  // over a missing one (e.g. pre-loaded from Supabase for polls saved before
  // the enc_key column existed), regardless of which source registers first.
  private _upsertPollEntry(pollId: string, groupId: string, options: string[], encKey?: Buffer, creatorJidCandidates?: string[]): void {
    const existing = this.pollRegistry.get(pollId);
    if (!existing) {
      this.pollRegistry.set(pollId, { groupId, options, pollUpdates: [], encKey, creatorJidCandidates: creatorJidCandidates?.length ? creatorJidCandidates : undefined });
      return;
    }
    if (encKey && !existing.encKey) existing.encKey = encKey;
    if (creatorJidCandidates?.length && !existing.creatorJidCandidates?.length) existing.creatorJidCandidates = creatorJidCandidates;
    if (options.length && existing.options.length === 0) existing.options = options;
  }

  // Decrypt a single poll vote, aggregate it into the poll's running tally, and
  // persist the result. Shared by the live messages.upsert handler and the
  // messaging-history.set handler so votes cast before this connection's
  // history sync (which Baileys delivers as ordinary history messages, not a
  // replayed live event) are decrypted too, not just votes that arrive while connected.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _processPollVote(userId: string, session: Session, sock: any, decryptPollVote: any, getAggregateVotesInPollMessage: any, jidNormalizedUser: (jid: string) => string, msg: any): void {
    const pollUpdate = msg?.message?.pollUpdateMessage;
    if (!pollUpdate) return;
    const pollMsgId: string | undefined = pollUpdate.pollCreationMessageKey?.id;
    if (!pollMsgId) return;
    const entry = this.pollRegistry.get(pollMsgId);
    if (!entry) { console.warn(`[WA] Vote for unknown poll ${pollMsgId?.slice(0, 8)}`); return; }
    if (!entry.encKey || !entry.creatorJidCandidates?.length) { console.warn(`[WA] Poll ${pollMsgId.slice(0, 8)} missing encKey/creator — cannot decrypt vote`); return; }

    const meCands = meIdentityCandidates(sock, jidNormalizedUser);
    const voterCandidates = keyAuthorCandidates(msg.key, meCands);

    // WhatsApp accounts can be addressed by phone-number JID or LID JID
    // depending on the group; try every creator x voter combination
    // until one produces a valid GCM auth tag.
    let voteMsg: { selectedOptions?: Uint8Array[] } | null = null;
    for (const creator of entry.creatorJidCandidates) {
      for (const voter of voterCandidates) {
        try {
          voteMsg = decryptPollVote(pollUpdate.vote, { pollEncKey: entry.encKey, pollCreatorJid: creator, pollMsgId, voterJid: voter });
          break;
        } catch { /* try next identity combo */ }
      }
      if (voteMsg) break;
    }
    if (!voteMsg) {
      console.error(`[WA] vote decrypt failed for poll ${pollMsgId.slice(0, 8)} across ${entry.creatorJidCandidates.length}x${voterCandidates.length} identity combos`);
      return;
    }

    // Replace this voter's previous selection (votes are full snapshots, not deltas)
    const bookkeepingVoter = voterCandidates[0] ?? "";
    entry.pollUpdates = entry.pollUpdates.filter((u) => (keyAuthorCandidates(u.pollUpdateMessageKey, meCands)[0] ?? "") !== bookkeepingVoter);
    entry.pollUpdates.push({ pollUpdateMessageKey: msg.key, vote: voteMsg });

    let aggregated: { name: string; voters: string[] }[];
    try {
      aggregated = getAggregateVotesInPollMessage(
        { message: { pollCreationMessage: { options: entry.options.map((n: string) => ({ optionName: n })) } }, pollUpdates: entry.pollUpdates },
        meCands[0] ?? sock.user?.id
      );
    } catch (e) { console.error("[WA] vote aggregation error:", e); return; }

    const voteCounts: Record<string, number> = {};
    for (let i = 0; i < aggregated.length; i++) voteCounts[String(i)] = aggregated[i].voters.length;
    console.log(`[WA] Poll ${pollMsgId.slice(0, 8)} votes:`, voteCounts);

    // Update in-memory poll message with vote counts
    const remoteJid: string = msg.key?.remoteJid ?? "";
    this._updatePollVotes(userId, session, remoteJid, pollMsgId, voteCounts);

    // Persist to Supabase
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/update_poll_votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      body: JSON.stringify({ p_wa_message_id: pollMsgId, p_vote_counts: voteCounts }),
    }).catch((e) => console.error("[WA] vote persist error:", e));
  }

  async startSession(userId: string): Promise<void> {
    const existing = this.sessions.get(userId);
    if (existing?.status === "connected") return;
    if (this.starting.has(userId)) return;
    if (existing?.status === "qr" || existing?.status === "connecting") {
      if (existing.socket) return;
      this.sessions.delete(userId);
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
      waMessages: new Map(),
    };
    this.sessions.set(userId, session);

    try {
      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        Browsers,
        getAggregateVotesInPollMessage,
        downloadMediaMessage,
        jidNormalizedUser,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } = (await import("@whiskeysockets/baileys")) as any;
      // Not exported from the package root — deep-import the real vote decryptor.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { decryptPollVote } = (await import("@whiskeysockets/baileys/lib/Utils/process-message.js")) as any;

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

          // Load persisted messages for each known group
          for (const group of session.groups) {
            const saved = this._loadMessages(userId, group.id);
            if (saved.length > 0 && !session.waMessages.has(group.id)) {
              session.waMessages.set(group.id, saved);
              console.log(`[WA] Loaded ${saved.length} saved msgs for ${group.id.slice(0, 12)}`);
            }
          }

          // Load poll registry from Supabase
          try {
            const pollsRes = await fetch(
              `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_active_polls`,
              { method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" }, body: "{}" }
            );
            if (pollsRes.ok) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const polls: any[] = await pollsRes.json();
              // Polls saved by this app were always created by the currently
              // connected account, so that's the best-effort creator identity.
              const meCands = meIdentityCandidates(sock, jidNormalizedUser);
              for (const p of polls) {
                if (p.wa_message_id) {
                  const encKey = p.enc_key ? Buffer.from(p.enc_key, "base64") : undefined;
                  this._upsertPollEntry(p.wa_message_id, p.group_id, Array.isArray(p.options) ? p.options : [], encKey, meCands);
                }
              }
              console.log(`[WA] Loaded ${polls.length} polls into registry`);
            }
          } catch (e) { console.error("[WA] poll registry load error:", e); }
        }

        if (connection === "close") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const code = (lastDisconnect?.error as any)?.output?.statusCode;
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

      // ── History sync ──────────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sock.ev.on("messaging-history.set", ({ messages: histMsgs }: any) => {
        if (!histMsgs?.length) return;
        let count = 0;
        const meCands = meIdentityCandidates(sock, jidNormalizedUser);

        // Pass 1: register every poll creation first, so pass 2 can resolve
        // the encKey/creator for any vote that appears anywhere in this batch
        // (a vote can be ordered before its poll's creation message).
        for (const msg of histMsgs) {
          const remoteJid: string = msg.key?.remoteJid ?? "";
          if (!remoteJid.endsWith("@g.us")) continue;

          // Auto-register polls from history with their real encKey (lives on
          // messageContextInfo, NOT on the pollCreationMessage itself) + creator
          const inner = msg.message?.ephemeralMessage?.message ?? msg.message ?? {};
          const pm = inner.pollCreationMessage ?? inner.pollCreationMessageV2 ?? inner.pollCreationMessageV3;
          if (pm && msg.key?.id) {
            const secret = inner.messageContextInfo?.messageSecret ?? msg.message?.messageContextInfo?.messageSecret;
            const encKey = secret ? Buffer.from(secret) : undefined;
            const creatorCandidates = keyAuthorCandidates(msg.key, meCands);
            this._upsertPollEntry(msg.key.id, remoteJid, (pm.options ?? []).map((o: any) => o.optionName ?? ""), encKey, creatorCandidates); // eslint-disable-line @typescript-eslint/no-explicit-any
          }
        }

        // Pass 2: decrypt poll votes (cast before this connection's history
        // sync, so they never reached the live messages.upsert handler) and
        // store regular chat messages.
        for (const msg of histMsgs) {
          const remoteJid: string = msg.key?.remoteJid ?? "";
          if (!remoteJid.endsWith("@g.us")) continue;

          if (msg.message?.pollUpdateMessage) {
            this._processPollVote(userId, session, sock, decryptPollVote, getAggregateVotesInPollMessage, jidNormalizedUser, msg);
            continue;
          }

          const parsed = parseMessage(msg, sock);
          if (!parsed || (parsed.msgType === "unknown" && !parsed.text)) continue;
          const tsRaw = msg.messageTimestamp;
          const timestampMs = typeof tsRaw === "number" ? tsRaw * 1000 : typeof tsRaw?.toNumber === "function" ? tsRaw.toNumber() * 1000 : Date.now();
          const entry: WAInMemoryMessage = {
            id: msg.key?.id ?? `hist-${timestampMs}`,
            senderJid: msg.key?.participant || remoteJid,
            senderName: (msg.pushName as string | undefined) || (msg.key?.participant || remoteJid).split("@")[0] || "Unknown",
            isFromMe: msg.key?.fromMe ?? false,
            timestampMs,
            ...parsed,
          };
          this._storeMessage(userId, session, remoteJid, entry);
          count++;

          // Async: upgrade historical sticker thumbnails to full WebP
          if (parsed.msgType === "sticker") {
            const histRemoteJid = remoteJid;
            const histMsgId = entry.id;
            downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage })
              .then((buf: Buffer) => {
                const msgs = session.waMessages.get(histRemoteJid);
                const stored = msgs?.find((m) => m.id === histMsgId);
                if (stored) stored.mediaBase64 = `data:image/webp;base64,${buf.toString("base64")}`;
                this._scheduleSave(userId, histRemoteJid, session);
              })
              .catch(() => { /* keep thumbnail */ });
          }
        }
        for (const [jid, msgs] of session.waMessages) {
          msgs.sort((a, b) => a.timestampMs - b.timestampMs);
          session.waMessages.set(jid, msgs);
        }
        console.log(`[WA] History: stored ${count} group messages`);
      });

      // ── Real-time messages ────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sock.ev.on("messages.upsert", ({ messages, type }: any) => {
        for (const msg of messages) {

          // ── Poll votes ────────────────────────────────────────────────────
          if (msg?.message?.pollUpdateMessage) {
            this._processPollVote(userId, session, sock, decryptPollVote, getAggregateVotesInPollMessage, jidNormalizedUser, msg);
            continue;
          }

          // ── Auto-register poll creation messages ──────────────────────────
          const innerM = msg.message?.ephemeralMessage?.message ?? msg.message ?? {};
          const pmCreate = innerM.pollCreationMessage ?? innerM.pollCreationMessageV2 ?? innerM.pollCreationMessageV3;
          if (pmCreate && msg.key?.id) {
            const pmJid: string = msg.key?.remoteJid ?? "";
            const secret = innerM.messageContextInfo?.messageSecret ?? msg.message?.messageContextInfo?.messageSecret;
            const encKey = secret ? Buffer.from(secret) : undefined;
            const creatorCandidates = keyAuthorCandidates(msg.key, meIdentityCandidates(sock, jidNormalizedUser));
            this._upsertPollEntry(msg.key.id, pmJid, (pmCreate.options ?? []).map((o: any) => o.optionName ?? ""), encKey, creatorCandidates); // eslint-disable-line @typescript-eslint/no-explicit-any
            console.log(`[WA] Registered poll ${msg.key.id.slice(0, 8)} encKey=${!!encKey} candidates=${creatorCandidates.length}`);
          }

          // ── All other message types ───────────────────────────────────────
          // Baileys echoes our own sent messages (sock.sendMessage) through this
          // same listener with type "append" rather than "notify" — without this,
          // anything sent from the app (text, polls, ...) never shows in our own
          // chat view. _storeMessage already dedupes by id, so this can't double-store.
          if (type !== "notify" && !msg.key?.fromMe) continue;
          const remoteJid: string = msg.key?.remoteJid ?? "";
          if (!remoteJid.endsWith("@g.us")) continue;

          const parsed = parseMessage(msg, sock);
          if (!parsed || (parsed.msgType === "unknown" && !parsed.text)) continue;

          const senderJid: string = msg.key?.participant || remoteJid;
          const senderName: string = (msg.pushName as string | undefined) || senderJid.split("@")[0] || "Unknown";
          const isFromMe: boolean = msg.key?.fromMe ?? false;
          const msgId: string = msg.key?.id ?? `${Date.now()}`;
          const tsRaw = msg.messageTimestamp;
          const timestampMs = typeof tsRaw === "number" ? tsRaw * 1000 : typeof tsRaw?.toNumber === "function" ? tsRaw.toNumber() * 1000 : Date.now();

          const entry: WAInMemoryMessage = { id: msgId, senderJid, senderName, isFromMe, timestampMs, ...parsed };
          this._storeMessage(userId, session, remoteJid, entry);
          console.log(`[WA] ${parsed.msgType} from ${senderName}: ${parsed.text?.slice(0, 40) || ""}`);

          // Async: upgrade sticker to full WebP
          if (parsed.msgType === "sticker") {
            downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage })
              .then((buf: Buffer) => {
                const msgs = session.waMessages.get(remoteJid);
                const stored = msgs?.find((m) => m.id === msgId);
                if (stored) stored.mediaBase64 = `data:image/webp;base64,${buf.toString("base64")}`;
                this._scheduleSave(userId, remoteJid, session);
              })
              .catch(() => { /* keep thumbnail */ });
          }
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

  async sendPoll(userId: string, jid: string, question: string, options: string[]): Promise<{ messageId: string | null; encKeyBase64: string | null }> {
    const s = this.sessions.get(userId);
    if (!s?.socket || s.status !== "connected") return { messageId: null, encKeyBase64: null };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { jidNormalizedUser } = (await import("@whiskeysockets/baileys")) as any;
      const msg = await s.socket.sendMessage(jid, { poll: { name: question, values: options, selectableCount: 1 } });
      const msgId: string | null = msg?.key?.id ?? null;
      // The vote-decryption secret lives on messageContextInfo, NOT on the poll payload itself.
      const secret: Uint8Array | undefined = msg?.message?.messageContextInfo?.messageSecret;
      const encKey: Buffer | undefined = secret ? Buffer.from(secret) : undefined;
      const encKeyBase64: string | null = encKey ? encKey.toString("base64") : null;
      const creatorCandidates = meIdentityCandidates(s.socket, jidNormalizedUser);
      if (msgId) this._upsertPollEntry(msgId, jid, options, encKey, creatorCandidates);
      return { messageId: msgId, encKeyBase64 };
    } catch (err) {
      console.error("[WA] sendPoll error:", err);
      return { messageId: null, encKeyBase64: null };
    }
  }

  registerPoll(pollMsgId: string, groupId: string, options: string[], encKeyBase64?: string | null): void {
    const encKey = encKeyBase64 ? Buffer.from(encKeyBase64, "base64") : undefined;
    this._upsertPollEntry(pollMsgId, groupId, options, encKey);
  }

  getMessages(userId: string, waJid: string, limit = 100): WAInMemoryMessage[] {
    const s = this.sessions.get(userId);
    if (!s) return [];
    const msgs = s.waMessages.get(waJid) ?? [];
    return msgs.slice(-limit);
  }

  async sendText(userId: string, jid: string, text: string): Promise<void> {
    const s = this.sessions.get(userId);
    if (!s?.socket || s.status !== "connected") return;
    try { await s.socket.sendMessage(jid, { text }); }
    catch (err) { console.error("[WA] sendText error:", err); }
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
