// Pairing-code flow removed — using QR scan instead
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function POST() {
  return NextResponse.json({ error: "Use QR scan at /groups/connect instead." }, { status: 410 });
}
