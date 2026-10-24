import { pool, withTransaction } from "../src/db.js";

async function expireUnpaidOrders(){
  const result=await withTransaction(async(c)=>{
    const expired=(await c.query("select id from orders where status='created' and expires_at is not null and expires_at<=now() for update skip locked")).rows.map((x:any)=>x.id);
    if(!expired.length)return 0;
    await c.query("update inventory i set reserved=greatest(0,i.reserved-oi.quantity),updated_at=now() from order_items oi join seller_orders so on so.id=oi.seller_order_id where so.order_id=any($1::uuid[]) and so.status='created' and oi.product_id=i.product_id",[expired]);
    await c.query("update seller_orders set status='cancelled' where order_id=any($1::uuid[]) and status='created'",[expired]);
    await c.query("update payments set status='expired',updated_at=now() where order_id=any($1::uuid[]) and status='pending'",[expired]);
    await c.query("update orders set status='cancelled',updated_at=now() where id=any($1::uuid[]) and status='created'",[expired]);
    await c.query("insert into notifications(user_id,type,title,body) select buyer_id,'order_expired','Заказ отменён','Время ожидания оплаты истекло, резерв товара снят.' from orders where id=any($1::uuid[])",[expired]);
    return expired.length;
  });
  console.log(JSON.stringify({ok:true,expired:result}));
}

expireUnpaidOrders().catch(async(error)=>{console.error(error);await pool.end();process.exitCode=1}).finally(async()=>{await pool.end()});
