-- Retire the START99 seller promotion; free Standard remains available.
UPDATE seller_subscription_promotions
SET active = false
WHERE code = 'START99';
