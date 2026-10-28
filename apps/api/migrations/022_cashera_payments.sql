-- Cashera transaction metadata and webhook idempotency support.
alter table payments add column if not exists provider_external_id text;
alter table payments add column if not exists provider_transaction_uuid text;
alter table payments add column if not exists provider_status text;
alter table payments add column if not exists provider_paid_at timestamptz;
alter table payments add column if not exists provider_created_at timestamptz;
alter table payments add column if not exists provider_updated_at timestamptz;

create unique index if not exists uq_payments_cashera_external_id
  on payments(provider,provider_external_id)
  where provider='cashera' and provider_external_id is not null;

create unique index if not exists uq_payments_cashera_transaction_uuid
  on payments(provider,provider_transaction_uuid)
  where provider='cashera' and provider_transaction_uuid is not null;

create index if not exists idx_payments_cashera_status
  on payments(provider,provider_status,provider_updated_at desc)
  where provider='cashera';
