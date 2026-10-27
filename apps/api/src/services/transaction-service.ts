import type { PoolClient } from "pg";

export class TransactionService {
  static async recordSellerSale(
    db: PoolClient,
    input: {
      sellerId: string;
      orderId: string;
      amountMinor: number;
      currency: string;
    },
  ) {
    return db.query(
      `insert into ledger_entries(
         seller_id, order_id, type, amount_minor, currency, description
       )
       values($1,$2,'sale',$3,$4,'Продажа через Nookly')
       on conflict (order_id,seller_id,type)
       where order_id is not null
       do nothing`,
      [input.sellerId, input.orderId, input.amountMinor, input.currency],
    );
  }

  static async recordPlatformCommission(
    db: PoolClient,
    input: {
      orderId: string;
      amountMinor: number;
      currency: string;
    },
  ) {
    return db.query(
      `insert into platform_ledger_entries(
         order_id, type, amount_minor, currency, description
       )
       values($1,'commission',$2,$3,'Комиссия Nookly')
       on conflict (order_id,type)
       where order_id is not null
       do nothing`,
      [input.orderId, input.amountMinor, input.currency],
    );
  }
}
