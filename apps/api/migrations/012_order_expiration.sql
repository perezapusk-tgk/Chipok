alter table orders add column if not exists expires_at timestamptz;
update orders set expires_at=created_at+interval '30 minutes' where status='created' and expires_at is null;
create index if not exists idx_orders_expiration on orders(status,expires_at) where status='created';
