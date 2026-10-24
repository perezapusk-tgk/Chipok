# Архитектура ЧИПОК

## Принципы
1. Геолокация не используется.
2. Доставка в MVP отсутствует.
3. Получение: встреча или самовывоз.
4. Клиент Mini App не является источником истины для цены, остатка или платежа.
5. Остаток резервируется атомарно.
6. Комиссия фиксируется на момент заказа.
7. Баланс продавца строится на ledger.
8. Возвраты и споры проходят через финансовый ledger.

## Сущности
users, seller_profiles, stores, categories, products, product_images,
inventory, carts, cart_items, orders, seller_orders, order_items,
payments, payment_transactions, ledger_entries, payouts, reviews,
favorites, chat_threads, chat_messages, offers, disputes, refunds,
notifications, moderation_queue, reports, admin_actions.

## Заказ
created -> paid -> seller_confirmed -> ready_for_handover -> completed

Ветки: paid -> cancelled -> refunded; ready_for_handover -> buyer_no_show/disputed.

## Чат
Покупатель пишет продавцу. Продавец создаёт offer с товаром, согласованной ценой и способом получения. Покупатель оплачивает offer.

## Ограниченные категории
Категории имеют restricted/age/legal flags. Запрещённые товары не публикуются.