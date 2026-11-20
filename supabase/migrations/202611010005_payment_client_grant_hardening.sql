-- Keep intended client reads while removing implicit write grants from
-- payment configuration and invoice tables.
revoke all on public.payment_gateways from authenticated;
grant select on public.payment_gateways to authenticated;

revoke all on public.subscription_plans from authenticated;
grant select on public.subscription_plans to authenticated;

revoke all on public.invoices from authenticated;
grant select on public.invoices to authenticated;
