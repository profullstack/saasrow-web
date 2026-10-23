-- 20261021130000_coinpay_orders.sql revoked anon/authenticated but never granted
-- service_role. Applied as postgres over psql, Supabase's default privileges did
-- not fire, so PostgREST could not see the table ("Could not find the table
-- 'public.coinpay_orders' in the schema cache"): the admin Users tab 500'd and a
-- paid CoinPay webhook could not record its order.
GRANT ALL ON public.coinpay_orders TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

NOTIFY pgrst, 'reload schema';
