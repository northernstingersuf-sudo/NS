-- Tillåt paid → shipped direkt (packa-steget är valfritt). Övriga övergångar och lagerlogik är oförändrade.
create or replace function public.admin_update_order(p_order_id uuid, p_status order_status default null, p_tracking text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_item record;
  v_tracking text := nullif(trim(coalesce(p_tracking, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_tracking is not null and char_length(v_tracking) > 80 then
    raise exception 'invalid_tracking' using errcode = '22023';
  end if;

  if p_status is not null and p_status <> v_order.status then
    -- 'paid' sätts bara av admin_verify_payment, 'refunded' bara av admin_register_refund.
    if not (
      (v_order.status = 'paid'    and p_status in ('packed', 'shipped')) or
      (v_order.status = 'packed'  and p_status = 'shipped') or
      (v_order.status = 'shipped' and p_status = 'delivered') or
      (v_order.status in ('pending', 'paid', 'packed') and p_status = 'cancelled')
    ) then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;

    if p_status = 'shipped' then
      -- Skarpt saldo: dra av lagret och frigör reservationen.
      for v_item in select product_id, quantity from order_items where order_id = v_order.id and stock_reserved and product_id is not null loop
        update inventory set quantity = quantity - v_item.quantity, reserved = greatest(reserved - v_item.quantity, 0), updated_at = now()
         where product_id = v_item.product_id;
      end loop;
      update order_items set stock_reserved = false where order_id = v_order.id;
    elsif p_status = 'cancelled' then
      for v_item in select product_id, quantity from order_items where order_id = v_order.id and stock_reserved and product_id is not null loop
        update inventory set reserved = greatest(reserved - v_item.quantity, 0), updated_at = now() where product_id = v_item.product_id;
      end loop;
      update order_items set stock_reserved = false where order_id = v_order.id;
      update payments set status = 'cancelled' where order_id = v_order.id and status = 'initiated';
      if v_order.discount_code is not null then
        update discounts set used = greatest(used - 1, 0) where lower(code) = lower(v_order.discount_code);
      end if;
    end if;

    update orders set status = p_status, updated_at = now(), tracking_number = coalesce(v_tracking, tracking_number) where id = v_order.id;
    insert into order_events (order_id, actor, kind, detail)
    values (v_order.id, auth.uid(), 'status_changed', jsonb_build_object('from', v_order.status, 'to', p_status, 'tracking', v_tracking));
    insert into audit_logs (actor, action, target, meta)
    values (auth.uid(), 'order.status_changed', v_order.id::text, jsonb_build_object('order_number', v_order.order_number, 'from', v_order.status, 'to', p_status));
  elsif v_tracking is not null and v_tracking is distinct from v_order.tracking_number then
    update orders set tracking_number = v_tracking, updated_at = now() where id = v_order.id;
    insert into order_events (order_id, actor, kind, detail)
    values (v_order.id, auth.uid(), 'tracking_set', jsonb_build_object('tracking', v_tracking));
    insert into audit_logs (actor, action, target, meta)
    values (auth.uid(), 'order.tracking_set', v_order.id::text, jsonb_build_object('order_number', v_order.order_number));
  end if;
end;
$$;

revoke all on function public.admin_update_order(uuid, order_status, text) from public, anon;
grant execute on function public.admin_update_order(uuid, order_status, text) to authenticated;
