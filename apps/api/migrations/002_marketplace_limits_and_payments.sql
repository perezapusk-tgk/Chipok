create table if not exists platform_ledger_entries(
 id uuid primary key default gen_random_uuid(),
 order_id uuid references orders(id),
 type text not null,
 amount_minor bigint not null,
 currency char(3) not null,
 description text,
 created_at timestamptz not null default now()
);
create index if not exists idx_platform_ledger_created on platform_ledger_entries(created_at desc);

alter table payments add column if not exists payload text;
alter table payments add column if not exists telegram_charge_id text;
alter table payments add column if not exists provider_charge_id text;

create or replace function chipok_enforce_seller_limit() returns trigger language plpgsql as $$
begin
 perform pg_advisory_xact_lock(782315);
 if (select count(*) from seller_profiles) >= 15 then
   raise exception 'SELLER_LIMIT_REACHED';
 end if;
 return new;
end $$;

drop trigger if exists trg_chipok_seller_limit on seller_profiles;
create trigger trg_chipok_seller_limit before insert on seller_profiles for each row execute function chipok_enforce_seller_limit();
