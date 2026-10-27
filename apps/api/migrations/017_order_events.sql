create table if not exists order_events(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  seller_order_id uuid references seller_orders(id) on delete set null,
  actor_id uuid references users(id) on delete set null,
  event_type text not null,
  old_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_events_order_created
  on order_events(order_id, created_at desc);

create index if not exists idx_order_events_seller_order_created
  on order_events(seller_order_id, created_at desc);
