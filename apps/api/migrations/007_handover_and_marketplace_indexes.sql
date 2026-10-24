create table if not exists handover_codes(
 id uuid primary key default gen_random_uuid(),
 seller_order_id uuid not null unique references seller_orders(id) on delete cascade,
 code_hash text not null,
 code_encrypted text,
 created_at timestamptz not null default now(),
 used_at timestamptz
);
create index if not exists idx_handover_seller_order on handover_codes(seller_order_id);
create index if not exists idx_chat_threads_buyer on chat_threads(buyer_id,created_at desc);
create index if not exists idx_chat_threads_seller on chat_threads(seller_id,created_at desc);
create index if not exists idx_favorites_user_created on favorites(user_id,created_at desc);
create index if not exists idx_reviews_product_created on reviews(product_id,created_at desc);
create index if not exists idx_disputes_status_created on disputes(status,created_at desc);
