-- Fixed RUB checkout quote and external payment-order snapshot.
-- Nookly keeps its accounting in RUB; the USD/USDT amount is only the
-- payment-provider order amount captured at checkout.
alter table orders add column if not exists payment_currency char(3);
alter table orders add column if not exists payment_amount_minor bigint;
alter table orders add column if not exists fx_rate_rub_per_payment numeric(20,8);
alter table orders add column if not exists payment_rate_locked_at timestamptz;

alter table payments add column if not exists payment_currency char(3);
alter table payments add column if not exists payment_amount_minor bigint;
alter table payments add column if not exists fx_rate_rub_per_payment numeric(20,8);
alter table payments add column if not exists invoice_link text;
alter table payments add column if not exists provider_invoice_id text;
alter table payments add column if not exists provider_payload jsonb;

create unique index if not exists uq_payments_provider_invoice
  on payments(provider,provider_invoice_id)
  where provider_invoice_id is not null;

create index if not exists idx_orders_payment_rate
  on orders(payment_currency,payment_rate_locked_at desc);
