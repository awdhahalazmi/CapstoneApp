import { NextRequest } from "next/server";
import { waManager } from "@/lib/whatsapp/manager";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return new Response("Missing userId", { status: 400 });

  waManager.startSession(userId).catch(console.error);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* stream closed */ }
      };

      if (waManager.getStatus(userId) === "connected") {
        send({ type: "connected" });
        controller.close();
        return;
      }

      const currentQR = waManager.getCurrentQR(userId);
      if (currentQR) {
        const img = await QRCode.toDataURL(currentQR, { width: 280, margin: 2 });
        send({ type: "qr", image: img });
      }

      const cleanups: (() => void)[] = [];

      const offQR = waManager.onQR(userId, async (raw) => {
        const img = await QRCode.toDataURL(raw, { width: 280, margin: 2 });
        send({ type: "qr", image: img });
      });
      cleanups.push(offQR);

      const timer = setTimeout(() => {
        send({ type: "timeout" });
        try { controller.close(); } catch { /* already closed */ }
        cleanups.forEach((fn) => fn());
      }, 3 * 60_000);
      cleanups.push(() => clearTimeout(timer));

      req.signal.addEventListener("abort", () => {
        cleanups.forEach((fn) => fn());
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
