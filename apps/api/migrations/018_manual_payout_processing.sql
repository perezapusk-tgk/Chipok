alter table payouts add column if not exists processed_by uuid references users(id);
alter table payouts add column if not exists admin_note text;
alter table payouts add column if not exists manual_reference text;
create index if not exists idx_payouts_status_created on payouts(status,created_at desc);
