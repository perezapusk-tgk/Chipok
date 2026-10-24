create table if not exists admin_actions(
 id uuid primary key default gen_random_uuid(),
 admin_id uuid not null references users(id),
 action text not null,
 target_type text,
 target_id uuid,
 metadata jsonb,
 created_at timestamptz not null default now()
);
create index if not exists idx_admin_actions_created on admin_actions(created_at desc);
