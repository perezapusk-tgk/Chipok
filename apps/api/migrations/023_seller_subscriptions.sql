create table if not exists seller_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 plan text not null check (plan in ('start','standard','plus')),
 status text not null default 'pending' check (status in ('pending','active','expired','cancelled')),
 amount_minor bigint not null check (amount_minor>=0),
 promo_code text,
 payment_method text not null default 'bank_transfer',
 starts_at timestamptz,
 expires_at timestamptz,
 activated_by uuid references users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists seller_subscriptions_user_status_expiry_idx on seller_subscriptions(user_id,status,expires_at desc);
create index if not exists seller_subscriptions_pending_idx on seller_subscriptions(status,created_at) where status='pending';
create table if not exists seller_subscription_promotions (
 code text primary key,
 discount_amount_minor bigint not null check(discount_amount_minor>=0),
 max_redemptions integer not null check(max_redemptions>0),
 redeemed_count integer not null default 0 check(redeemed_count>=0),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
insert into seller_subscription_promotions(code,discount_amount_minor,max_redemptions)
values('START99',9900,5) on conflict(code) do update set max_redemptions=5,active=true;
insert into seller_subscriptions(user_id,plan,status,amount_minor,payment_method,starts_at,expires_at)
select sp.user_id,'standard','active',0,'grandfathered',now(),now()+interval '30 days'
from seller_profiles sp
where not exists(select 1 from seller_subscriptions ss where ss.user_id=sp.user_id and ss.status='active' and ss.expires_at>now())
on conflict do nothing;
