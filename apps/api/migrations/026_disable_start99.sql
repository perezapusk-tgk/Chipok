-- Retire START99 and legacy seller subscriptions. Nookly has no seller plans.
UPDATE seller_subscription_promotions SET active = false WHERE code = 'START99';
UPDATE seller_subscriptions SET status = 'cancelled', updated_at = now() WHERE status IN ('pending','active');
