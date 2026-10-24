-- Seller count is intentionally unlimited.
drop trigger if exists trg_chipok_seller_limit on seller_profiles;
drop function if exists chipok_enforce_seller_limit();
