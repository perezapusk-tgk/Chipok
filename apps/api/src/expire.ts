import { pool, withTransaction } from "./db.js";

async function expireUnpaidOrders() {
  await withTransaction(async (c) => {
    const expired = (await c.query(
      "select id from orders where status='created' and expires_at is not null and expires_at<=now() for update skip locked"
    )).rows.map((x: { id: string }) => x.id);
    if (!expired.length) return;
    await c.query(
      "update inventory i set reserved=greatest(0,i.reserved-oi.quantity),updated_at=now() from order_items oi join seller_orders so on so.id=oi.seller_order_id where so.order_id=any($1::uuid[]) and so.status='created' and oi.product_id=i.product_id",
      [expired]
    );
    await c.query("update seller_orders set status='cancelled' where order_id=any($1::uuid[]) and status='created'", [expired]);
    await c.query("update payments set status='expired',updated_at=now() where order_id=any($1::uuid[]) and status='pending'", [expired]);
    await c.query("update orders set status='cancelled',updated_at=now() where id=any($1::uuid[]) and status='created'", [expired]);
    await c.query(
      "insert into notifications(user_id,type,title,body) select buyer_id,'order_expired','Заказ отменён','Время ожидания оплаты истекло, резерв товара снят.' from orders where id=any($1::uuid[])",
      [expired]
    );
  });
}

try {
  await expireUnpaidOrders();
} finally {
  await pool.end();
}
