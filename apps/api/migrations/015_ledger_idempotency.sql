-- Idempotency constraints for financial ledger entries.
delete from ledger_entries a using ledger_entries b
where a.order_id is not null and a.order_id=b.order_id and a.seller_id=b.seller_id and a.type=b.type and a.id>b.id;

delete from platform_ledger_entries a using platform_ledger_entries b
where a.order_id is not null and a.order_id=b.order_id and a.type=b.type and a.id>b.id;

create unique index if not exists uq_ledger_order_seller_type
  on ledger_entries(order_id,seller_id,type)
  where order_id is not null;

create unique index if not exists uq_platform_ledger_order_type
  on platform_ledger_entries(order_id,type)
  where order_id is not null;
