-- Crypto Pay invoice metadata and idempotent provider lookup.
alter table payments add column if not exists provider_invoice_id text;
alter table payments add column if not exists provider_payload jsonb;
create unique index if not exists uq_payments_provider_invoice_id
  on payments(provider,provider_invoice_id)
  where provider_invoice_id is not null;
create index if not exists idx_payments_provider_payment_id
  on payments(provider,provider_payment_id)
  where provider_payment_id is not null;
