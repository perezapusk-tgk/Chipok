alter table payments add column if not exists payload text;
alter table payments add column if not exists telegram_charge_id text;
alter table payments add column if not exists provider_charge_id text;
create unique index if not exists idx_payments_payload on payments(payload) where payload is not null;

create table if not exists platform_ledger_entries(
 id uuid primary key default gen_random_uuid(),
 order_id uuid references orders(id) on delete set null,
 type text not null,
 amount_minor bigint not null,
 currency char(3) not null,
 description text,
 created_at timestamptz not null default now()
);
create index if not exists idx_platform_ledger_created on platform_ledger_entries(created_at desc);
create index if not exists idx_platform_ledger_type on platform_ledger_entries(type,created_at desc);

alter table payouts add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_payouts_seller_status on payouts(seller_id,status,created_at desc);
