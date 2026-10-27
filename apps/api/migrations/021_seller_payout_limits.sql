-- 021 seller payout limits and destination metadata
alter table payouts add column if not exists payout_destination text;
alter table payouts add column if not exists destination_last4 varchar(4);
alter table payouts add column if not exists requested_at timestamptz not null default now();

create index if not exists idx_payouts_seller_requested
  on payouts(seller_id,requested_at desc);
