-- Seller-to-buyer direct payment instructions. Nookly never holds product funds.
ALTER TABLE seller_profiles
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'sbp',
  ADD COLUMN IF NOT EXISTS payment_details text,
  ADD COLUMN IF NOT EXISTS payment_recipient text,
  ADD COLUMN IF NOT EXISTS payment_bank text,
  ADD COLUMN IF NOT EXISTS payment_link text;
