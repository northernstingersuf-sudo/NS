-- Sprint 01: atomically reject a purchase if its final total differs from
-- the amount the customer was shown in the server-generated checkout quote.
-- This wrapper and create_order run in ONE PostgreSQL transaction:
-- if the total changed, the exception rolls back all order/stock/discount writes.
-- Apply AFTER 0012_newsletter_double_opt_in.sql, in a separate test project first.
create or replace function public.create_order_checked(
  p_idempotency_key text,
  p_user_id uuid,
  p_email text,
  p_locale text,
  p_shipping_address jsonb,
  p_items jsonb,
  p_expected_total_ore integer,
  p_discount_code text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_expected_total_ore is null or p_expected_total_ore <= 0 then
    raise exception 'invalid_expected_total' using errcode = '22023';
  end if;

  -- Existing create_order remains the authoritative source of pricing,
  -- stock reservations, idempotency, discount usage and shipping.
  v_result := public.create_order(
    p_idempotency_key, p_user_id, p_email, p_locale,
    p_shipping_address, p_items, p_discount_code
  );

  if (v_result->>'total_ore')::integer is distinct from p_expected_total_ore then
    raise exception 'checkout_price_changed' using errcode = 'P0001';
  end if;
  return v_result;
end;
$$;

-- Only the server-side service role may invoke the wrapper.
revoke all on function public.create_order_checked(text, uuid, text, text, jsonb, jsonb, integer, text) from public;
revoke all on function public.create_order_checked(text, uuid, text, text, jsonb, jsonb, integer, text) from anon, authenticated;
grant execute on function public.create_order_checked(text, uuid, text, text, jsonb, jsonb, integer, text) to service_role;
notify pgrst, 'reload schema';
