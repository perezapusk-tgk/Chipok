import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { randomUUID, createHash, randomInt, createCipheriv, createDecipheriv } from "node:crypto";
import { pool, withTransaction } from "./db.js";
import { validateTelegramInitData } from "./telegram.js";
import { answerPreCheckout, createTelegramInvoiceLink } from "./telegram-payments.js";
const app=Fastify({logger:true}); await app.register(cors,{origin:true});
function env(key:string){const v=process.env[key];if(!v) throw new Error(`Missing ${key}`);return v}
function hashHandover(code:string){return createHash("sha256").update(code).digest("hex")}
function makeHandoverCode(){return String(randomInt(100000,1000000))}
function handoverKey(){return createHash("sha256").update(env("TELEGRAM_BOT_TOKEN")).digest()}
function encryptHandover(code:string){const iv=Buffer.from(randomUUID().replaceAll("-","").slice(0,24),"hex");const cipher=createCipheriv("aes-256-gcm",handoverKey(),iv);const data=Buffer.concat([cipher.update(code,"utf8"),cipher.final()]);return iv.toString("hex")+":"+cipher.getAuthTag().toString("hex")+":"+data.toString("hex")}
function decryptHandover(value:string){const [ivHex,tagHex,dataHex]=value.split(":");const decipher=createDecipheriv("aes-256-gcm",handoverKey(),Buffer.from(ivHex,"hex"));decipher.setAuthTag(Buffer.from(tagHex,"hex"));return Buffer.concat([decipher.update(Buffer.from(dataHex,"hex")),decipher.final()]).toString("utf8")}
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
  const groups=new Map<string,any>();let total=0,feeTotal=0;let currency:string|null=null;
  for(const item of body.items){
   const p=(await c.query(`select p.id,p.seller_id,p.title,p.price_minor,p.currency,p.fulfillment_type,i.stock,i.reserved from products p join inventory i on i.product_id=p.id where p.id=$1 and p.status='published' for update`,[item.productId])).rows[0];
   if(!p)throw Object.assign(new Error("Product unavailable"),{statusCode:409});
   if(p.stock-p.reserved<item.quantity)throw Object.assign(new Error("Insufficient stock"),{statusCode:409});
   if(currency===null)currency=p.currency;else if(currency!==p.currency)throw Object.assign(new Error('All items in one order must use the same currency'),{statusCode:409}); const line=Number(p.price_minor)*item.quantity,fee=Math.floor(line*bps/10000);total+=line;feeTotal+=fee;
   const g=groups.get(p.seller_id)||{sellerId:p.seller_id,subtotal:0,fee:0,fulfillment:p.fulfillment_type,items:[]};g.subtotal+=line;g.fee+=fee;g.items.push({...item,title:p.title,price:Number(p.price_minor)});groups.set(p.seller_id,g);
   await c.query("update inventory set reserved=reserved+$1,updated_at=now() where product_id=$2",[item.quantity,p.id]);
  }
  await c.query("update orders set total_minor=$1,platform_fee_minor=$2,currency=$3,updated_at=now() where id=$4",[total,feeTotal,currency||'RUB',o.id]);
  for(const g of groups.values()){const so=(await c.query(`insert into seller_orders(order_id,seller_id,subtotal_minor,platform_fee_minor,seller_amount_minor,fulfillment_type) values($1,$2,$3,$4,$3-$4,$5) returning id`,[o.id,g.sellerId,g.subtotal,g.fee,g.fulfillment])).rows[0];for(const item of g.items)await c.query("insert into order_items(seller_order_id,product_id,title_snapshot,unit_price_minor,quantity,total_minor) values($1,$2,$3,$4,$5,$6)",[so.id,item.productId,item.title,item.price,item.quantity,item.price*item.quantity]);}
  return {id:o.id,totalMinor:total,platformFeeMinor:feeTotal};
 }); return reply.code(201).send({order});
});
app.post("/api/seller-orders/:id/confirm",async(req,reply)=>{
 const seller=await auth(req);const id=z.string().uuid().parse((req.params as any).id);
 const result=await withTransaction(async(c)=>{
  const so=(await c.query("select so.*,o.id as order_id,o.status as order_status from seller_orders so join orders o on o.id=so.order_id where so.id=$1 and so.seller_id=$2 for update",[id,seller.id])).rows[0];
  if(!so)return null;
  if(so.order_status!=="paid"||so.status!=="paid")throw Object.assign(new Error("Order is not awaiting seller confirmation"),{statusCode:409});
  const code=makeHandoverCode();
  await c.query("update seller_orders set status='seller_confirmed' where id=$1",[id]);
  await c.query("insert into handover_codes(seller_order_id,code_hash,code_encrypted) values($1,$2,$3)",[id,hashHandover(code),encryptHandover(code)]);
  const pending=await c.query("select count(*)::int as n from seller_orders where order_id=$1 and status not in ('seller_confirmed','ready_for_handover','completed')",[so.order_id]);
  if(Number(pending.rows[0].n)===0)await c.query("update orders set status='seller_confirmed',updated_at=now() where id=$1",[so.order_id]);
  return {sellerOrderId:id,orderId:so.order_id};
 });
 if(!result)return reply.code(404).send({error:"Seller order not found"});
 return result;
});

app.get("/api/orders/:id/handover",async(req,reply)=>{
 const buyer=await auth(req);const id=z.string().uuid().parse((req.params as any).id);
 const r=await pool.query("select so.id as seller_order_id,so.seller_id,so.status,h.created_at,h.used_at,h.code_encrypted from seller_orders so join orders o on o.id=so.order_id left join handover_codes h on h.seller_order_id=so.id where so.order_id=$1 and o.buyer_id=$2 order by so.created_at",[id,buyer.id]);
 if(!r.rowCount)return reply.code(404).send({error:"Order not found"});
 return {items:r.rows.map((x:any)=>({...x,handoverCode:x.code_encrypted&&!x.used_at?decryptHandover(x.code_encrypted):undefined,code_encrypted:undefined}))};
});

app.post("/api/seller-orders/:id/complete",async(req,reply)=>{
 const seller=await auth(req);const id=z.string().uuid().parse((req.params as any).id);
 const body=z.object({code:z.string().regex(/^\d{6}$/)}).parse(req.body);
 const result=await withTransaction(async(c)=>{
  const so=(await c.query("select so.*,o.id as order_id,o.buyer_id from seller_orders so join orders o on o.id=so.order_id where so.id=$1 and so.seller_id=$2 for update",[id,seller.id])).rows[0];
  if(!so)return null;
  if(!["seller_confirmed","ready_for_handover"].includes(so.status))throw Object.assign(new Error("Order is not ready for handover"),{statusCode:409});
  const h=(await c.query("select * from handover_codes where seller_order_id=$1 for update",[id])).rows[0];
  if(!h||h.used_at||hashHandover(body.code)!==h.code_hash)throw Object.assign(new Error("Invalid handover code"),{statusCode:403});
  await c.query("update handover_codes set used_at=now() where id=$1",[h.id]);
  await c.query("update seller_orders set status='completed' where id=$1",[id]);
  await c.query("update orders set status=case when not exists(select 1 from seller_orders where order_id=$1 and status<>'completed') then 'completed' else 'seller_confirmed' end,updated_at=now() where id=$1",[so.order_id]);
  await c.query("update inventory i set reserved=reserved-oi.quantity,stock=stock-oi.quantity,updated_at=now() from order_items oi where oi.seller_order_id=$1 and oi.product_id=i.product_id",[id]);
  const sellerOrder=(await c.query("select seller_id,seller_amount_minor,platform_fee_minor,currency from seller_orders where id=$1",[id])).rows[0];
  const existing=(await c.query("select 1 from ledger_entries where order_id=$1 and seller_id=$2 and type='sale' limit 1",[so.order_id,seller.id])).rowCount;
  if(!existing){
    await c.query("insert into ledger_entries(seller_id,order_id,type,amount_minor,currency,description) values($1,$2,'sale',$3,$4,'Продажа через ЧИПОК'),($1,$2,'commission',-$5,$4,'Комиссия ЧИПОК')",
      [seller.id,so.order_id,Number(sellerOrder.seller_amount_minor)+Number(sellerOrder.platform_fee_minor),sellerOrder.currency,Number(sellerOrder.platform_fee_minor)]);
  }
  await c.query("update seller_profiles set completed_sales=completed_sales+1 where user_id=$1",[seller.id]);
  await c.query("insert into notifications(user_id,type,title,body) values($1,'order_completed','Заказ завершён','Получение заказа подтверждено')",[so.buyer_id]);
  return {sellerOrderId:id,orderId:so.order_id,status:"completed"};
 });
 if(!result)return reply.code(404).send({error:"Seller order not found"});
 return result;
});

app.get("/api/seller/balance",async(req)=>{
 const seller=await auth(req);
 const r=await pool.query("select coalesce(sum(case when type='sale' then amount_minor when type in ('commission','payout') then amount_minor else 0 end),0)::bigint as available from ledger_entries where seller_id=$1",[seller.id]);
 const pending=await pool.query("select coalesce(sum(so.seller_amount_minor),0)::bigint as pending from seller_orders so join orders o on o.id=so.order_id where so.seller_id=$1 and so.status in ('paid','seller_confirmed','ready_for_handover')",[seller.id]);
 const x=r.rows[0];return {currency:"RUB",availableMinor:Number(x.available),pendingMinor:Number(pending.rows[0].pending),totalEarnedMinor:Number(x.available)+Number(pending.rows[0].pending)};
});

app.get("/api/admin/platform-balance",async(req,reply)=>{
 const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});
 const r=await pool.query("select currency,coalesce(sum(amount_minor),0)::bigint as balance from platform_ledger_entries group by currency");
 return {balances:r.rows.map(x=>({currency:x.currency,balanceMinor:Number(x.balance)}))};
});

app.post("/api/seller/payouts",async(req,reply)=>{
 const seller=await auth(req); if(seller.role!=="seller"&&seller.role!=="admin")return reply.code(403).send({error:"Seller access required"});
 const body=z.object({amountMinor:z.number().int().positive(),currency:z.string().length(3).default("RUB")}).parse(req.body);
 const result=await withTransaction(async(c)=>{
  const available=await c.query("select coalesce(sum(case when type='sale' then amount_minor when type in ('commission','payout') then amount_minor else 0 end),0)::bigint as n from ledger_entries where seller_id=$1",[seller.id]);
  const amount=Number(available.rows[0].n);
  if(body.amountMinor>amount)throw Object.assign(new Error("Insufficient available balance"),{statusCode:409});
  const p=(await c.query("insert into payouts(seller_id,amount_minor,currency,status) values($1,$2,$3,'pending') returning *",[seller.id,body.amountMinor,body.currency.toUpperCase()])).rows[0];
  await c.query("insert into ledger_entries(seller_id,type,amount_minor,currency,description) values($1,'payout',$2,$3,'Заявка на вывод средств')",[seller.id,-body.amountMinor,body.currency.toUpperCase()]);
  return p;
 });
 return reply.code(201).send({payout:result});
});
app.get("/api/seller/payouts",async(req)=>{
 const seller=await auth(req); const r=await pool.query("select id,amount_minor,currency,status,provider_payout_id,created_at,completed_at from payouts where seller_id=$1 order by created_at desc",[seller.id]); return {items:r.rows};
});
app.post("/api/seller/onboard",async(req,reply)=>{
 const user=await auth(req);
 if(user.role==="admin"||user.role==="seller")return {seller:true,role:user.role};
 const body=z.object({storeName:z.string().trim().min(2).max(100),description:z.string().trim().max(1000).optional()}).parse(req.body);
 await withTransaction(async(c)=>{
  await c.query("update users set role='seller',updated_at=now() where id=$1",[user.id]);
  await c.query("insert into seller_profiles(user_id,display_name,description) values($1,$2,$3) on conflict(user_id) do update set display_name=excluded.display_name,description=excluded.description",[user.id,body.storeName,body.description||null]);
  await c.query("insert into stores(seller_id,name,description) values($1,$2,$3) on conflict(seller_id) do update set name=excluded.name,description=excluded.description",[user.id,body.storeName,body.description||null]);
 });
 return {seller:true,role:"seller"};
});
app.post("/api/admin/products/:id/moderate",async(req,reply)=>{
 const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});
 const id=z.string().uuid().parse((req.params as any).id);const body=z.object({action:z.enum(["approve","reject"]),reason:z.string().trim().max(500).optional()}).parse(req.body);
 const status=body.action==="approve"?"published":"rejected";
 await withTransaction(async(c)=>{await c.query("update products set status=$1,updated_at=now() where id=$2",[status,id]);await c.query("update moderation_queue set status=$1,reason=$2,reviewed_by=$3,reviewed_at=now() where product_id=$4",[body.action==="approve"?"approved":"rejected",body.reason||null,admin.id,id]);});
 return {ok:true,status};
});
app.get("/api/favorites",async(req)=>{const user=await auth(req);const r=await pool.query(`select p.id,p.title,p.price_minor,p.currency,pi.url as image_url from favorites f join products p on p.id=f.product_id left join lateral(select url from product_images where product_id=p.id order by sort_order,id limit 1) pi on true where f.user_id=$1 order by f.created_at desc`,[user.id]);return {items:r.rows};});
app.post("/api/favorites/:productId",async(req)=>{const user=await auth(req);const productId=z.string().uuid().parse((req.params as any).productId);const r=await pool.query("insert into favorites(user_id,product_id) values($1,$2) on conflict do nothing returning product_id",[user.id,productId]);return {favorite:!!r.rowCount};});
app.delete("/api/favorites/:productId",async(req)=>{const user=await auth(req);const productId=z.string().uuid().parse((req.params as any).productId);await pool.query("delete from favorites where user_id=$1 and product_id=$2",[user.id,productId]);return {favorite:false};});

app.post("/api/chat/threads",async(req,reply)=>{const user=await auth(req);const body=z.object({sellerId:z.string().uuid(),productId:z.string().uuid().optional()}).parse(req.body);if(body.sellerId===user.id)return reply.code(400).send({error:"Cannot chat with yourself"});const seller=(await pool.query("select id,role from users where id=$1",[body.sellerId])).rows[0];if(!seller||seller.role!=="seller")return reply.code(404).send({error:"Seller not found"});const thread=(await pool.query("insert into chat_threads(buyer_id,seller_id,product_id) values($1,$2,$3) on conflict(buyer_id,seller_id,product_id) do update set created_at=chat_threads.created_at returning *",[user.id,body.sellerId,body.productId||null])).rows[0];return reply.code(201).send({thread});});
app.get("/api/chat/threads",async(req)=>{const user=await auth(req);const r=await pool.query(`select t.*,u.first_name as buyer_name,s.first_name as seller_name,p.title as product_title,(select body from chat_messages m where m.thread_id=t.id order by m.created_at desc limit 1) as last_message from chat_threads t join users u on u.id=t.buyer_id join users s on s.id=t.seller_id left join products p on p.id=t.product_id where t.buyer_id=$1 or t.seller_id=$1 order by t.created_at desc`,[user.id]);return {items:r.rows};});
app.get("/api/chat/threads/:id/messages",async(req,reply)=>{const user=await auth(req);const id=z.string().uuid().parse((req.params as any).id);const t=(await pool.query("select * from chat_threads where id=$1 and (buyer_id=$2 or seller_id=$2)",[id,user.id])).rows[0];if(!t)return reply.code(404).send({error:"Thread not found"});const r=await pool.query("select id,sender_id,body,created_at from chat_messages where thread_id=$1 order by created_at asc",[id]);return {thread:t,messages:r.rows};});
app.post("/api/chat/threads/:id/messages",async(req,reply)=>{const user=await auth(req);const id=z.string().uuid().parse((req.params as any).id);const body=z.object({body:z.string().trim().min(1).max(4000)}).parse(req.body);const t=(await pool.query("select * from chat_threads where id=$1 and (buyer_id=$2 or seller_id=$2)",[id,user.id])).rows[0];if(!t)return reply.code(404).send({error:"Thread not found"});const m=(await pool.query("insert into chat_messages(thread_id,sender_id,body) values($1,$2,$3) returning id,sender_id,body,created_at",[id,user.id,body.body])).rows[0];const recipient=user.id===t.buyer_id?t.seller_id:t.buyer_id;await pool.query("insert into notifications(user_id,type,title,body) values($1,'chat_message','Новое сообщение',$2)",[recipient,body.body.slice(0,180)]);return reply.code(201).send({message:m});});

app.post("/api/chat/threads/:id/offers",async(req,reply)=>{const seller=await auth(req);if(seller.role!=="seller"&&seller.role!=="admin")return reply.code(403).send({error:"Seller access required"});const id=z.string().uuid().parse((req.params as any).id);const body=z.object({productId:z.string().uuid().optional(),title:z.string().trim().min(2).max(120),priceMinor:z.number().int().positive(),currency:z.string().length(3).default("RUB"),quantity:z.number().int().min(1).max(100),fulfillmentType:z.enum(["meeting","pickup"]).default("pickup"),expiresAt:z.string().datetime().optional()}).parse(req.body);const t=(await pool.query("select * from chat_threads where id=$1 and seller_id=$2",[id,seller.id])).rows[0];if(!t)return reply.code(404).send({error:"Thread not found"});const offer=(await pool.query("insert into offers(thread_id,seller_id,buyer_id,product_id,title,price_minor,currency,quantity,fulfillment_type,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *",[id,seller.id,t.buyer_id,body.productId||null,body.title,body.priceMinor,body.currency.toUpperCase(),body.quantity,body.fulfillmentType,body.expiresAt||null])).rows[0];await pool.query("insert into notifications(user_id,type,title,body) values($1,'offer','Новое предложение',$2)",[t.buyer_id,body.title]);return reply.code(201).send({offer});});
app.get("/api/chat/offers",async(req)=>{const user=await auth(req);const r=await pool.query("select * from offers where buyer_id=$1 or seller_id=$1 order by created_at desc",[user.id]);return {items:r.rows};});
app.post("/api/chat/offers/:id/accept",async(req,reply)=>{const buyer=await auth(req);const id=z.string().uuid().parse((req.params as any).id);const offer=(await pool.query("select * from offers where id=$1 and buyer_id=$2 and status='pending' and (expires_at is null or expires_at>now())",[id,buyer.id])).rows[0];if(!offer)return reply.code(404).send({error:"Offer not found or expired"});if(!offer.product_id)return reply.code(400).send({error:"Offer is missing product"});const order=await withTransaction(async(c)=>{const p=(await c.query("select p.id,p.seller_id,p.title,p.price_minor,p.currency,p.fulfillment_type,i.stock,i.reserved from products p join inventory i on i.product_id=p.id where p.id=$1 and p.status='published' for update",[offer.product_id])).rows[0];if(!p||p.seller_id!==offer.seller_id||p.currency!==offer.currency||Number(p.price_minor)!==Number(offer.price_minor)||p.stock-p.reserved<offer.quantity)throw Object.assign(new Error("Offer is no longer available"),{statusCode:409});const bps=Math.max(0,Math.min(10000,Number(process.env.PLATFORM_COMMISSION_BPS||500))),subtotal=Number(offer.price_minor)*offer.quantity,fee=Math.floor(subtotal*bps/10000);const o=(await c.query("insert into orders(buyer_id,status,total_minor,currency,platform_fee_minor) values($1,'created',$2,$3,$4) returning id",[buyer.id,subtotal,p.currency,fee])).rows[0];const so=(await c.query("insert into seller_orders(order_id,seller_id,subtotal_minor,platform_fee_minor,seller_amount_minor,fulfillment_type) values($1,$2,$3,$4,$3-$4,$5) returning id",[o.id,offer.seller_id,subtotal,fee,offer.fulfillment_type])).rows[0];await c.query("insert into order_items(seller_order_id,product_id,title_snapshot,unit_price_minor,quantity,total_minor) values($1,$2,$3,$4,$5,$6)",[so.id,p.id,p.title,offer.price_minor,offer.quantity,subtotal]);await c.query("update inventory set reserved=reserved+$1,updated_at=now() where product_id=$2",[offer.quantity,p.id]);await c.query("update offers set status='accepted' where id=$1",[id]);return {id:o.id,totalMinor:subtotal};});return {order};});

app.post("/api/reviews",async(req,reply)=>{const buyer=await auth(req);const body=z.object({orderItemId:z.string().uuid(),rating:z.number().int().min(1).max(5),text:z.string().trim().max(2000).optional()}).parse(req.body);const review=await withTransaction(async(c)=>{const item=(await c.query(`select oi.id,oi.product_id,so.order_id,so.status,o.buyer_id,p.seller_id from order_items oi join seller_orders so on so.id=oi.seller_order_id join orders o on o.id=so.order_id join products p on p.id=oi.product_id where oi.id=$1 and o.buyer_id=$2 and so.status='completed'`,[body.orderItemId,buyer.id])).rows[0];if(!item)throw Object.assign(new Error("Only completed purchases can be reviewed"),{statusCode:409});const r=await c.query("insert into reviews(order_item_id,buyer_id,product_id,rating,text) values($1,$2,$3,$4,$5) on conflict(order_item_id,buyer_id) do update set rating=excluded.rating,text=excluded.text returning *",[item.id,buyer.id,item.product_id,body.rating,body.text||null]);await c.query("update seller_profiles set rating=(select round(avg(r.rating)::numeric,2) from reviews r join products p on p.id=r.product_id where p.seller_id=$1) where user_id=$1",[item.seller_id]);return r.rows[0]});return reply.code(201).send({review});});
app.get("/api/products/:id/reviews",async(req)=>{const id=z.string().uuid().parse((req.params as any).id);const r=await pool.query("select r.id,r.rating,r.text,r.created_at,u.first_name as buyer_name from reviews r join users u on u.id=r.buyer_id where r.product_id=$1 order by r.created_at desc",[id]);return {items:r.rows};});

app.post("/api/disputes",async(req,reply)=>{const buyer=await auth(req);const body=z.object({orderId:z.string().uuid(),reason:z.enum(["missing","wrong_item","damaged","not_as_described","other"]),description:z.string().trim().min(5).max(3000)}).parse(req.body);const d=await withTransaction(async(c)=>{const o=(await c.query("select id,status from orders where id=$1 and buyer_id=$2",[body.orderId,buyer.id])).rows[0];if(!o)return null;if(!["paid","seller_confirmed","ready_for_handover","completed"].includes(o.status))throw Object.assign(new Error("Order cannot be disputed"),{statusCode:409});const d=(await c.query("insert into disputes(order_id,buyer_id,reason,description) values($1,$2,$3,$4) returning *",[body.orderId,buyer.id,body.reason,body.description])).rows[0];await c.query("update orders set status='disputed',updated_at=now() where id=$1",[body.orderId]);return d});if(!d)return reply.code(404).send({error:"Order not found"});return reply.code(201).send({dispute:d});});
app.get("/api/notifications",async(req)=>{const user=await auth(req);const r=await pool.query("select * from notifications where user_id=$1 order by created_at desc limit 100",[user.id]);return {items:r.rows};});
app.post("/api/notifications/:id/read",async(req)=>{const user=await auth(req);const id=z.string().uuid().parse((req.params as any).id);await pool.query("update notifications set read_at=now() where id=$1 and user_id=$2",[id,user.id]);return {ok:true};});

app.get("/api/admin/dashboard",async(req,reply)=>{const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});const [users,orders,sales,fees,sellers,disputes,moderation]=await Promise.all([pool.query("select count(*)::int as n from users"),pool.query("select count(*)::int as n from orders"),pool.query("select coalesce(sum(total_minor),0)::bigint as n from orders where status='completed'"),pool.query("select coalesce(sum(amount_minor),0)::bigint as n from platform_ledger_entries where type='commission'"),pool.query("select count(*)::int as n from seller_profiles"),pool.query("select count(*)::int as n from disputes where status='open'"),pool.query("select count(*)::int as n from moderation_queue where status='pending'")]);return {users:Number(users.rows[0].n),orders:Number(orders.rows[0].n),completedSalesMinor:Number(sales.rows[0].n),commissionMinor:Number(fees.rows[0].n),sellers:Number(sellers.rows[0].n),openDisputes:Number(disputes.rows[0].n),pendingModeration:Number(moderation.rows[0].n)};});
app.get("/api/admin/moderation",async(req,reply)=>{const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});const r=await pool.query(`select m.id,m.status,m.reason,m.created_at,p.id as product_id,p.title,p.price_minor,p.currency,u.first_name as seller_name from moderation_queue m join products p on p.id=m.product_id join users u on u.id=p.seller_id where m.status='pending' order by m.created_at asc`);return {items:r.rows};});
app.get("/api/orders",async(req)=>{
 const buyer=await auth(req);const r=await pool.query("select o.id,o.status,o.total_minor,o.currency,o.platform_fee_minor,o.created_at,coalesce(json_agg(json_build_object('id',so.id,'seller_id',so.seller_id,'status',so.status,'subtotal_minor',so.subtotal_minor,'seller_amount_minor',so.seller_amount_minor,'fulfillment_type',so.fulfillment_type)) filter(where so.id is not null),'[]') as seller_orders from orders o left join seller_orders so on so.order_id=o.id where o.buyer_id=$1 group by o.id order by o.created_at desc",[buyer.id]);return {items:r.rows};
});
app.get("/api/seller/orders",async(req)=>{
 const seller=await auth(req);const r=await pool.query("select so.id,so.order_id,so.status,so.subtotal_minor,so.platform_fee_minor,so.seller_amount_minor,so.fulfillment_type,o.created_at,o.buyer_id from seller_orders so join orders o on o.id=so.order_id where so.seller_id=$1 order by o.created_at desc",[seller.id]);return {items:r.rows};
});
app.get("/api/seller/products",async(req)=>{
 const seller=await auth(req);const r=await pool.query("select p.id,p.title,p.price_minor,p.currency,p.status,p.fulfillment_type,p.created_at,i.stock,i.reserved from products p join inventory i on i.product_id=p.id where p.seller_id=$1 order by p.created_at desc",[seller.id]);return {items:r.rows};
});
app.post("/api/seller/products",async(req,reply)=>{
 const seller=await auth(req);if(seller.role!=="seller"&&seller.role!=="admin")return reply.code(403).send({error:"Seller access required"});
 const body=z.object({title:z.string().trim().min(2).max(120),description:z.string().trim().max(5000).optional(),priceMinor:z.number().int().positive(),currency:z.string().length(3).default("RUB"),categoryId:z.string().uuid().optional(),stock:z.number().int().min(0).max(100000),fulfillmentType:z.enum(["meeting","pickup"]).default("pickup"),imageUrl:z.string().url().optional()}).parse(req.body);
 const slug=body.title.toLowerCase().replace(/[^a-zа-я0-9]+/gi,"-").replace(/^-|-$/g,"")+"-"+randomUUID().slice(0,8);
 const product=await withTransaction(async(c)=>{
  let store=(await c.query("select id from stores where seller_id=$1",[seller.id])).rows[0];
  if(!store)store=(await c.query("insert into stores(seller_id,name) values($1,$2) returning id",[seller.id,seller.first_name||"Магазин"])).rows[0];
  const p=(await c.query("insert into products(seller_id,store_id,category_id,title,slug,description,price_minor,currency,status,fulfillment_type) values($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9) returning id,title,price_minor,currency,status,fulfillment_type",[seller.id,store.id,body.categoryId||null,body.title,slug,body.description||null,body.priceMinor,body.currency.toUpperCase(),body.fulfillmentType])).rows[0];
  await c.query("insert into inventory(product_id,stock) values($1,$2)",[p.id,body.stock]);
  if(body.imageUrl)await c.query("insert into product_images(product_id,url,sort_order) values($1,$2,0)",[p.id,body.imageUrl]);
  await c.query("insert into moderation_queue(product_id,status) values($1,'pending')",[p.id]);
  return p;
 });
 return reply.code(201).send({product});
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
  const ok=!!payment&&(payment.status==="pending"||payment.status==="created")&&Number(payment.amount_minor)===Number(q.total_amount)&&payment.currency===q.currency;
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
   const fee=(await c.query("select platform_fee_minor,currency from orders where id=$1",[p.order_id])).rows[0];
   await c.query("insert into platform_ledger_entries(order_id,type,amount_minor,currency,description) values($1,'commission',$2,$3,'Комиссия ЧИПОК') on conflict do nothing",[p.order_id,fee.platform_fee_minor,fee.currency]);
  });
 }
 return {ok:true};
});
app.setErrorHandler((error,req,reply)=>{req.log.error(error);const status=(error as any).statusCode??(error.name==="ZodError"?400:500);reply.code(status).send({error:status===500?"Internal server error":error.message})});
await app.listen({host:"0.0.0.0",port:Number(process.env.PORT||3001)});