-- Restore Nookly seller plans and START99 after temporary retirement.
UPDATE seller_subscription_promotions
SET active = true, discount_amount_minor = 9900, max_redemptions = 5
WHERE code = 'START99';

INSERT INTO seller_subscription_promotions(code, discount_amount_minor, max_redemptions, active)
VALUES ('START99', 9900, 5, true)
ON CONFLICT (code) DO UPDATE SET
  discount_amount_minor = EXCLUDED.discount_amount_minor,
  max_redemptions = EXCLUDED.max_redemptions,
  active = true;
