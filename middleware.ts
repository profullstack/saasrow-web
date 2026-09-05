import { gate } from "@/lib/crawl-gateway";
import { NextResponse, type NextRequest } from "next/server";
import { trackReferralCode } from "@profullstack/stack/referrals";

export async function middleware(request: NextRequest) {
  // Crawl gateway first: AI training crawlers get 402 Payment Required (or the
  // sales page at /crawl) unless they present a paid pass. People, Googlebot
  // and retrieval crawlers fall through to everything below.
  const answer = await gate(request);
  if (answer) return answer;

  return trackReferralCode(request, NextResponse.next() as any);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
