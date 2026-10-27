import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { TransactionService } from "./transaction-service.js";

function hashHandover(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export class OrderService {
  static async complete_order(
    db: PoolClient,
    input: {
      sellerId: string;
      sellerOrderId: string;
      handoverCode: string;
    },
  ) {
    const { sellerId, sellerOrderId, handoverCode } = input;

    // The caller MUST execute this method inside one SQL transaction.
    // This row lock prevents two concurrent completion requests from
    // crediting the seller twice.
    const sellerOrderResult = await db.query(
      `select so.*,
              o.id as order_id,
              o.buyer_id,
              o.currency as order_currency
         from seller_orders so
         join orders o on o.id = so.order_id
        where so.id=$1 and so.seller_id=$2
        for update`,
      [sellerOrderId, sellerId],
    );

    const sellerOrder = sellerOrderResult.rows[0];
    if (!sellerOrder) return null;

    if (sellerOrder.status === "completed") {
      throw Object.assign(new Error("Order is already completed"), {
        statusCode: 409,
      });
    }

    if (sellerOrder.status !== "ready_for_handover") {
      throw Object.assign(new Error("Order is not ready for handover"), {
        statusCode: 409,
      });
    }

    const handoverResult = await db.query(
      "select * from handover_codes where seller_order_id=$1 for update",
      [sellerOrderId],
    );
    const handover = handoverResult.rows[0];

    if (
      !handover ||
      handover.used_at ||
      hashHandover(handoverCode) !== handover.code_hash
    ) {
      throw Object.assign(new Error("Invalid handover code"), {
        statusCode: 403,
      });
    }

    const oldSellerStatus = sellerOrder.status;

    await db.query(
      "update handover_codes set used_at=now() where id=$1",
      [handover.id],
    );

    await db.query(
      "update seller_orders set status='completed' where id=$1",
      [sellerOrderId],
    );

    await db.query(
      `update orders
          set status=case
            when not exists(
              select 1 from seller_orders
               where order_id=$1 and status<>'completed'
            ) then 'completed'
            when exists(
              select 1 from seller_orders
               where order_id=$1 and status='seller_confirmed'
            ) then 'seller_confirmed'
            when not exists(
              select 1 from seller_orders
               where order_id=$1
                 and status not in ('ready_for_handover','completed')
            ) then 'ready_for_handover'
            else status
          end,
          updated_at=now()
        where id=$1`,
      [sellerOrder.order_id],
    );

    await db.query(
      `update inventory i
          set reserved=reserved-oi.quantity,
              stock=stock-oi.quantity,
              updated_at=now()
         from order_items oi
        where oi.seller_order_id=$1
          and oi.product_id=i.product_id`,
      [sellerOrderId],
    );

    const orderResult = await db.query(
      "select status,platform_fee_minor,currency from orders where id=$1 for update",
      [sellerOrder.order_id],
    );
    const order = orderResult.rows[0];

    await TransactionService.recordSellerSale(db, {
      sellerId,
      orderId: sellerOrder.order_id,
      amountMinor: Number(sellerOrder.seller_amount_minor),
      currency: order?.currency || sellerOrder.order_currency || "RUB",
    });

    if (order?.status === "completed") {
      await TransactionService.recordPlatformCommission(db, {
        orderId: sellerOrder.order_id,
        amountMinor: Number(order.platform_fee_minor),
        currency: order.currency,
      });
    }

    await db.query(
      "update seller_profiles set completed_sales=completed_sales+1 where user_id=$1",
      [sellerId],
    );

    await db.query(
      `insert into order_events(
         order_id,seller_order_id,actor_id,event_type,old_status,new_status,metadata
       )
       values($1,$2,$3,'completed',$4,'completed',$5)`,
      [
        sellerOrder.order_id,
        sellerOrderId,
        sellerId,
        oldSellerStatus,
        JSON.stringify({
          commissionRecorded: order?.status === "completed",
          sellerAmountMinor: Number(sellerOrder.seller_amount_minor),
          platformFeeMinor: Number(order?.platform_fee_minor || 0),
        }),
      ],
    );

    await db.query(
      `insert into notifications(user_id,type,title,body)
       values($1,'order_completed','Заказ завершён','Получение заказа подтверждено')`,
      [sellerOrder.buyer_id],
    );

    return {
      sellerOrderId,
      orderId: sellerOrder.order_id,
      status: "completed" as const,
      sellerAmountMinor: Number(sellerOrder.seller_amount_minor),
      platformFeeMinor: Number(order?.platform_fee_minor || 0),
    };
  }
}
