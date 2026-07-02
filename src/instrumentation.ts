export async function register() {
  // Only run in the Node.js server runtime (not in the Edge runtime or during
  // client-side builds). This triggers the waManager singleton constructor,
  // which calls _reconnectSaved() so WhatsApp sessions reconnect automatically
  // on every server start without waiting for the first API request.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/whatsapp/manager");
  }
}
