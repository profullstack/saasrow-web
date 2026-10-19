import { gate } from "@/lib/crawl-gateway";
import { meter } from "@/lib/throttle";
import { screenSubmission } from "@/lib/submission-guard";
import { NextResponse, type NextRequest } from "next/server";
import { trackReferralCode } from "@profullstack/stack/referrals";

export async function middleware(request: NextRequest) {
  // Crawl gateway first: AI training crawlers get 402 Payment Required (or the
  // sales page at /crawl) unless they present a paid pass. People, Googlebot
  // and retrieval crawlers fall through to everything below.
  // A submission campaign is refused (403) before the daily cap, so the
  // address is banned rather than offered a pass.
  const refused = await screenSubmission(request);
  if (refused) return refused;

  const answer = await gate(request);
  if (answer) return answer;

  // Then the site-wide allowance on page routes: 100 requests a minute per
  // caller, and going over is answered 402 with the same offer (lib/throttle).
  const overLimit = await meter(request);
  if (overLimit) return overLimit;

  return trackReferralCode(request, NextResponse.next() as any);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|install.sh$|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
