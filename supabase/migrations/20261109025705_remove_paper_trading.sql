-- Retire the removed Trading page and its public report storage.
-- RESTRICT prevents this cleanup from removing any dependent objects.
drop table if exists public.paper_trading_reports restrict;
