-- Tillåt notistypen 'payment_verified' (Discord-notis när admin verifierat en betalning).
alter table notification_log drop constraint if exists notification_log_kind_check;
alter table notification_log add constraint notification_log_kind_check
  check (kind in ('order_created', 'payment_reported', 'payment_verified'));
