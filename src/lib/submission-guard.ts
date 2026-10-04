import { createCampaignDetector } from "@profullstack/form-guard";
import { clientIp } from "@profullstack/x402-gateway";
import { SUBMIT_PATH } from "./crawl-gateway";

/**
 * Catches a submission campaign: one address listing a different domain a
 * minute (2026-10-04: 153 listings, alphabetical, a fresh hello@<domain> on
 * each), or the same pattern spread across rotating addresses.
 *
 * `ban` answers 403, which is what the ThreatCrush rule
 * `saasrow-submission-campaign` on dev2 bans the address for: a 200 drop
 * would be invisible to it. `hold` is only logged; the listing still lands as
 * pending and a person approves it. Runs in the middleware, so edge-safe only.
 */
export const campaigns = createCampaignDetector();

export async function screenSubmission(request: Request): Promise<Response | null> {
  if (request.method !== "POST" || new URL(request.url).pathname !== SUBMIT_PATH) return null;

  let body: { title?: unknown; url?: unknown; email?: unknown } = {};
  try {
    body = await request.clone().json();
  } catch {
    return null; // the edge function answers a malformed body itself
  }

  const ip = clientIp(request);
  const verdict = await campaigns.observe({
    ip,
    email: typeof body.email === "string" ? body.email : "",
    url: typeof body.url === "string" ? body.url : "",
    name: typeof body.title === "string" ? body.title : "",
  });

  if (verdict.level === "ok") return null;
  console.warn(`[submission-guard] ${verdict.level} ip=${ip} signals=${verdict.signals.join(",")} ipDomains=${verdict.ipDomains} campaign=${verdict.campaignCount}`);
  if (verdict.level !== "ban") return null;

  return new Response(
    JSON.stringify({ error: "Submissions from this network are blocked. Contact support@saasrow.com if this is a mistake." }),
    { status: 403, headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}
