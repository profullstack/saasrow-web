import { clientIp, createGateway } from "@profullstack/x402-gateway";
import { x402Proxy } from "@profullstack/x402-gateway/next";

/**
 * Sells crawl access to AI training crawlers (GPTBot, ClaudeBot, CCBot,
 * meta-externalagent, Bytespider, Applebot-Extended, ...) by the day over
 * x402, settled by CoinPay in USDC. People, Googlebot and the retrieval
 * crawlers behind AI search pass through untouched.
 *
 * Runs inside the middleware, so nothing here may import Node-only modules.
 * The env is read through a non-literal key on purpose: Next inlines
 * `process.env.NAME` at build time, and these are runtime secrets. Without
 * COINPAY_X402_KEY and CRAWL_PAY_TO the gateway still answers training
 * crawlers with 402, just with an empty offer.
 */
const env = (name: string) => process.env[name];

/** The anonymous submit form posts here; reads of the same path are not metered. */
export const SUBMIT_PATH = "/api/fn/submissions";

/**
 * Free listing submissions per address per day. On 2026-10-04 one operator
 * posted ~140 listings at about one a minute, alphabetically through a list of
 * domains, with a fresh contact email on every one, so the email cannot be the
 * key. A real submitter lists a handful; past this the caller is offered a
 * pass instead.
 */
export const SUBMIT_DAILY_LIMIT = 10;

/** Quota key for a request: only a submission (POST) by a known address counts. */
export function submitQuotaKey(request: Request): string | null {
  if (request.method !== "POST") return null;
  const ip = clientIp(request);
  return ip ? `submit:${ip}` : null;
}

export const gateway = createGateway({
  siteUrl: env("SITE_URL") || env("NEXT_PUBLIC_SITE_URL") || "https://saasrow.com",
  siteName: "saasrow",
  coinpay: { apiKey: env("COINPAY_X402_KEY") },
  payTo: env("CRAWL_PAY_TO"),
  contact: "mailto:support@saasrow.com",
  freeQuota: {
    requests: SUBMIT_DAILY_LIMIT,
    windowSeconds: 24 * 60 * 60,
    paths: [SUBMIT_PATH],
    identify: submitQuotaKey,
  },
  benefits: ["Crawl every listing", `More than ${SUBMIT_DAILY_LIMIT} listing submissions a day`],
});

/** Resolves to a Response for a refused crawler, or undefined to carry on. */
export const gate = x402Proxy(gateway);
