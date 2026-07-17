import { createReferralsClient, createReferralsRouteHandler } from "@profullstack/stack/referrals";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const { GET, POST } = createReferralsRouteHandler({
  store: createReferralsClient({ getClient: () => getSupabaseAdmin() }),
});
