import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pool, withTransaction } from "./db.js";
import { validateTelegramInitData } from "./telegram.js";
import { answerPreCheckout, createTelegramInvoiceLink } from "./telegram-payments.js";
const app=Fastify({logger:true}); await app.register(cors,{origin:true});
function env(key:string){const v=process.env[key];if(!v) throw new Error(`Missing ${key}`);return v}
async function auth(request:any){
 const header=request.headers.authorization as string|undefined; const raw=header?.startsWith("tma ")?header.slice(4):"";
 if(!raw) throw Object.assign(new Error("Unauthorized"),{statusCode:401});
 const user=validateTelegramInitData(raw,env("TELEGRAM_BOT_TOKEN"),Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE||86400));
 const r=await pool.query(`insert into users(telegram_id,first_name,last_name,username,language_code,is_premium) values($1,$2,$3,$4,$5,$6) on conflict(telegram_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,username=excluded.username,language_code=excluded.language_code,is_premium=excluded.is_premium,updated_at=now() returning id,telegram_id,first_name,last_name,username,language_code,is_premium,role`,[user.id,user.first_name,user.last_name??null,user.username??null,user.language_code??null,user.is_premium??false]);
 return r.rows[0];
}
app.get("/health",async()=>({ok:true,service:"chipok-api",version:"0.3.0"}));
app.get("/api/me",async(req)=>({user:await auth(req)}));
app.post("/api/auth/telegram",async(req)=>({user:await auth(req)}));
app.get("/api/categories",async()=>({items:(await pool.query("select id,name,slug,parent_id,restricted,age_restriction from categories order by name")).rows}));
app.get("/api/catalog",async(req)=>{
 const q=z.object({search:z.string().trim().max(100).optional(),categoryId:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(50).default(20),offset:z.coerce.number().int().min(0).default(0)}).parse(req.query);
 const values:any[]=[];const where:string[]=[`p.status='published'`];
 if(q.search){values.push(`%${q.search}%`);where.push(`(p.title ilike $${values.length} or coalesce(p.description,'') ilike $${values.length})`)}
 if(q.categoryId){values.push(q.categoryId);where.push(`p.category_id=$${values.length}`)} values.push(q.limit,q.offset);
 const r=await pool.query(`select p.id,p.title,p.price_minor,p.currency,p.seller_id,p.category_id,i.stock-i.reserved as available_stock,pi.url as image_url from products p join inventory i on i.product_id=p.id left join lateral(select url from product_images where product_id=p.id order by sort_order,id limit 1) pi on true where ${where.join(" and ")} and i.stock-i.reserved>0 order by p.created_at desc limit $${values.length-1} offset $${values.length}`,values);
 return {items:r.rows,nextCursor:r.rows.length===q.limit?q.offset+q.limit:null};
});
app.get("/api/products/:id",async(req,reply)=>{
 const id=z.string().uuid().parse((req.params as any).id);
 const r=await pool.query(`select p.*,s.name as store_name,s.seller_id,i.stock-i.reserved as available_stock,coalesce((select json_agg(json_build_object('id',x.id,'url',x.url,'sort_order',x.sort_order) order by x.sort_order,x.id) from product_images x where x.product_id=p.id),'[]') as images from products p left join stores s on s.id=p.store_id join inventory i on i.product_id=p.id where p.id=$1`,[id]);
 if(!r.rowCount)return reply.code(404).send({error:"Product not found"});return {product:r.rows[0]};
});
app.post("/api/orders",async(req,reply)=>{
 const buyer=await auth(req); const body=z.object({items:z.array(z.object({productId:z.string().uuid(),quantity:z.number().int().min(1).max(100)})).min(1).max(100)}).parse(req.body);
 const order=await withTransaction(async(c)=>{
  const bps=Math.max(0,Math.min(10000,Number(process.env.PLATFORM_COMMISSION_BPS||500)));
  const o=(await c.query("insert into orders(buyer_id,status,total_minor,platform_fee_minor) values($1,'created',0,0) returning id",[buyer.id])).rows[0];
  const groups=new Map<string,any>();let total=0,feeTotal=0;
  for(const item of body.items){
   const p=(await c.query(`select p.id,p.seller_id,p.title,p.price_minor,p.currency,p.fulfillment_type,i.stock,i.reserved from products p join inventory i on i.product_id=p.id where p.id=$1 and p.status='published' for update`,[item.productId])).rows[0];
   if(!p)throw Object.assign(new Error("Product unavailable"),{statusCode:409});
   if(p.stock-p.reserved<item.quantity)throw Object.assign(new Error("Insufficient stock"),{statusCode:409});
   const line=Number(p.price_minor)*item.quantity,fee=Math.floor(line*bps/10000);total+=line;feeTotal+=fee;
   const g=groups.get(p.seller_id)||{sellerId:p.seller_id,subtotal:0,fee:0,fulfillment:p.fulfillment_type,items:[]};g.subtotal+=line;g.fee+=fee;g.items.push({...item,title:p.title,price:Number(p.price_minor)});groups.set(p.seller_id,g);
   await c.query("update inventory set reserved=reserved+$1,updated_at=now() where product_id=$2",[item.quantity,p.id]);
  }
  await c.query("update orders set total_minor=$1,platform_fee_minor=$2,updated_at=now() where id=$3",[total,feeTotal,o.id]);
  for(const g of groups.values()){const so=(await c.query(`insert into seller_orders(order_id,seller_id,subtotal_minor,platform_fee_minor,seller_amount_minor,fulfillment_type) values($1,$2,$3,$4,$3-$4,$5) returning id`,[o.id,g.sellerId,g.subtotal,g.fee,g.fulfillment])).rows[0];for(const item of g.items)await c.query("insert into order_items(seller_order_id,product_id,title_snapshot,unit_price_minor,quantity,total_minor) values($1,$2,$3,$4,$5,$6)",[so.id,item.productId,item.title,item.price,item.quantity,item.price*item.quantity]);}
  return {id:o.id,totalMinor:total,platformFeeMinor:feeTotal};
 }); return reply.code(201).send({order});
});
app.post("/api/orders/:id/payment",async(req,reply)=>{
 const buyer=await auth(req);const id=z.string().uuid().parse((req.params as any).id);
 const order=(await pool.query(`select o.id,o.total_minor,o.currency,o.status,o.buyer_id,coalesce(min(oi.title_snapshot),'Заказ ЧИПОК') as first_title from orders o left join seller_orders so on so.order_id=o.id left join order_items oi on oi.seller_order_id=so.id where o.id=$1 group by o.id`,[id])).rows[0];
 if(!order||order.buyer_id!==buyer.id)return reply.code(404).send({error:"Order not found"});
 if(order.status!=="created")return reply.code(409).send({error:"Order is not payable"});
 const payload=`chipok:${id}:${randomUUID()}`; const invoiceLink=await createTelegramInvoiceLink({title:`ЧИПОК · ${String(order.first_title).slice(0,24)}`,description:`Оплата заказа ${id}`,payload,amountMinor:Number(order.total_minor),currency:order.currency});
 await pool.query(`insert into payments(order_id,provider,provider_payment_id,status,amount_minor,currency,payload) values($1,'telegram',null,'pending',$2,$3,$4) on conflict(order_id) do update set provider='telegram',status='pending',amount_minor=excluded.amount_minor,currency=excluded.currency,payload=excluded.payload,updated_at=now()`,[id,order.total_minor,order.currency,payload]);
 return {invoiceLink};
});
app.post("/api/payments/telegram/webhook",async(req,reply)=>{
 const secret=process.env.TELEGRAM_PAYMENT_WEBHOOK_SECRET;if(secret&&req.headers["x-telegram-bot-api-secret-token"]!==secret)return reply.code(401).send({error:"Unauthorized"});
 const update:any=req.body;
 if(update.pre_checkout_query){
  const q=update.pre_checkout_query;const payment=(await pool.query(`select p.amount_minor,p.currency,o.status from payments p join orders o on o.id=p.order_id where p.payload=$1`,[q.invoice_payload])).rows[0];
  const ok=!!payment&&payment.status==="created"&&Number(payment.amount_minor)===Number(q.total_amount)&&payment.currency===q.currency;
  await answerPreCheckout(String(q.id),ok,ok?undefined:"Заказ недоступен или сумма изменилась.");
 }
 if(update.message?.successful_payment){
  const sp=update.message.successful_payment;const payload=sp.invoice_payload;
  await withTransaction(async(c)=>{
   const p=(await c.query(`select p.*,o.buyer_id,o.status as order_status from payments p join orders o on o.id=p.order_id where p.payload=$1 for update`,[payload])).rows[0];if(!p||p.order_status!=="created")return;
   const u=(await c.query("select id from users where telegram_id=$1",[update.message.from?.id])).rows[0];if(!u||u.id!==p.buyer_id)throw new Error("Payment buyer mismatch");
   if(Number(p.amount_minor)!==Number(sp.total_amount)||p.currency!==sp.currency)throw new Error("Payment amount mismatch");
   const eventId=String(sp.telegram_payment_charge_id||sp.provider_payment_charge_id);
   const inserted=await c.query(`insert into payment_transactions(payment_id,idempotency_key,provider_event_id,event_type,payload) values($1,$2,$3,'successful_payment',$4) on conflict(idempotency_key) do nothing`,[p.id,`telegram:${eventId}`,eventId,sp]);if(!inserted.rowCount)return;
   await c.query("update payments set status='paid',provider_payment_id=$1,telegram_charge_id=$2,provider_charge_id=$3,updated_at=now() where id=$4",[sp.provider_payment_charge_id||null,sp.telegram_payment_charge_id||null,sp.provider_payment_charge_id||null,p.id]);
   await c.query("update orders set status='paid',updated_at=now() where id=$1",[p.order_id]);
   await c.query("update seller_orders set status='paid' where order_id=$1",[p.order_id]);
   const sellers=await c.query("select seller_id,seller_amount_minor,platform_fee_minor,currency from seller_orders where order_id=$1",[p.order_id]);
   for(const s of sellers.rows){await c.query("insert into ledger_entries(seller_id,order_id,type,amount_minor,currency,description) values($1,$2,'sale',$3,$4,'Продажа через ЧИПОК'),($1,$2,'commission',-$5,$4,'Комиссия ЧИПОК 5%')",[s.seller_id,p.order_id,s.seller_amount_minor,s.currency,s.platform_fee_minor]);}
   const fee=(await c.query("select platform_fee_minor,currency from orders where id=$1",[p.order_id])).rows[0];await c.query("insert into platform_ledger_entries(order_id,type,amount_minor,currency,description) values($1,'commission',$2,$3,'Комиссия ЧИПОК')",[p.order_id,fee.platform_fee_minor,fee.currency]);
  });
 }
 return {ok:true};
});
app.setErrorHandler((error,req,reply)=>{req.log.error(error);const status=(error as any).statusCode??(error.name==="ZodError"?400:500);reply.code(status).send({error:status===500?"Internal server error":error.message})});
await app.listen({host:"0.0.0.0",port:Number(process.env.PORT||3001)});