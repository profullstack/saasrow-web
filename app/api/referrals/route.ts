import { NextResponse } from "next/server";
import { createCode, validateCode } from "@profullstack/referrals";
import { referralStore } from "@/lib/referrals";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  if (action === "validate") {
    const code = searchParams.get("ref");
    if (!code) return NextResponse.json({ error: "Missing ref" }, { status: 400 });
    const record = await validateCode(code, referralStore);
    return NextResponse.json({ valid: !!record, code: record ?? null });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(req: Request) {
  const body = await req.json() as Record<string, unknown>;
  if (body["action"] === "create") {
    const ownerId = typeof body["ownerId"] === "string" ? body["ownerId"] : null;
    if (!ownerId) return NextResponse.json({ error: "Missing ownerId" }, { status: 400 });
    const code = await createCode(ownerId, referralStore);
    return NextResponse.json({ code });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
