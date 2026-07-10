import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
