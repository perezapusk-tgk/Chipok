-- Refund state machine for provider-backed refunds.
create table if not exists refunds(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references orders(id) on delete cascade,
 payment_id uuid references payments(id) on delete set null,
 amount_minor bigint not null check(amount_minor>0),
 currency char(3) not null,
 status text not null default 'pending',
 provider_refund_id text,
 reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz
);

create index if not exists idx_refunds_status_created on refunds(status,created_at desc);
create unique index if not exists uq_refunds_provider_refund_id on refunds(provider_refund_id) where provider_refund_id is not null;
