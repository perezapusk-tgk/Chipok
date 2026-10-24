create unique index if not exists idx_chat_threads_buyer_seller_product
on chat_threads(buyer_id,seller_id,product_id);
create unique index if not exists idx_reviews_order_item_buyer
on reviews(order_item_id,buyer_id);
create index if not exists idx_seller_orders_seller_status
on seller_orders(seller_id,status,created_at desc);
create index if not exists idx_products_seller_status
on products(seller_id,status,created_at desc);
create index if not exists idx_orders_buyer_created
on orders(buyer_id,created_at desc);
