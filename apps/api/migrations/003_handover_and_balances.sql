create table if not exists handover_codes(
 id uuid primary key default gen_random_uuid(),
 seller_order_id uuid not null unique references seller_orders(id) on delete cascade,
 code_hash text not null,
 used_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists idx_handover_seller_order on handover_codes(seller_order_id);
alter table payments add column if not exists paid_at timestamptz;
