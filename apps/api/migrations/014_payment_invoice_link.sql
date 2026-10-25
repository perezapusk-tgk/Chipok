alter table payments add column if not exists updated_at timestamptz not null default now();
alter table payouts add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_payments_status_updated on payments(status,updated_at desc);
create index if not exists idx_payouts_status_created on payouts(status,created_at desc);

alter table payments add column if not exists invoice_link text;
