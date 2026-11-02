import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { randomUUID, createHash, randomInt, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";
import { pool, withTransaction } from "./db.js";
import { validateTelegramInitData } from "./telegram.js";
import { OrderService } from "./services/order-service.js";

type OrderTelegramEvent="created"|"paid"|"seller_confirmed"|"seller_cancelled"|"ready"|"completed"|"expired";
function telegramHtmlEscape(value:unknown):string{return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
async function notifyOrderTelegram(orderId:string,event:OrderTelegramEvent,sellerOrderId?:string){
 try{
  const result=await pool.query(`
   select o.id,o.total_minor,o.currency,o.status,
          bu.telegram_id as buyer_telegram_id,bu.first_name as buyer_name,
          so.id as seller_order_id,so.seller_id,so.subtotal_minor,so.status as seller_status,
          su.telegram_id as seller_telegram_id,coalesce(st.name,sp.display_name,su.first_name,'Магазин') as store_name,
          coalesce(lines.items,'') as items
     from orders o join users bu on bu.id=o.buyer_id
     join seller_orders so on so.order_id=o.id join users su on su.id=so.seller_id
     left join stores st on st.seller_id=so.seller_id
     left join seller_profiles sp on sp.user_id=so.seller_id
     left join lateral(select string_agg(oi.title_snapshot||' × '||oi.quantity, E'\\n' order by oi.created_at) as items from order_items oi where oi.seller_order_id=so.id) lines on true
    where o.id=$1 and ($2::uuid is null or so.id=$2)
    order by so.created_at
  `,[orderId,sellerOrderId||null]);
  const rows=result.rows as any[];if(!rows.length)return;
  const first=rows[0],shortId=String(orderId).slice(0,8).toUpperCase();
  const money=(n:number)=>((Number(n)||0)/100).toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2})+" ₽";
  const safe=(v:unknown)=>telegramHtmlEscape(v);
  const items=(r:any)=>safe(r.items||"Состав заказа уточняется").replace(/\\n/g,"\n");
  const webAppUrl=process.env.TELEGRAM_WEBAPP_URL?.trim();
  const keyboard=webAppUrl?{inline_keyboard:[[{text:"🛍 Открыть Nookly",web_app:{url:webAppUrl}}]]}:undefined;
  const send=async(chatId:any,message:string)=>{if(chatId)try{await telegramSendMessage(chatId,message,keyboard,"HTML")}catch(error){app.log.warn({err:error,orderId,event},"Telegram order notification failed")}};
  if(event==="created"){
   const allItems=rows.map(r=>"<b>"+safe(r.store_name)+"</b>\n"+items(r)).join("\n\n");
   await send(first.buyer_telegram_id,"🛍 <b>Заказ оформлен!</b>\n━━━━━━━━━━━━━━\n🔖 Заказ <code>№"+shortId+"</code>\n\n"+allItems+"\n\n💰 <b>Итого: "+money(first.total_minor)+"</b>\n\n<i>Следите за статусом заказа в Nookly. Мы сообщим, когда продавец ответит.</i>");
   for(const r of rows)await send(r.seller_telegram_id,"🆕 <b>Новый заказ в вашем магазине!</b>\n━━━━━━━━━━━━━━\n🔖 Заказ <code>№"+shortId+"</code>\n🏪 <b>"+safe(r.store_name)+"</b>\n\n📦 <b>Состав заказа</b>\n"+items(r)+"\n\n💰 К получению: <b>"+money(r.subtotal_minor)+"</b>\n👤 Покупатель: "+safe(first.buyer_name||"Покупатель")+"\n\n<i>Откройте раздел «Заказы», проверьте поступление оплаты и подтвердите заказ.</i>");
   return;
  }
  for(const r of rows){
   if(event==="paid")await send(r.seller_telegram_id,"💳 <b>Покупатель отметил оплату</b>\n━━━━━━━━━━━━━━\n🔖 Заказ <code>№"+shortId+"</code>\n🏪 "+safe(r.store_name)+"\n"+items(r)+"\n\n💰 Сумма: <b>"+money(r.subtotal_minor)+"</b>\n\n⚠️ <i>Проверьте фактическое поступление денег и только после этого подтвердите заказ в Nookly.</i>");
   if(event==="seller_confirmed")await send(first.buyer_telegram_id,"✅ <b>Продавец подтвердил заказ</b>\n━━━━━━━━━━━━━━\n🔖 Заказ <code>№"+shortId+"</code>\n🏪 "+safe(r.store_name)+"\n"+items(r)+"\n\n<i>Продавец готовит ваш заказ. Мы сообщим, когда его можно будет забрать.</i>");
   if(event==="seller_cancelled")await send(first.buyer_telegram_id,"⚠️ <b>Продавец отменил заказ</b>\n━━━━━━━━━━━━━━\n🔖 Заказ <code>№"+shortId+"</code>\n🏪 "+safe(r.store_name)+"\n\n<i>Заказ передан на рассмотрение. Откройте Nookly, чтобы посмотреть подробности и информацию о возврате.</i>");
   if(event==="ready")await send(first.buyer_telegram_id,"📦 <b>Ваш заказ готов!</b>\n━━━━━━━━━━━━━━\n🔖 Заказ <code>№"+shortId+"</code>\n🏪 "+safe(r.store_name)+"\n"+items(r)+"\n\n🎟 <b>Код получения находится в разделе «Заказы».</b> Покажите его продавцу при получении.");
   if(event==="completed"){
    await send(first.buyer_telegram_id,"🎉 <b>Заказ успешно завершён!</b>\n━━━━━━━━━━━━━━\n🔖 Заказ <code>№"+shortId+"</code>\n🏪 "+safe(r.store_name)+"\n\nСпасибо, что выбираете Nookly 💙");
    await send(r.seller_telegram_id,"🎉 <b>Заказ завершён!</b>\n━━━━━━━━━━━━━━\n🔖 Заказ <code>№"+shortId+"</code>\n"+items(r)+"\n\nПродажа учтена в статистике вашего магазина. Отличной торговли! 💙");
   }
   if(event==="expired")await send(r.seller_telegram_id,"⌛ <b>Заказ отменён по времени</b>\n━━━━━━━━━━━━━━\n🔖 Заказ <code>№"+shortId+"</code>\n\nПокупатель не подтвердил оплату в установленный срок. Резерв товара снят.");
  }
  if(event==="expired")await send(first.buyer_telegram_id,"⌛ <b>Время оплаты истекло</b>\n━━━━━━━━━━━━━━\n🔖 Заказ <code>№"+shortId+"</code>\n\nЗаказ отменён, резерв товара снят. Если вы уже перевели деньги, свяжитесь с продавцом и поддержкой Nookly.");
 }catch(error){app.log.warn({err:error,orderId,event},"Unable to prepare Telegram order notification")}
}
async function telegramSendMessage(chatId:number|string,text:string,replyMarkup?:Record<string,unknown>,parseMode?:"HTML"){
 const token=process.env.TELEGRAM_BOT_TOKEN;
 if(!token)return;
 const body:Record<string,unknown>={chat_id:chatId,text,disable_web_page_preview:true};
 if(replyMarkup)body.reply_markup=replyMarkup;
 if(parseMode)body.parse_mode=parseMode;
 const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
 if(!response.ok){const detail=await response.text().catch(()=>"");throw new Error(`Telegram sendMessage failed: ${response.status} ${detail.slice(0,300)}`);}
 const data:any=await response.json().catch(()=>null);
 if(data&&data.ok===false)throw new Error(`Telegram sendMessage rejected: ${data.description||"unknown error"}`);
}

import { runMigrations } from "./migrate.js";
export const app=Fastify({logger:true});
app.addContentTypeParser("application/json",{parseAs:"string"},(req:any,body:any,done:any)=>{req.rawBody=String(body);try{done(null,JSON.parse(String(body)))}catch(error){done(error as Error)}});
app.setErrorHandler((error,req,reply)=>{
  req.log.error({err:error},"Unhandled API error");
  const err:any=error;
  const status=Number(err.statusCode)||500;
  const safe=status>=500 ? "Internal server error" : (err.message||"Request failed");
  if(status===429&&err.retryAfter)reply.header("Retry-After",String(err.retryAfter));
  const payload:any={error:safe};
  if(status===422&&err.details)payload.details=err.details;
  reply.code(status).send(payload);
});
app.addHook("onSend",async(_req,reply)=>{
 reply.header("X-Content-Type-Options","nosniff");
 reply.header("X-Frame-Options","DENY");
 reply.header("Referrer-Policy","no-referrer");
 reply.header("Permissions-Policy","camera=(),microphone=(),geolocation=()");
 reply.header("Cross-Origin-Resource-Policy","cross-origin");
});
const allowedOrigins=(process.env.CORS_ALLOWED_ORIGINS||process.env.TELEGRAM_WEBAPP_URL||"").split(",").map(x=>x.trim()).filter(Boolean);
const builtInOrigins=["https://perezapusk-tgk.github.io"];
await app.register(cors,{
 origin:(origin,cb)=>{if(!origin||allowedOrigins.length===0||allowedOrigins.includes(origin)||builtInOrigins.includes(origin))return cb(null,true);return cb(new Error("Origin not allowed"),false)},
 methods:["GET","HEAD","POST","PUT","PATCH","DELETE","OPTIONS"],
 allowedHeaders:["Content-Type","Authorization","Accept","X-Requested-With"],
 credentials:false,
 maxAge:86400
});
function env(key:string){const v=process.env[key];if(!v) throw new Error(`Missing ${key}`);return v}
const CASHERA_BASE_URL="https://api.cashera.cash/api/v1";
function casheraApiKey(){return process.env.CASHERA_API_KEY?.trim()||""}
function casheraSecret(){return process.env.CASHERA_API_SECRET?.trim()||""}
function constantTimeEqual(a:string,b:string){
 const aa=Buffer.from(a,"utf8"),bb=Buffer.from(b,"utf8");
 if(aa.length!==bb.length)return false;
 return timingSafeEqual(aa,bb);
}
function casheraCallbackUrl(){
 const explicit=process.env.CASHERA_CALLBACK_URL?.trim();
 const base=explicit||process.env.TELEGRAM_WEBHOOK_URL?.trim();
 if(!base)return "";
 return explicit||new URL("/webhooks/cashera",base).toString();
}
function casheraSuccessUrl(){
 const explicit=process.env.CASHERA_SUCCESS_URL?.trim();
 if(explicit)return explicit;
 const base=process.env.TELEGRAM_WEBAPP_URL?.trim();
 return base?new URL("/pay/ok",base).toString():"";
}
function casheraFailUrl(){
 const explicit=process.env.CASHERA_FAIL_URL?.trim();
 if(explicit)return explicit;
 const base=process.env.TELEGRAM_WEBAPP_URL?.trim();
 return base?new URL("/pay/fail",base).toString():"";
}
function validateHttpsUrl(value:string,name:string){
 if(!value)throw Object.assign(new Error(`${name} is not configured`),{statusCode:503});
 let u:URL;try{u=new URL(value)}catch{throw Object.assign(new Error(`${name} is invalid`),{statusCode:503})}
 if(u.protocol!=="https:")throw Object.assign(new Error(`${name} must use HTTPS`),{statusCode:503});
 return u.toString();
}
async function casheraRequest(path:string,method:"GET"|"POST",body?:Record<string,unknown>){
 const key=casheraApiKey();
 if(!key)throw Object.assign(new Error("Cashera is not configured"),{statusCode:503});
 const payload=body===undefined?undefined:JSON.stringify(body);
 let lastError:any;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(CASHERA_BASE_URL+path,{method,headers:{"X-Api-Key":key,"Content-Type":"application/json","Accept":"application/json"},body:payload});
   const text=await response.text();
   let data:any={};try{data=text?JSON.parse(text):{}}catch{data={message:text}};
   if(response.ok)return data;
   const message=data?.message||data?.error||"Cashera request failed";
   if(response.status===429){
    const error=Object.assign(new Error(message),{statusCode:429,retryAfter:response.headers.get("retry-after")||null});
    throw error;
   }
   if(response.status===401)throw Object.assign(new Error("Cashera API key rejected"),{statusCode:401});
   if(response.status===403)throw Object.assign(new Error(message),{statusCode:403});
   if(response.status===422)throw Object.assign(new Error(message),{statusCode:422,details:data?.errors||null});
   if(response.status>=500){
    lastError=Object.assign(new Error(message),{statusCode:502});
    if(attempt<2){await new Promise(resolve=>setTimeout(resolve,250*Math.pow(2,attempt)));continue;}
    throw lastError;
   }
   throw Object.assign(new Error(message),{statusCode:response.status});
  }catch(error:any){
   if(error?.statusCode===401||error?.statusCode===403||error?.statusCode===422||error?.statusCode===429||error?.statusCode>=400)throw error;
   lastError=error;
   if(attempt<2){await new Promise(resolve=>setTimeout(resolve,250*Math.pow(2,attempt)));continue;}
  }
 }
 throw Object.assign(new Error(lastError?.message||"Cashera request failed"),{statusCode:502});
}
function casheraPaymentMethod(){
 return process.env.CASHERA_PAYMENT_METHOD?.trim()||"";
}
function casheraTransactionSnapshot(tx:any){
 return {
  uuid:tx?.uuid?String(tx.uuid):null,
  externalId:tx?.external_id?String(tx.external_id):null,
  status:tx?.status?String(tx.status):null,
  amount:Number(tx?.amount||0),
  currency:tx?.currency?String(tx.currency).toUpperCase():null,
  createdAt:tx?.created_at||null,
  updatedAt:tx?.updated_at||null,
  paidAt:tx?.paid_at||null,
  paymentUrl:tx?.payment_url||null,
  paymentMethod:tx?.payment_method||null
 };
}
const rateBuckets=new Map<string,{count:number;reset:number}>();
function rateLimit(key:string,limit=60,windowMs=60_000){const now=Date.now();const cur=rateBuckets.get(key);if(!cur||cur.reset<=now){rateBuckets.set(key,{count:1,reset:now+windowMs});return true}if(cur.count>=limit)return false;cur.count++;return true}
setInterval(()=>{const now=Date.now();for(const [k,v] of rateBuckets)if(v.reset<=now)rateBuckets.delete(k)},60_000).unref();
setInterval(()=>{expireUnpaidOrders().catch(error=>app.log.error(error,"Failed to expire unpaid orders"))},60_000).unref();
app.addHook("onRequest",async(req,reply)=>{const key=`${req.ip}:${req.method}:${req.url.split("?")[0]}`;if(!rateLimit(key)){reply.header("Retry-After","60");return reply.code(429).send({error:"Слишком много запросов. Попробуйте позже."})}});

function reliabilityLevel(score:number){if(score<50)return "blocked";if(score<60)return "restricted";if(score<80)return "warning";return "stable"}
function hashHandover(code:string){return createHash("sha256").update(code).digest("hex")}
function makeHandoverCode(){return String(randomInt(100000,1000000))}
function handoverKey(){return createHash("sha256").update(env("TELEGRAM_BOT_TOKEN")).digest()}
async function expireUnpaidOrders(){
 const expired=await withTransaction(async(c)=>{
  const ids=(await c.query("select id from orders where status='created' and expires_at is not null and expires_at<=now() for update skip locked")).rows.map((x:any)=>x.id);
  if(!ids.length)return [];
  await c.query("update inventory i set reserved=greatest(0::integer,i.reserved::integer-oi.quantity::integer),updated_at=now() from order_items oi join seller_orders so on so.id=oi.seller_order_id where so.order_id=any($1::uuid[]) and so.status='created' and oi.product_id=i.product_id",[ids]);
  await c.query("update seller_orders set status='cancelled' where order_id=any($1::uuid[]) and status='created'",[ids]);
  await c.query("update payments set status='expired',updated_at=now() where order_id=any($1::uuid[]) and status='pending'",[ids]);
  await c.query("update orders set status='cancelled',updated_at=now() where id=any($1::uuid[]) and status='created'",[ids]);
  await c.query("insert into notifications(user_id,type,title,body) select buyer_id,'order_expired','Заказ отменён','Время ожидания оплаты истекло, резерв товара снят.' from orders where id=any($1::uuid[])",[ids]);
  return ids;
 });
 for(const id of expired)await notifyOrderTelegram(id,"expired");
}
app.post("/internal/maintenance/expire-orders",async(req,reply)=>{
 const secret=process.env.MAINTENANCE_CRON_SECRET;
 if(!secret||req.headers.authorization!==`Bearer ${secret}`)return reply.code(401).send({error:"Unauthorized"});
 await expireUnpaidOrders();
 return {ok:true};
});
function encryptHandover(code:string){const iv=Buffer.from(randomUUID().replace(/-/g,"").slice(0,24),"hex");const cipher=createCipheriv("aes-256-gcm",handoverKey(),iv);const data=Buffer.concat([cipher.update(code,"utf8"),cipher.final()]);return iv.toString("hex")+":"+cipher.getAuthTag().toString("hex")+":"+data.toString("hex")}
function decryptHandover(value:string){const [ivHex,tagHex,dataHex]=value.split(":");const decipher=createDecipheriv("aes-256-gcm",handoverKey(),Buffer.from(ivHex,"hex"));decipher.setAuthTag(Buffer.from(tagHex,"hex"));return Buffer.concat([decipher.update(Buffer.from(dataHex,"hex")),decipher.final()]).toString("utf8")}
async function auth(request:any){
 const header=request.headers.authorization as string|undefined; const raw=header?.startsWith("tma ")?header.slice(4):"";
 if(!raw) throw Object.assign(new Error("Откройте Nookly через Telegram, чтобы войти в аккаунт."),{statusCode:401});
 const user=validateTelegramInitData(raw,env("TELEGRAM_BOT_TOKEN"),Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE||86400));
 const r=await pool.query(`insert into users(telegram_id,first_name,last_name,username,language_code,is_premium) values($1,$2,$3,$4,$5,$6) on conflict(telegram_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,username=excluded.username,language_code=excluded.language_code,is_premium=excluded.is_premium,updated_at=now() returning id,telegram_id,first_name,last_name,username,language_code,is_premium,role`,[user.id,user.first_name,user.last_name??null,user.username??null,user.language_code??null,user.is_premium??false]);
 const adminTelegramId=process.env.ADMIN_TELEGRAM_ID?.trim();
 if(adminTelegramId && String(r.rows[0].telegram_id)===adminTelegramId && r.rows[0].role!=="admin"){
   const promoted=await pool.query("update users set role='admin',updated_at=now() where id=$1 returning id,telegram_id,first_name,last_name,username,language_code,is_premium,role",[r.rows[0].id]);
   return promoted.rows[0];
 }
 return r.rows[0];
}
app.get("/",async()=>({ok:true,service:"chipok-api",name:"Nookly API",version:"0.4.0",health:"/health"}));
app.get("/health",async()=>({ok:true,service:"chipok-api",name:"Nookly API",version:"0.4.0"}));
async function configureTelegramWebhook(){
 const token=process.env.TELEGRAM_BOT_TOKEN;
 const secret=process.env.TELEGRAM_WEBHOOK_SECRET||process.env.TELEGRAM_PAYMENT_WEBHOOK_SECRET;
 const webhookBaseUrl=process.env.TELEGRAM_WEBHOOK_URL;
 if(!token||!secret||!webhookBaseUrl){
  app.log.info("Telegram webhook auto-registration skipped: set TELEGRAM_WEBHOOK_URL to the API origin to enable it");
  return;
 }
 const webhookUrl=new URL("/api/telegram/webhook",webhookBaseUrl).toString();
 try{
  const infoResponse=await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const info=await infoResponse.json() as {ok:boolean;result?:{url?:string};description?:string};
  if(!info.ok) app.log.warn({description:info.description},"Telegram webhook info check failed");
  if(info.ok&&info.result?.url===webhookUrl){
   app.log.info({webhookUrl},"Telegram webhook already configured");
  }else{
   const r=await fetch(`https://api.telegram.org/bot${token}/setWebhook`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url:webhookUrl,secret_token:secret,allowed_updates:["message"],drop_pending_updates:false})});
   const data=await r.json() as {ok:boolean;description?:string};
   if(!data.ok){
    app.log.warn({description:data.description},"Telegram webhook registration failed");
    return;
   }
   app.log.info({webhookUrl},"Telegram webhook registered");
  }
  const commands=await fetch(`https://api.telegram.org/bot${token}/setMyCommands`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({commands:[{command:"start",description:"Открыть Nookly"},{command:"shop",description:"Открыть каталог"},{command:"help",description:"Помощь и документы"},{command:"terms",description:"Пользовательское соглашение"},{command:"privacy",description:"Политика конфиденциальности"},{command:"support",description:"Техническая поддержка"},{command:"requisites",description:"Реквизиты оплаты подписки"}]})});
  const commandsData=await commands.json() as {ok:boolean;description?:string};
  if(!commandsData.ok)app.log.warn({description:commandsData.description},"Telegram commands registration failed");
  const webAppUrl=process.env.TELEGRAM_WEBAPP_URL;
  if(webAppUrl){
   const menu=await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({menu_button:{type:"web_app",text:"🛍 Nookly",web_app:{url:webAppUrl}}})});
   const menuData=await menu.json() as {ok:boolean;description?:string};
   if(!menuData.ok)app.log.warn({description:menuData.description},"Telegram menu button registration failed");
  }
 }catch(error){
  app.log.warn({err:error},"Telegram webhook configuration request failed");
 }
}
app.get("/api/me",async(req)=>({user:await auth(req)}));
app.post("/api/auth/telegram",async(req)=>({user:await auth(req)}));
app.get("/api/categories",async()=>({items:(await pool.query("select id,name,slug,parent_id,restricted,age_restriction from categories order by name")).rows}));
app.get("/api/catalog",async(req)=>{
 const q=z.object({search:z.string().trim().max(100).optional(),categoryId:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(50).default(20),offset:z.coerce.number().int().min(0).default(0)}).parse(req.query);
 const values:any[]=[];const where:string[]=[`p.status='published'`,`exists(select 1 from seller_profiles sp where sp.user_id=p.seller_id and ((sp.payment_method='link' and nullif(trim(sp.payment_link),'') is not null) or (sp.payment_method<>'link' and nullif(trim(sp.payment_details),'') is not null)))`];
 if(q.search){values.push(`%${q.search}%`);where.push(`(p.title ilike $${values.length} or coalesce(p.description,'') ilike $${values.length})`)}
 if(q.categoryId){values.push(q.categoryId);where.push(`p.category_id=$${values.length}`)}
 const limitParam=values.length+1; const offsetParam=values.length+2; values.push(q.limit,q.offset);
 const sql=`select p.id,p.title,p.description,p.price_minor,p.currency,p.seller_id,p.category_id,p.fulfillment_type,i.stock-i.reserved as available_stock,pi.url as image_url,s.name as store_name,u.first_name as seller_first_name,u.username as seller_username from products p join inventory i on i.product_id=p.id left join stores s on s.id=p.store_id left join users u on u.id=p.seller_id left join lateral(select url from product_images where product_id=p.id order by sort_order,id limit 1) pi on true where ${where.join(" and ")} and i.stock-i.reserved>0 order by p.created_at desc limit $`+limitParam+` offset $`+offsetParam;
 const r=await pool.query(sql,values);
 return {items:r.rows,nextCursor:r.rows.length===q.limit?q.offset+q.limit:null};
});
app.get("/api/products/:id",async(req,reply)=>{
 const id=z.string().uuid().parse((req.params as any).id);
 const r=await pool.query(`select p.*,s.name as store_name,s.seller_id,i.stock-i.reserved as available_stock,coalesce((select json_agg(json_build_object('id',x.id,'url',x.url,'sort_order',x.sort_order) order by x.sort_order,x.id) from product_images x where x.product_id=p.id),'[]') as images from products p left join stores s on s.id=p.store_id join inventory i on i.product_id=p.id where p.id=$1`,[id]);
 if(!r.rowCount)return reply.code(404).send({error:"Product not found"});return {product:r.rows[0]};
});
app.post("/api/orders",async(req,reply)=>{ await expireUnpaidOrders();
 const buyer=await auth(req); const body=z.object({items:z.array(z.object({productId:z.string().uuid(),quantity:z.number().int().min(1).max(100)})).min(1).max(100).superRefine((items,ctx)=>{const seen=new Set<string>();items.forEach((item,index)=>{if(seen.has(item.productId))ctx.addIssue({code:z.ZodIssueCode.custom,path:[index,"productId"],message:"Товар указан несколько раз"});seen.add(item.productId)})})}).parse(req.body);
 const order=await withTransaction(async(c)=>{
  const bps=0; // Direct buyer-seller settlement; Nookly charges no sales commission.
  const o=(await c.query("insert into orders(buyer_id,status,total_minor,platform_fee_minor,expires_at) values($1,'created',0,0,now()+interval '24 hours') returning id",[buyer.id])).rows[0];
  const groups=new Map<string,any>();let total=0,feeTotal=0;let currency:string|null=null;
  for(const item of body.items){
   const p=(await c.query(`select p.id,p.seller_id,p.title,p.price_minor,p.currency,p.fulfillment_type,i.stock,i.reserved,u.role from products p join inventory i on i.product_id=p.id join users u on u.id=p.seller_id where p.id=$1 and p.status='published' for update of p,i,u`,[item.productId])).rows[0];
   if(!p)throw Object.assign(new Error("Product unavailable"),{statusCode:409});
   if(String(p.currency).toUpperCase()!=="RUB")throw Object.assign(new Error("Nookly accepts only RUB catalog prices"),{statusCode:409});
   if(String(p.seller_id)===String(buyer.id))throw Object.assign(new Error("Нельзя купить собственный товар"),{statusCode:409});
   const sellerProfile=(await c.query("select reliability_score,payment_method,payment_details,payment_link from seller_profiles where user_id=$1",[p.seller_id])).rows[0];
   const sellerReliability=Number(sellerProfile?.reliability_score ?? 0);
   const paymentConfigured=sellerProfile?.payment_method==="link"?Boolean(sellerProfile?.payment_link):Boolean(String(sellerProfile?.payment_details||"").trim());
   if(!paymentConfigured)throw Object.assign(new Error("Продавец ещё не настроил способ получения оплаты. Выберите другой товар или попробуйте позже."),{statusCode:409});
   if(p.role!=="seller" || sellerReliability<60)throw Object.assign(new Error("Продавец временно недоступен: продажи ограничены правилами надёжности"),{statusCode:409});
   if(p.stock-p.reserved<item.quantity)throw Object.assign(new Error("Insufficient stock"),{statusCode:409});
   if(currency===null)currency=p.currency;else if(currency!==p.currency)throw Object.assign(new Error('All items in one order must use the same currency'),{statusCode:409}); const line=Number(p.price_minor)*item.quantity,fee=Math.floor(line*bps/10000);total+=line;feeTotal+=fee;
   const g=groups.get(p.seller_id)||{sellerId:p.seller_id,subtotal:0,fee:0,fulfillment:p.fulfillment_type,items:[]};g.subtotal+=line;g.fee+=fee;g.items.push({...item,title:p.title,price:Number(p.price_minor)});groups.set(p.seller_id,g);
   await c.query("update inventory set reserved=reserved+$1,updated_at=now() where product_id=$2",[item.quantity,p.id]);
  }
  await c.query("update orders set total_minor=$1,platform_fee_minor=0,currency=$2,payment_currency=null,payment_amount_minor=null,fx_rate_rub_per_payment=null,payment_rate_locked_at=null,updated_at=now() where id=$3",[total,currency||'RUB',o.id]);
  // Product payments are settled directly between buyer and seller.
  for(const g of groups.values()){const so=(await c.query(`insert into seller_orders(order_id,seller_id,subtotal_minor,platform_fee_minor,seller_amount_minor,fulfillment_type) values($1,$2,$3,0,$3,$4) returning id`,[o.id,g.sellerId,g.subtotal,g.fulfillment])).rows[0];for(const item of g.items)await c.query("insert into order_items(seller_order_id,product_id,title_snapshot,unit_price_minor,quantity,total_minor) values($1,$2,$3,$4,$5,$6)",[so.id,item.productId,item.title,item.price,item.quantity,item.price*item.quantity]);}
  return {id:o.id,totalMinor:total,platformFeeMinor:0,paymentRequired:false,settlement:"direct_with_seller"};
 }); await notifyOrderTelegram(order.id,"created"); return reply.code(201).send({order});
});
app.post("/api/orders/:id/confirm-direct-payment",async(req,reply)=>{
 const buyer=await auth(req);
 await expireUnpaidOrders();
 const id=z.string().uuid().parse((req.params as any).id);
 const result=await withTransaction(async(c)=>{
  const order=(await c.query("select id,status from orders where id=$1 and buyer_id=$2 for update",[id,buyer.id])).rows[0];
  if(!order)return null;
  if(order.status!=="created")throw Object.assign(new Error("Этот заказ уже нельзя подтвердить как оплаченный"),{statusCode:409});
  const sellers=(await c.query("select seller_id from seller_orders where order_id=$1 and status='created'",[id])).rows;
  if(!sellers.length)throw Object.assign(new Error("В заказе нет ожидающих подтверждения позиций"),{statusCode:409});
  await c.query("update orders set status='paid',updated_at=now() where id=$1",[id]);
  await c.query("update seller_orders set status='paid' where order_id=$1 and status='created'",[id]);
  for(const row of sellers)await c.query("insert into notifications(user_id,type,title,body) values($1,'direct_payment_confirmed','Покупатель подтвердил оплату','Покупатель отметил, что перевёл оплату напрямую. Подтвердите заказ в кабинете.')",[row.seller_id]);
  return {id,status:"paid"};
 });
 if(!result)return reply.code(404).send({error:"Заказ не найден"});
 await notifyOrderTelegram(id,"paid");
 return result;
});
app.post("/api/orders/:id/payment-order",async(req,reply)=>{
 await auth(req);
 return reply.code(410).send({error:"Оплата товаров через Nookly отключена. Покупатель и продавец рассчитываются напрямую."});
});
app.post("/webhooks/cashera",async(_req,reply)=>{
 return reply.code(410).send({error:"Cashera product payments are disabled. Buyer and seller settle directly."});
});
app.get("/api/admin/payments/:orderId/cashera-status",async(_req,reply)=>{
 return reply.code(410).send({error:"Cashera product payments are disabled."});
});
app.get("/pay/ok",async(_req,reply)=>{const target=process.env.TELEGRAM_WEBAPP_URL?.trim();if(target)return reply.redirect(target);return reply.type("text/html").send("<!doctype html><title>Nookly</title><p>Оплата завершена. Вернитесь в Nookly.</p>");});
app.get("/pay/fail",async(_req,reply)=>{const target=process.env.TELEGRAM_WEBAPP_URL?.trim();if(target)return reply.redirect(target);return reply.type("text/html").send("<!doctype html><title>Nookly</title><p>Оплата не завершена. Вернитесь в Nookly и попробуйте снова.</p>");});
app.get("/webhooks/cashera",async()=>({ok:true,route:"cashera-webhook",method:"POST"}));

app.post("/api/seller-orders/:id/confirm",async(req,reply)=>{
 const seller=await auth(req);const id=z.string().uuid().parse((req.params as any).id);
 const result=await withTransaction(async(c)=>{
  const so=(await c.query("select so.*,o.id as order_id,o.status as order_status from seller_orders so join orders o on o.id=so.order_id where so.id=$1 and so.seller_id=$2 for update",[id,seller.id])).rows[0];
  if(!so)return null;
  const sellerProfile=(await c.query("select reliability_score from seller_profiles where user_id=$1 for update",[seller.id])).rows[0];
  const reliabilityScore=Number(sellerProfile?.reliability_score ?? 0);
  const reliabilityLevelName=reliabilityLevel(reliabilityScore);
  if(reliabilityLevelName==="blocked")throw Object.assign(new Error("Продажи заблокированы из-за низкой надёжности продавца"),{statusCode:403});
  if(reliabilityLevelName==="restricted")throw Object.assign(new Error("Продажи временно ограничены: надёжность продавца ниже допустимого уровня"),{statusCode:403});
  if(so.order_status!=="paid"||so.status!=="paid")throw Object.assign(new Error("Order is not awaiting seller confirmation"),{statusCode:409});
  await c.query("update seller_orders set status='seller_confirmed' where id=$1",[id]);
  await c.query("insert into order_events(order_id,seller_order_id,actor_id,event_type,old_status,new_status) values($1,$2,$3,'seller_confirmed','paid','seller_confirmed')",[so.order_id,id,seller.id]);
  const pending=await c.query("select count(*)::int as n from seller_orders where order_id=$1 and status not in ('seller_confirmed','ready_for_handover','completed')",[so.order_id]);
  if(Number(pending.rows[0].n)===0)await c.query("update orders set status='seller_confirmed',updated_at=now() where id=$1",[so.order_id]);
  return {sellerOrderId:id,orderId:so.order_id,reliabilityScore,reliabilityLevel:reliabilityLevelName};
 });
 if(!result)return reply.code(404).send({error:"Seller order not found"});
 await notifyOrderTelegram(result.orderId,"seller_confirmed",id);
 return result;
});

app.post("/api/seller-orders/:id/reject",async(req,reply)=>{
 const seller=await auth(req);const id=z.string().uuid().parse((req.params as any).id);
 const result=await withTransaction(async(c)=>{
  const so=(await c.query("select so.*,o.id as order_id,o.buyer_id,o.status as order_status from seller_orders so join orders o on o.id=so.order_id where so.id=$1 and so.seller_id=$2 for update",[id,seller.id])).rows[0];
  if(!so)return null;
  if(so.status!=="paid"||so.order_status!=="paid")throw Object.assign(new Error("Заказ нельзя отменить на этом этапе"),{statusCode:409});
  await c.query("update seller_orders set status='cancelled' where id=$1",[id]);
  await c.query("update inventory i set reserved=greatest(0,i.reserved-oi.quantity),updated_at=now() from order_items oi where oi.seller_order_id=$1 and oi.product_id=i.product_id",[id]);
  await c.query("update seller_profiles set reliability_score=greatest(0,reliability_score-10) where user_id=$1",[seller.id]);
  const score=(await c.query("select reliability_score from seller_profiles where user_id=$1",[seller.id])).rows[0]?.reliability_score;
  // The payment is for the whole order. If one seller rejects after payment,
  // the order must immediately enter dispute so the other seller orders cannot
  // continue to completion while a full refund is being reviewed.
  await c.query("update orders set status='disputed',updated_at=now() where id=$1 and status='paid'",[so.order_id]);
  await c.query("insert into disputes(order_id,buyer_id,reason,description,previous_order_status) select $1,$2,'other',$3,'paid' where not exists(select 1 from disputes where order_id=$1 and status='open')",[so.order_id,so.buyer_id,"Продавец отменил заказ: товар недоступен. Требуется возврат всего оплаченного заказа."]);
  await c.query("insert into notifications(user_id,type,title,body) values($1,'seller_cancelled','Продавец отменил заказ','Продавец сообщил, что товар недоступен. Заказ передан на возврат.')",[so.buyer_id]);
  await c.query("insert into notifications(user_id,type,title,body) values($1,'seller_reliability','Снижение надёжности','За отмену оплаченного заказа рейтинг надёжности продавца снижен на 10 пунктов.')",[seller.id]);
  const scoreNumber=Number(score);const level=reliabilityLevel(scoreNumber);
  if(["restricted","blocked"].includes(level))await c.query("insert into notifications(user_id,type,title,body) values($1,'seller_reliability_action','Ограничение продаж',$2)",[seller.id,level==="blocked"?"Продажи заблокированы из-за низкой надёжности.":"Новые заказы временно ограничены из-за низкой надёжности."]);
  return {sellerOrderId:id,orderId:so.order_id,status:"cancelled",reliabilityScore:scoreNumber,reliabilityLevel:level};
 });
 if(!result)return reply.code(404).send({error:"Seller order not found"});
 await notifyOrderTelegram(result.orderId,"seller_cancelled",id);
 return result;
});
app.post("/api/seller-orders/:id/ready",async(req,reply)=>{
 const seller=await auth(req);const id=z.string().uuid().parse((req.params as any).id);
 const result=await withTransaction(async(c)=>{
  const so=(await c.query("select so.*,o.id as order_id,o.buyer_id from seller_orders so join orders o on o.id=so.order_id where so.id=$1 and so.seller_id=$2 for update",[id,seller.id])).rows[0];
  if(!so)return null;
  if(so.status!=="seller_confirmed")throw Object.assign(new Error("Сначала подтвердите наличие заказа"),{statusCode:409});
  await c.query("update seller_orders set status='ready_for_handover' where id=$1",[id]);
  const handover=(await c.query("select id from handover_codes where seller_order_id=$1 for update",[id])).rows[0];
  if(!handover){
   const code=makeHandoverCode();
   await c.query("insert into handover_codes(seller_order_id,code_hash,code_encrypted) values($1,$2,$3)",[id,hashHandover(code),encryptHandover(code)]);
  }
  const pending=await c.query("select count(*)::int as n from seller_orders where order_id=$1 and status not in ('ready_for_handover','completed')",[so.order_id]);
  if(Number(pending.rows[0].n)===0)await c.query("update orders set status='ready_for_handover',updated_at=now() where id=$1",[so.order_id]);
  await c.query("insert into notifications(user_id,type,title,body) values($1,'order_ready','Заказ готов к получению','Покажи продавцу код получения из раздела «Заказы».')",[so.buyer_id]);
  return {sellerOrderId:id,orderId:so.order_id,status:"ready_for_handover"};
 });
 if(!result)return reply.code(404).send({error:"Seller order not found"});
 await notifyOrderTelegram(result.orderId,"ready",id);
 return result;
});
app.get("/api/orders/:id/handover",async(req,reply)=>{
 const buyer=await auth(req);const id=z.string().uuid().parse((req.params as any).id);
 const r=await pool.query("select so.id as seller_order_id,so.seller_id,so.status,h.created_at,h.used_at,h.code_encrypted from seller_orders so join orders o on o.id=so.order_id left join handover_codes h on h.seller_order_id=so.id where so.order_id=$1 and o.buyer_id=$2 order by so.created_at",[id,buyer.id]);
 if(!r.rowCount)return reply.code(404).send({error:"Order not found"});
 return {items:r.rows.map((x:any)=>({...x,handoverCode:x.code_encrypted&&!x.used_at?decryptHandover(x.code_encrypted):undefined,code_encrypted:undefined}))};
});

app.post("/api/seller-orders/:id/complete",async(req,reply)=>{
 const seller=await auth(req);
 const id=z.string().uuid().parse((req.params as any).id);
 const body=z.object({code:z.string().regex(/^\\d{6}$/)}).parse(req.body);
 const result=await withTransaction(async(c)=>{
   return OrderService.complete_order(c,{
     sellerId:seller.id,
     sellerOrderId:id,
     handoverCode:body.code,
   });
 });
 if(!result)return reply.code(404).send({error:"Seller order not found"});
 await notifyOrderTelegram(result.orderId,"completed",id);
 return result;
});

app.get("/api/seller/payment-settings",async(req)=>{
 const seller=await auth(req);
 const r=await pool.query("select payment_method,payment_details,payment_recipient,payment_bank,payment_link from seller_profiles where user_id=$1",[seller.id]);
 return {settings:r.rows[0]||{payment_method:"sbp",payment_details:null,payment_recipient:null,payment_bank:null,payment_link:null}};
});
app.put("/api/seller/payment-settings",async(req,reply)=>{
 const seller=await auth(req);if(seller.role!=="seller"&&seller.role!=="admin")return reply.code(403).send({error:"Seller access required"});
 const body=z.object({paymentMethod:z.enum(["sbp","card","link"]),paymentDetails:z.string().trim().max(500).optional().nullable(),paymentRecipient:z.string().trim().max(120).optional().nullable(),paymentBank:z.string().trim().max(120).optional().nullable(),paymentLink:z.string().trim().url().max(500).optional().nullable()}).parse(req.body);
 if(body.paymentMethod==="link"&&!body.paymentLink)return reply.code(400).send({error:"Добавьте ссылку на оплату"});
 if(body.paymentMethod!=="link"&&!body.paymentDetails)return reply.code(400).send({error:"Добавьте номер телефона СБП или номер карты"});
 const r=await pool.query("update seller_profiles set payment_method=$2,payment_details=$3,payment_recipient=$4,payment_bank=$5,payment_link=$6 where user_id=$1 returning payment_method,payment_details,payment_recipient,payment_bank,payment_link",[seller.id,body.paymentMethod,body.paymentDetails||null,body.paymentRecipient||null,body.paymentBank||null,body.paymentLink||null]);
 if(!r.rowCount)return reply.code(404).send({error:"Профиль продавца не найден"});
 return {settings:r.rows[0]};
});
app.get("/api/seller/reliability",async(req)=>{const seller=await auth(req);const r=await pool.query("select reliability_score,completed_sales from seller_profiles where user_id=$1",[seller.id]);if(!r.rowCount)return {score:0,level:"blocked",completedSales:0};const score=Number(r.rows[0].reliability_score);return {score,level:reliabilityLevel(score),completedSales:Number(r.rows[0].completed_sales)};});
app.get("/api/seller/balance",async(req)=>{
 const seller=await auth(req);
 const r=await pool.query("select coalesce(sum(case when type in ('sale','payout','adjustment') then amount_minor else 0 end),0)::bigint as available from ledger_entries where seller_id=$1 and currency='RUB'",[seller.id]);
 const pending=await pool.query("select coalesce(sum(so.seller_amount_minor),0)::bigint as pending from seller_orders so join orders o on o.id=so.order_id where so.seller_id=$1 and o.currency='RUB' and so.status in ('paid','seller_confirmed','ready_for_handover')",[seller.id]);
 const x=r.rows[0];return {currency:"RUB",availableMinor:Number(x.available),pendingMinor:Number(pending.rows[0].pending),totalEarnedMinor:Number(x.available)+Number(pending.rows[0].pending)};
});

app.get("/api/admin/payouts",async(req,reply)=>{
 const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});
 const q=z.object({status:z.enum(["pending","processing","completed","rejected","cancelled"]).optional(),limit:z.coerce.number().int().min(1).max(100).default(50)}).parse(req.query);
 const values:any[]=[];let where="";
 if(q.status){values.push(q.status);where="where p.status=$1";}
 values.push(q.limit);
 const r=await pool.query(`select p.id,p.seller_id,p.amount_minor,p.currency,p.status,p.provider_payout_id,p.created_at,p.completed_at,p.processed_by,p.admin_note,p.manual_reference,
 u.first_name,u.last_name,u.username,sp.display_name from payouts p join users u on u.id=p.seller_id left join seller_profiles sp on sp.user_id=p.seller_id ${where} order by p.created_at desc limit $${values.length}`,values);
 return {items:r.rows};
});
app.post("/api/admin/payouts/:id/process",async(req,reply)=>{
 const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});
 const id=z.string().uuid().parse((req.params as any).id);
 const body=z.object({manualReference:z.string().trim().max(200).optional(),note:z.string().trim().max(1000).optional()}).parse(req.body);
 const result=await withTransaction(async(c)=>{
   const payout=(await c.query("select * from payouts where id=$1 for update",[id])).rows[0];
   if(!payout)return null;
   if(payout.status==="completed")return payout;
   if(["rejected","cancelled"].includes(payout.status))throw Object.assign(new Error("Payout is already closed"),{statusCode:409});
   const updated=(await c.query("update payouts set status='completed',processed_by=$2,admin_note=$3,manual_reference=$4,completed_at=now() where id=$1 returning *",[id,admin.id,body.note||null,body.manualReference||null])).rows[0];
   await c.query("insert into notifications(user_id,type,title,body) values($1,'payout_completed','Вывод выплачен',$2)",[payout.seller_id,`Заявка на вывод ${(Number(payout.amount_minor)/100).toFixed(2)} ${payout.currency} отмечена как выплаченная.`]);
   return updated;
 });
 if(!result)return reply.code(404).send({error:"Payout not found"});
 return {payout:result};
});
app.post("/api/admin/payouts/:id/reject",async(req,reply)=>{
 const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});
 const id=z.string().uuid().parse((req.params as any).id);
 const body=z.object({note:z.string().trim().min(2).max(1000)}).parse(req.body);
 const result=await withTransaction(async(c)=>{
   const payout=(await c.query("select * from payouts where id=$1 for update",[id])).rows[0];
   if(!payout)return null;
   if(payout.status==="rejected")return payout;
   if(payout.status==="completed")throw Object.assign(new Error("Completed payout cannot be rejected"),{statusCode:409});
   if(payout.status==="cancelled")throw Object.assign(new Error("Payout is cancelled"),{statusCode:409});
   const updated=(await c.query("update payouts set status='rejected',processed_by=$2,admin_note=$3 where id=$1 returning *",[id,admin.id,body.note])).rows[0];
   await c.query("insert into ledger_entries(seller_id,type,amount_minor,currency,description) values($1,'adjustment',$2,$3,$4)",[payout.seller_id,Number(payout.amount_minor),payout.currency,`Возврат средств по отклонённой заявке на вывод ${id}`]);
   await c.query("insert into notifications(user_id,type,title,body) values($1,'payout_rejected','Заявка на вывод отклонена',$2)",[payout.seller_id,body.note]);
   return updated;
 });
 if(!result)return reply.code(404).send({error:"Payout not found"});
 return {payout:result};
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
  await c.query("select id from users where id=$1 for update",[seller.id]);
  const currency=body.currency.toUpperCase();
  if(currency!=="RUB")throw Object.assign(new Error("Only RUB payouts are supported"),{statusCode:400});
  const available=await c.query("select coalesce(sum(case when type in ('sale','payout','adjustment') then amount_minor else 0 end),0)::bigint as n from ledger_entries where seller_id=$1 and currency=$2",[seller.id,currency]);
  const amount=Number(available.rows[0].n);
  if(body.amountMinor>amount)throw Object.assign(new Error("Insufficient available balance"),{statusCode:409});
  const p=(await c.query("insert into payouts(seller_id,amount_minor,currency,status) values($1,$2,$3,'pending') returning *",[seller.id,body.amountMinor,currency])).rows[0];
  await c.query("insert into ledger_entries(seller_id,type,amount_minor,currency,description) values($1,'payout',$2,$3,'Заявка на вывод средств')",[seller.id,-body.amountMinor,currency]);
  await c.query("insert into notifications(user_id,type,title,body) values($1,'payout_pending','Заявка на вывод','Заявка на вывод средств создана и ожидает обработки')",[seller.id]);
  return p;
 });
 return reply.code(201).send({payout:result});
});
app.get("/api/seller/payouts",async(req)=>{
 const seller=await auth(req); const r=await pool.query("select id,amount_minor,currency,status,provider_payout_id,created_at,completed_at from payouts where seller_id=$1 order by created_at desc",[seller.id]); return {items:r.rows};
});
app.post("/api/seller/onboard",async(req,reply)=>{
 const user=await auth(req);
 const body=z.object({storeName:z.string().trim().min(2).max(100),description:z.string().trim().max(1000).optional(),promoCode:z.string().trim().max(32).optional()}).parse(req.body);
 if(body.promoCode?.toUpperCase()==="START99")return reply.code(410).send({error:"Промокод START99 отключён. В Nookly нет платных подписок или тарифов."});
 const store=await withTransaction(async(c)=>{
  await c.query("insert into seller_profiles(user_id,display_name,description) values($1,$2,$3) on conflict(user_id) do update set display_name=excluded.display_name,description=excluded.description",[user.id,body.storeName,body.description||null]);
  const result=await c.query("insert into stores(seller_id,name,description) values($1,$2,$3) on conflict(seller_id) do update set name=excluded.name,description=excluded.description returning id,seller_id,name,description",[user.id,body.storeName,body.description||null]);
  await c.query("update users set role=case when role='admin' then role else 'seller' end,updated_at=now() where id=$1",[user.id]);
  return result.rows[0];
 });
 return reply.code(200).send({seller:true,role:user.role==="admin"?"admin":"seller",store,subscription:null,message:"Кабинет продавца создан. В Nookly нет абонентской платы и комиссии с продаж."});
});
app.get("/api/seller/subscription",async(_req,reply)=>reply.code(410).send({error:"Nookly не использует подписки продавцов."}));
app.get("/api/admin/subscriptions",async(_req,reply)=>reply.code(410).send({error:"В Nookly нет подписок продавцов."}));
app.post("/api/admin/subscriptions/:id/confirm-payment",async(_req,reply)=>reply.code(410).send({error:"В Nookly нет платных подписок продавцов."}));
app.post("/api/admin/subscriptions/:id/activate",async(_req,reply)=>reply.code(410).send({error:"В Nookly нет платных подписок продавцов."}));
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

app.post("/api/chat/threads",async(req,reply)=>{const user=await auth(req);if(user.role==="seller"||user.role==="admin")return reply.code(403).send({error:"Только покупатель может начать диалог с продавцом"});const body=z.object({sellerId:z.string().uuid(),productId:z.string().uuid().optional()}).parse(req.body);if(body.sellerId===user.id)return reply.code(400).send({error:"Cannot chat with yourself"});const seller=(await pool.query("select id,role from users where id=$1",[body.sellerId])).rows[0];if(!seller||seller.role!=="seller")return reply.code(404).send({error:"Seller not found"});const existingThread=(await pool.query(body.productId
  ?"select * from chat_threads where buyer_id=$1 and seller_id=$2 and product_id=$3 limit 1"
  :"select * from chat_threads where buyer_id=$1 and seller_id=$2 and product_id is null limit 1",
 [user.id,body.sellerId,body.productId||null])).rows[0];
 const thread=existingThread||(await pool.query("insert into chat_threads(buyer_id,seller_id,product_id) values($1,$2,$3) returning *",[user.id,body.sellerId,body.productId||null])).rows[0];return reply.code(201).send({thread});});
app.get("/api/chat/threads",async(req)=>{const user=await auth(req);const r=await pool.query(`select t.*,u.first_name as buyer_name,s.first_name as seller_name,p.title as product_title,(select body from chat_messages m where m.thread_id=t.id order by m.created_at desc limit 1) as last_message from chat_threads t join users u on u.id=t.buyer_id join users s on s.id=t.seller_id left join products p on p.id=t.product_id where t.buyer_id=$1 or t.seller_id=$1 order by t.created_at desc`,[user.id]);return {items:r.rows};});
app.get("/api/chat/threads/:id/messages",async(req,reply)=>{const user=await auth(req);const id=z.string().uuid().parse((req.params as any).id);const t=(await pool.query("select * from chat_threads where id=$1 and (buyer_id=$2 or seller_id=$2)",[id,user.id])).rows[0];if(!t)return reply.code(404).send({error:"Thread not found"});const r=await pool.query("select id,sender_id,body,created_at from chat_messages where thread_id=$1 order by created_at asc",[id]);return {thread:t,messages:r.rows};});
app.post("/api/chat/threads/:id/messages",async(req,reply)=>{const user=await auth(req);const id=z.string().uuid().parse((req.params as any).id);const body=z.object({body:z.string().trim().min(1).max(4000)}).parse(req.body);const t=(await pool.query("select * from chat_threads where id=$1 and (buyer_id=$2 or seller_id=$2)",[id,user.id])).rows[0];if(!t)return reply.code(404).send({error:"Thread not found"});const m=(await pool.query("insert into chat_messages(thread_id,sender_id,body) values($1,$2,$3) returning id,sender_id,body,created_at",[id,user.id,body.body])).rows[0];const recipient=user.id===t.buyer_id?t.seller_id:t.buyer_id;await pool.query("insert into notifications(user_id,type,title,body) values($1,'chat_message','Новое сообщение',$2)",[recipient,body.body.slice(0,180)]);return reply.code(201).send({message:m});});

app.post("/api/chat/threads/:id/offers",async(req,reply)=>{const seller=await auth(req);if(seller.role!=="seller"&&seller.role!=="admin")return reply.code(403).send({error:"Seller access required"});const id=z.string().uuid().parse((req.params as any).id);const body=z.object({productId:z.string().uuid().optional(),title:z.string().trim().min(2).max(120),priceMinor:z.number().int().positive(),currency:z.string().length(3).default("RUB"),quantity:z.number().int().min(1).max(100),fulfillmentType:z.enum(["meeting","pickup"]).default("pickup"),expiresAt:z.string().datetime().optional()}).parse(req.body);const t=(await pool.query("select * from chat_threads where id=$1 and seller_id=$2",[id,seller.id])).rows[0];if(!t)return reply.code(404).send({error:"Thread not found"});const offer=(await pool.query("insert into offers(thread_id,seller_id,buyer_id,product_id,title,price_minor,currency,quantity,fulfillment_type,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *",[id,seller.id,t.buyer_id,body.productId||null,body.title,body.priceMinor,body.currency.toUpperCase(),body.quantity,body.fulfillmentType,body.expiresAt||null])).rows[0];await pool.query("insert into notifications(user_id,type,title,body) values($1,'offer','Новое предложение',$2)",[t.buyer_id,body.title]);return reply.code(201).send({offer});});
app.get("/api/chat/offers",async(req)=>{const user=await auth(req);const r=await pool.query("select * from offers where buyer_id=$1 or seller_id=$1 order by created_at desc",[user.id]);return {items:r.rows};});
app.post("/api/chat/offers/:id/accept",async(req,reply)=>{const buyer=await auth(req);const id=z.string().uuid().parse((req.params as any).id);const offer=(await pool.query("select * from offers where id=$1 and buyer_id=$2 and status='pending' and (expires_at is null or expires_at>now())",[id,buyer.id])).rows[0];if(!offer)return reply.code(404).send({error:"Offer not found or expired"});if(!offer.product_id)return reply.code(400).send({error:"Offer is missing product"});const order=await withTransaction(async(c)=>{
 const currentOffer=(await c.query("select * from offers where id=$1 and buyer_id=$2 and status='pending' and (expires_at is null or expires_at>now()) for update",[id,buyer.id])).rows[0];
 if(!currentOffer)throw Object.assign(new Error("Offer is no longer available"),{statusCode:409});
 const p=(await c.query("select p.id,p.seller_id,p.title,p.price_minor,p.currency,p.fulfillment_type,i.stock,i.reserved,u.role from products p join inventory i on i.product_id=p.id join users u on u.id=p.seller_id where p.id=$1 and p.status='published' for update of p,i,u",[currentOffer.product_id])).rows[0];const sellerProfile=(await c.query("select reliability_score from seller_profiles where user_id=$1",[currentOffer.seller_id])).rows[0];const sellerReliability=Number(sellerProfile?.reliability_score ?? 0);if(!p||p.seller_id!==currentOffer.seller_id||p.role!=="seller"||sellerReliability<60||p.currency!==currentOffer.currency||Number(p.price_minor)!==Number(currentOffer.price_minor)||p.stock-p.reserved<currentOffer.quantity)throw Object.assign(new Error("Offer is no longer available"),{statusCode:409});const bps=Math.max(0,Math.min(10000,Number(process.env.PLATFORM_COMMISSION_BPS||500))),subtotal=Number(currentOffer.price_minor)*currentOffer.quantity,fee=Math.floor(subtotal*bps/10000);const o=(await c.query("insert into orders(buyer_id,status,total_minor,currency,platform_fee_minor,expires_at) values($1,'created',$2,$3,$4,now()+interval '30 minutes') returning id",[buyer.id,subtotal,p.currency,fee])).rows[0];const so=(await c.query("insert into seller_orders(order_id,seller_id,subtotal_minor,platform_fee_minor,seller_amount_minor,fulfillment_type) values($1,$2,$3,$4,$3-$4,$5) returning id",[o.id,currentOffer.seller_id,subtotal,fee,currentOffer.fulfillment_type])).rows[0];await c.query("insert into order_items(seller_order_id,product_id,title_snapshot,unit_price_minor,quantity,total_minor) values($1,$2,$3,$4,$5,$6)",[so.id,p.id,p.title,currentOffer.price_minor,currentOffer.quantity,subtotal]);await c.query("update inventory set reserved=reserved+$1,updated_at=now() where product_id=$2",[currentOffer.quantity,p.id]);await c.query("update offers set status='accepted' where id=$1 and status='pending'",[id]);return {id:o.id,totalMinor:subtotal};});return {order};});

app.post("/api/reviews",async(req,reply)=>{const buyer=await auth(req);const body=z.object({orderItemId:z.string().uuid(),rating:z.number().int().min(1).max(5),text:z.string().trim().max(2000).optional()}).parse(req.body);const review=await withTransaction(async(c)=>{const item=(await c.query(`select oi.id,oi.product_id,so.order_id,so.status,o.buyer_id,p.seller_id from order_items oi join seller_orders so on so.id=oi.seller_order_id join orders o on o.id=so.order_id join products p on p.id=oi.product_id where oi.id=$1 and o.buyer_id=$2 and so.status='completed'`,[body.orderItemId,buyer.id])).rows[0];if(!item)throw Object.assign(new Error("Only completed purchases can be reviewed"),{statusCode:409});const r=await c.query("insert into reviews(order_item_id,buyer_id,product_id,rating,text) values($1,$2,$3,$4,$5) on conflict(order_item_id,buyer_id) do update set rating=excluded.rating,text=excluded.text returning *",[item.id,buyer.id,item.product_id,body.rating,body.text||null]);await c.query("update seller_profiles set rating=(select round(avg(r.rating)::numeric,2) from reviews r join products p on p.id=r.product_id where p.seller_id=$1) where user_id=$1",[item.seller_id]);return r.rows[0]});return reply.code(201).send({review});});
app.get("/api/products/:id/reviews",async(req)=>{const id=z.string().uuid().parse((req.params as any).id);const r=await pool.query("select r.id,r.rating,r.text,r.created_at,u.first_name as buyer_name from reviews r join users u on u.id=r.buyer_id where r.product_id=$1 order by r.created_at desc",[id]);return {items:r.rows};});

app.post("/api/disputes",async(req,reply)=>{const buyer=await auth(req);const body=z.object({orderId:z.string().uuid(),reason:z.enum(["missing","wrong_item","damaged","not_as_described","other"]),description:z.string().trim().min(5).max(3000)}).parse(req.body);const d=await withTransaction(async(c)=>{const o=(await c.query("select id,status from orders where id=$1 and buyer_id=$2",[body.orderId,buyer.id])).rows[0];if(!o)return null;if(o.status==="disputed")throw Object.assign(new Error("По этому заказу уже открыт спор"),{statusCode:409});if(!["paid","seller_confirmed","ready_for_handover","completed"].includes(o.status))throw Object.assign(new Error("Order cannot be disputed"),{statusCode:409});const existing=(await c.query("select id from disputes where order_id=$1 and status='open' for update",[body.orderId])).rows[0];if(existing)throw Object.assign(new Error("По этому заказу уже открыт спор"),{statusCode:409});const d=(await c.query("insert into disputes(order_id,buyer_id,reason,description,previous_order_status) values($1,$2,$3,$4,$5) returning *",[body.orderId,buyer.id,body.reason,body.description,o.status])).rows[0];await c.query("update orders set status='disputed',updated_at=now() where id=$1",[body.orderId]);return d});if(!d)return reply.code(404).send({error:"Order not found"});return reply.code(201).send({dispute:d});});
app.get("/api/notifications",async(req)=>{const user=await auth(req);const r=await pool.query("select * from notifications where user_id=$1 order by created_at desc limit 100",[user.id]);return {items:r.rows};});
app.post("/api/notifications/:id/read",async(req)=>{const user=await auth(req);const id=z.string().uuid().parse((req.params as any).id);await pool.query("update notifications set read_at=now() where id=$1 and user_id=$2",[id,user.id]);return {ok:true};});
app.post("/api/seller/reliability/acknowledge",async(req,reply)=>{const user=await auth(req);if(user.role!=="seller"&&user.role!=="admin")return reply.code(403).send({error:"Seller access required"});const r=await pool.query("select reliability_score from seller_profiles where user_id=$1",[user.id]);if(!r.rowCount)return reply.code(404).send({error:"Seller profile not found"});const score=Number(r.rows[0].reliability_score);return {ok:true,score,level:reliabilityLevel(score)};});

app.get("/api/admin/dashboard",async(req,reply)=>{const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});const [users,orders,sales,fees,sellers,disputes,moderation]=await Promise.all([pool.query("select count(*)::int as n from users"),pool.query("select count(*)::int as n from orders"),pool.query("select coalesce(sum(total_minor),0)::bigint as n from orders where status='completed'"),pool.query("select coalesce(sum(amount_minor),0)::bigint as n from platform_ledger_entries where type='commission'"),pool.query("select count(*)::int as n from seller_profiles"),pool.query("select count(*)::int as n from disputes where status='open'"),pool.query("select count(*)::int as n from moderation_queue where status='pending'")]);return {users:Number(users.rows[0].n),orders:Number(orders.rows[0].n),completedSalesMinor:Number(sales.rows[0].n),commissionMinor:Number(fees.rows[0].n),sellers:Number(sellers.rows[0].n),openDisputes:Number(disputes.rows[0].n),pendingModeration:Number(moderation.rows[0].n)};});
app.get("/api/admin/orders",async(req,reply)=>{
 const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});
 const q=z.object({status:z.string().optional(),limit:z.coerce.number().int().min(1).max(100).default(50)}).parse(req.query);
 const values:any[]=[];let where="";
 if(q.status){values.push(q.status);where=" where o.status=$1";}
 values.push(q.limit);
 const r=await pool.query(`select o.id,o.status,o.total_minor,o.currency,o.platform_fee_minor,o.payment_currency,o.payment_amount_minor,o.fx_rate_rub_per_payment,o.payment_rate_locked_at,o.created_at,
 count(distinct so.id)::int as seller_orders
 from orders o left join seller_orders so on so.order_id=o.id${where}
 group by o.id order by o.created_at desc limit $${values.length}`,values);
 return {items:r.rows};
});
app.get("/api/admin/disputes",async(req,reply)=>{
 const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});
 const r=await pool.query(`select d.*,o.status as order_status,u.first_name as buyer_name from disputes d join orders o on o.id=d.order_id join users u on u.id=d.buyer_id order by d.created_at desc limit 100`);
 return {items:r.rows};
});
app.post("/api/admin/disputes/:id/resolve",async(req,reply)=>{
 const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});
 const id=z.string().uuid().parse((req.params as any).id);
 const body=z.object({resolution:z.enum(["refund","reject"]),note:z.string().trim().max(2000).optional()}).parse(req.body);
 const result=await withTransaction(async(c)=>{
  const d=(await c.query("select * from disputes where id=$1 for update",[id])).rows[0];if(!d)return null;
  if(d.status!=="open")throw Object.assign(new Error("Dispute already resolved"),{statusCode:409});if(body.resolution==="reject"&&String(d.description||"").startsWith("Продавец отменил заказ:"))throw Object.assign(new Error("Спор о недоступности товара нельзя отклонить: оплаченный заказ уже отменён продавцом и требует возврата"),{statusCode:409});
  const previousOrder=(await c.query("select status from orders where id=$1 for update",[d.order_id])).rows[0];
  await c.query("update disputes set status='resolved',resolved_at=now() where id=$1",[id]);
  if(body.resolution==="refund"){
   const order=(await c.query("select total_minor,currency,status from orders where id=$1 for update",[d.order_id])).rows[0];
   if(!order)throw Object.assign(new Error("Order not found"),{statusCode:404});
   if(!["refunded","cancelled"].includes(order.status)){
    const sellerRows=(await c.query("select seller_id,seller_amount_minor,platform_fee_minor,status from seller_orders where order_id=$1 for update",[d.order_id])).rows;
    for(const so of sellerRows){
      if(so.status!=="completed")await c.query("update inventory i set reserved=greatest(0,i.reserved-oi.quantity),updated_at=now() from order_items oi where oi.seller_order_id=$1 and oi.product_id=i.product_id",[so.id]);
      const saleExists=await c.query("select 1 from ledger_entries where order_id=$1 and seller_id=$2 and type='sale' limit 1",[d.order_id,so.seller_id]);
      if(saleExists.rowCount){
        const refundExists=await c.query("select 1 from ledger_entries where order_id=$1 and seller_id=$2 and type='refund' limit 1",[d.order_id,so.seller_id]);
        if(!refundExists.rowCount)await c.query("insert into ledger_entries(seller_id,order_id,type,amount_minor,currency,description) values($1,$2,'refund',$3,$4,'Возврат по спору')",[so.seller_id,d.order_id,-Number(so.seller_amount_minor),order.currency]);
      }
    }
    const feeRows=await c.query("select amount_minor,currency from platform_ledger_entries where order_id=$1 and type='commission' limit 1",[d.order_id]);
    if(feeRows.rowCount){
      const exists=await c.query("select 1 from platform_ledger_entries where order_id=$1 and type='refund' limit 1",[d.order_id]);
      if(!exists.rowCount)await c.query("insert into platform_ledger_entries(order_id,type,amount_minor,currency,description) values($1,'refund',$2,$3,'Возврат комиссии Nookly')",[d.order_id,-Number(feeRows.rows[0].amount_minor),feeRows.rows[0].currency]);
    }
    await c.query("update seller_orders set status='refunded' where order_id=$1 and status<>'completed'",[d.order_id]);
    await c.query("update orders set status='refund_pending',updated_at=now() where id=$1",[d.order_id]);
    const paymentRow=await c.query("select id from payments where order_id=$1 order by created_at desc limit 1",[d.order_id]);
    const refundExists=await c.query("select 1 from refunds where order_id=$1",[d.order_id]);
    if(!refundExists.rowCount) await c.query("insert into refunds(order_id,payment_id,amount_minor,currency,status,reason) values($1,$2,$3,$4,'pending',$5)",[d.order_id,paymentRow.rows[0]?.id||null,Number(order.total_minor),order.currency,"Возврат по спору "+id]);
    await c.query("update payments set status='refund_pending',updated_at=now() where order_id=$1 and status='paid'",[d.order_id]);
    await c.query("insert into notifications(user_id,type,title,body) select buyer_id,'refund_pending','Возврат оформлен','Возврат зарегистрирован и ожидает подтверждения платёжного провайдера.' from orders where id=$1",[d.order_id]);
    await c.query("insert into notifications(user_id,type,title,body) select so.seller_id,'refund_pending','Возврат по спору','По заказу зарегистрирован возврат. Выплата продавцу не производится до завершения возврата.' from seller_orders so where so.order_id=$1",[d.order_id]);
   }
  } else {
   const restored=d.previous_order_status||"completed";
   await c.query("update orders set status=$1,updated_at=now() where id=$2",[restored,d.order_id]);
   if(restored==="paid"||restored==="seller_confirmed"||restored==="ready_for_handover"||restored==="completed"){
    await c.query("insert into notifications(user_id,type,title,body) select buyer_id,'dispute_rejected','Спор отклонён','Решение администратора: спор отклонён.' from orders where id=$1",[d.order_id]);
   }
  }
  await c.query("insert into admin_actions(admin_id,action,target_type,target_id,metadata) values($1,$2,$3,$4,$5)",[admin.id,"resolve_dispute","dispute",id,JSON.stringify({resolution:body.resolution,note:body.note||null})]);
  return {id,status:"resolved",resolution:body.resolution,refundStatus:body.resolution==="refund"?"refund_pending":undefined};
 });
 if(!result)return reply.code(404).send({error:"Dispute not found"});
 return result;
});
app.get("/api/admin/refunds",async(req,reply)=>{
 const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});
 const r=await pool.query(`select r.id,r.order_id,r.payment_id,r.amount_minor,r.currency,r.status,r.provider_refund_id,r.reason,r.created_at,r.updated_at,r.completed_at,u.first_name as buyer_name from refunds r join orders o on o.id=r.order_id join users u on u.id=o.buyer_id order by r.created_at desc limit 100`);
 return {items:r.rows};
});
app.post("/api/admin/refunds/:id/resolve",async(req,reply)=>{
 const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});
 const id=z.string().uuid().parse((req.params as any).id);
 const body=z.object({status:z.enum(["completed","failed"]),providerRefundId:z.string().trim().max(200).optional(),note:z.string().trim().max(1000).optional()}).parse(req.body);
 const result=await withTransaction(async(c)=>{
  const refund=(await c.query("select * from refunds where id=$1 for update",[id])).rows[0];
  if(!refund)return null;
  if(refund.status==="completed"||refund.status==="failed")throw Object.assign(new Error("Refund already resolved"),{statusCode:409});
  const order=(await c.query("select id,buyer_id,status from orders where id=$1 for update",[refund.order_id])).rows[0];
  if(!order)throw Object.assign(new Error("Order not found"),{statusCode:404});
  if(body.status==="completed"){
   // A refund must never leave a non-completed seller order holding stock.
   const sellerRows=(await c.query("select id,status from seller_orders where order_id=$1 for update",[refund.order_id])).rows;
   for(const so of sellerRows){
    if(so.status!=="completed"){
     await c.query("update inventory i set reserved=greatest(0,i.reserved-oi.quantity),updated_at=now() from order_items oi where oi.seller_order_id=$1 and oi.product_id=i.product_id",[so.id]);
     await c.query("update seller_orders set status='refunded' where id=$1 and status<>'completed'",[so.id]);
    }
   }
   await c.query("update refunds set status='completed',provider_refund_id=coalesce($1,provider_refund_id),completed_at=now(),updated_at=now() where id=$2",[body.providerRefundId||null,id]);
   await c.query("update payments set status='refunded',updated_at=now() where id=$1",[refund.payment_id]);
   await c.query("update orders set status='refunded',updated_at=now() where id=$1",[refund.order_id]);
   await c.query("insert into notifications(user_id,type,title,body) values($1,'refund_completed','Возврат выполнен','Средства по заказу возвращены покупателю платёжным провайдером.')",[order.buyer_id]);
  }else{
   await c.query("update refunds set status='failed',provider_refund_id=coalesce($1,provider_refund_id),updated_at=now() where id=$2",[body.providerRefundId||null,id]);
   await c.query("update payments set status='paid',updated_at=now() where id=$1",[refund.payment_id]);
   await c.query("update orders set status='disputed',updated_at=now() where id=$1",[refund.order_id]);
   const sellerRows=await c.query("select seller_id,seller_amount_minor from seller_orders where order_id=$1",[refund.order_id]);
   for(const so of sellerRows.rows){
    const desc="Восстановление средств после неуспешного возврата "+refund.id;
    const exists=await c.query("select 1 from ledger_entries where order_id=$1 and seller_id=$2 and type='adjustment' and description=$3",[refund.order_id,so.seller_id,desc]);
    if(!exists.rowCount)await c.query("insert into ledger_entries(seller_id,order_id,type,amount_minor,currency,description) values($1,$2,'adjustment',$3,$4,$5)",[so.seller_id,refund.order_id,Number(so.seller_amount_minor),refund.currency,desc]);
   }
   const pfee=await c.query("select amount_minor,currency from platform_ledger_entries where order_id=$1 and type='refund' limit 1",[refund.order_id]);
   if(pfee.rowCount){
    const desc="Восстановление комиссии после неуспешного возврата "+refund.id;
    const exists=await c.query("select 1 from platform_ledger_entries where order_id=$1 and type='adjustment' and description=$2",[refund.order_id,desc]);
    if(!exists.rowCount)await c.query("insert into platform_ledger_entries(order_id,type,amount_minor,currency,description) values($1,'adjustment',$2,$3,$4)",[refund.order_id,Number(pfee.rows[0].amount_minor),pfee.rows[0].currency,desc]);
   }
   await c.query("insert into notifications(user_id,type,title,body) values($1,'refund_failed','Возврат не выполнен','Платёжный провайдер не подтвердил возврат. Заказ передан на повторную обработку.')",[order.buyer_id]);
  }
  await c.query("insert into admin_actions(admin_id,action,target_type,target_id,metadata) values($1,'resolve_refund','refund',$2,$3)",[admin.id,refund.id,JSON.stringify({status:body.status,providerRefundId:body.providerRefundId||null,note:body.note||null})]);
  return {id:refund.id,status:body.status};
 });
 if(!result)return reply.code(404).send({error:"Refund not found"});
 return result;
});

app.get("/api/admin/moderation",async(req,reply)=>{const admin=await auth(req);if(admin.role!=="admin")return reply.code(403).send({error:"Forbidden"});const r=await pool.query(`select m.id,m.status,m.reason,m.created_at,p.id as product_id,p.title,p.price_minor,p.currency,u.first_name as seller_name from moderation_queue m join products p on p.id=m.product_id join users u on u.id=p.seller_id where m.status='pending' order by m.created_at asc`);return {items:r.rows};});
app.get("/api/orders",async(req)=>{
 const buyer=await auth(req);
 await expireUnpaidOrders();
 const r=await pool.query(`select o.id,o.status,o.total_minor,o.currency,o.platform_fee_minor,o.created_at,
 coalesce(json_agg(json_build_object(
 'id',so.id,'seller_id',so.seller_id,'status',so.status,'subtotal_minor',so.subtotal_minor,
 'seller_amount_minor',so.seller_amount_minor,'fulfillment_type',so.fulfillment_type,
 'payment_method',sp.payment_method,'payment_details',sp.payment_details,'payment_recipient',sp.payment_recipient,
 'payment_bank',sp.payment_bank,'payment_link',sp.payment_link,'store_name',coalesce(st.name,sp.display_name,'Продавец'),
 'items',(select coalesce(json_agg(json_build_object('id',oi.id,'product_id',oi.product_id,'title',p.title,'quantity',oi.quantity,'unit_price_minor',oi.unit_price_minor,'reviewed',exists(select 1 from reviews rv where rv.order_item_id=oi.id and rv.buyer_id=o.buyer_id))),'[]') from order_items oi join products p on p.id=oi.product_id where oi.seller_order_id=so.id)
 )) filter(where so.id is not null),'[]') as seller_orders
 from orders o left join seller_orders so on so.order_id=o.id
 left join seller_profiles sp on sp.user_id=so.seller_id left join stores st on st.seller_id=so.seller_id
 where o.buyer_id=$1 group by o.id order by o.created_at desc`,[buyer.id]);
 return {items:r.rows};
});
app.get("/api/seller/orders",async(req)=>{
 const seller=await auth(req);const r=await pool.query("select so.id,so.order_id,so.status,so.subtotal_minor,so.platform_fee_minor,so.seller_amount_minor,so.fulfillment_type,o.created_at,o.buyer_id from seller_orders so join orders o on o.id=so.order_id where so.seller_id=$1 order by o.created_at desc",[seller.id]);return {items:r.rows};
});
app.get("/api/seller/products",async(req)=>{
 const seller=await auth(req);
 const r=await pool.query("select p.id,p.title,p.description,p.price_minor,p.currency,p.status,p.fulfillment_type,p.category_id,p.created_at,i.stock,i.reserved,pi.url as image_url from products p join inventory i on i.product_id=p.id left join lateral(select url from product_images where product_id=p.id order by sort_order,id limit 1) pi on true where p.seller_id=$1 order by p.created_at desc",[seller.id]);
 return {items:r.rows};
});
app.patch("/api/seller/products/:id",async(req,reply)=>{
 const seller=await auth(req);if(seller.role!=="seller"&&seller.role!=="admin")return reply.code(403).send({error:"Seller access required"});
 const id=z.string().uuid().parse((req.params as any).id);
 const body=z.object({title:z.string().trim().min(2).max(120),description:z.string().trim().max(5000).optional(),priceMinor:z.number().int().positive(),categoryId:z.string().uuid().optional(),stock:z.number().int().min(0).max(100000),fulfillmentType:z.enum(["meeting","pickup"]).default("pickup"),imageUrl:z.string().refine(v=>v.startsWith("data:image/")||v.startsWith("https://"),"Invalid image URL").optional()}).parse(req.body);
 const updated=await withTransaction(async(c)=>{
  const p=(await c.query("select id,status,coalesce((select reserved from inventory where product_id=products.id),0) as reserved from products where id=$1 and seller_id=$2 for update",[id,seller.id])).rows[0];
  if(!p)return {kind:"not_found" as const};
  if(body.stock<Number(p.reserved))throw Object.assign(new Error(`Нельзя установить остаток ниже зарезервированного количества (${p.reserved})`),{statusCode:409});
  await c.query("update products set title=$1,description=$2,price_minor=$3,category_id=$4,fulfillment_type=$5,status='published',updated_at=now() where id=$6",[body.title,body.description||null,body.priceMinor,body.categoryId||null,body.fulfillmentType,id]);
  await c.query("update inventory set stock=$1,updated_at=now() where product_id=$2",[body.stock,id]);
  if(body.imageUrl){await c.query("delete from product_images where product_id=$1",[id]);await c.query("insert into product_images(product_id,url,sort_order) values($1,$2,0)",[id,body.imageUrl]);}
  return {kind:"ok" as const};
 });
 if(updated.kind==="not_found")return reply.code(404).send({error:"Товар не найден"});
 return {ok:true};
});
app.delete("/api/seller/products/:id",async(req,reply)=>{
 const seller=await auth(req);if(seller.role!=="seller"&&seller.role!=="admin")return reply.code(403).send({error:"Seller access required"});
 const id=z.string().uuid().parse((req.params as any).id);
 const result=await withTransaction(async(c)=>{
  const p=(await c.query("select id,status from products where id=$1 and seller_id=$2 for update",[id,seller.id])).rows[0];
  if(!p)return {kind:"not_found" as const};
  await c.query("update products set status='archived',updated_at=now() where id=$1",[id]);
  return {kind:"archived" as const};
 });
 if(result.kind==="not_found")return reply.code(404).send({error:"Товар не найден"});
 return {ok:true,mode:result.kind};
});
app.get("/api/images/search",async(req,reply)=>{
 const q=z.object({q:z.string().trim().min(2).max(120),limit:z.coerce.number().int().min(1).max(12).default(8)}).parse(req.query);
 try{
  const url="https://api.openverse.org/v1/images/?q="+encodeURIComponent(q.q)+"&page_size="+q.limit;
  const r=await fetch(url,{headers:{"accept":"application/json"}});
  if(!r.ok)return reply.code(502).send({error:"Не удалось найти изображения"});
  const data:any=await r.json();
  return {items:(data.results||[]).map((x:any)=>({id:x.id,title:x.title||"",thumbnail:x.thumbnail||x.url,image:x.url||x.thumbnail,creator:x.creator||"",license:x.license||"",licenseUrl:x.license_url||"",source:x.foreign_landing_url||x.detail_url||""})).filter((x:any)=>x.image)};
 }catch{return reply.code(502).send({error:"Поиск изображений временно недоступен"});}
});
app.post("/api/seller/products",async(req,reply)=>{
 const seller=await auth(req);if(seller.role!=="seller"&&seller.role!=="admin")return reply.code(403).send({error:"Seller access required"});
 const reliability=await pool.query("select reliability_score from seller_profiles where user_id=$1",[seller.id]);
 const reliabilityScore=Number(reliability.rows[0]?.reliability_score ?? 0);
 if(reliabilityLevel(reliabilityScore)==="blocked")return reply.code(403).send({error:"Публикация товаров заблокирована из-за низкой надёжности продавца"});
 const body=z.object({title:z.string().trim().min(2).max(120),description:z.string().trim().max(5000).optional(),priceMinor:z.number().int().positive(),currency:z.string().length(3).default("RUB"),categoryId:z.string().uuid().optional(),stock:z.number().int().min(0).max(100000),fulfillmentType:z.enum(["meeting","pickup"]).default("pickup"),imageUrl:z.string().refine(v=>v.startsWith("data:image/")||v.startsWith("https://"),"Invalid image URL").optional()}).parse(req.body);
 const slug=body.title.toLowerCase().replace(/[^a-zа-я0-9]+/gi,"-").replace(/^-|-$/g,"")+"-"+randomUUID().slice(0,8);
 const product=await withTransaction(async(c)=>{
  let store=(await c.query("select id from stores where seller_id=$1",[seller.id])).rows[0];
  if(!store)store=(await c.query("insert into stores(seller_id,name) values($1,$2) returning id",[seller.id,seller.first_name||"Магазин"])).rows[0];
  const p=(await c.query("insert into products(seller_id,store_id,category_id,title,slug,description,price_minor,currency,status,fulfillment_type) values($1,$2,$3,$4,$5,$6,$7,$8,'published',$9) returning id,title,price_minor,currency,status,fulfillment_type",[seller.id,store.id,body.categoryId||null,body.title,slug,body.description||null,body.priceMinor,body.currency.toUpperCase(),body.fulfillmentType])).rows[0];
  await c.query("insert into inventory(product_id,stock) values($1,$2)",[p.id,body.stock]);
  if(body.imageUrl)await c.query("insert into product_images(product_id,url,sort_order) values($1,$2,0)",[p.id,body.imageUrl]);
  await c.query("insert into moderation_queue(product_id,status,reason,reviewed_at) values($1,'approved','Автопубликация товара продавца',now())",[p.id]);
  return p;
 });
 return reply.code(201).send({product});
});


app.post("/api/telegram/webhook",async(req,reply)=>{
 const configuredSecret=process.env.TELEGRAM_WEBHOOK_SECRET||process.env.TELEGRAM_PAYMENT_WEBHOOK_SECRET;
 if(configuredSecret&&req.headers["x-telegram-bot-api-secret-token"]!==configuredSecret){
   return reply.code(401).send({error:"Unauthorized"});
 }
 const update:any=req.body;
 if(update.message?.text&&update.message?.from?.id){
   const command=String(update.message.text).trim().split(/\\s+/)[0].toLowerCase();
   const webAppUrl=process.env.TELEGRAM_WEBAPP_URL;
   const legalBase=webAppUrl?new URL("legal/",webAppUrl).toString():"";
   const termsUrl=legalBase?new URL("terms.html",legalBase).toString():"";
   const privacyUrl=legalBase?new URL("privacy.html",legalBase).toString():"";
   const supportUrl="https://t.me/nikita_seton";
   if(command==="/start"||command==="/shop"){
     await telegramSendMessage(update.message.chat.id,"Nookly — маркетплейс внутри Telegram.\\n\\nОткрой каталог и выбирай товары.",webAppUrl?{inline_keyboard:[[{text:"🛍 Открыть Nookly",web_app:{url:webAppUrl}}],[{text:"📄 Пользовательское соглашение",url:termsUrl},{text:"🔐 Политика конфиденциальности",url:privacyUrl}],[{text:"💬 Техническая поддержка",url:supportUrl}]]}:undefined);
   } else if(command==="/help"){
     await telegramSendMessage(update.message.chat.id,"Nookly — помощь и информация.\\n\\nВыберите нужный раздел:",{inline_keyboard:[[{text:"📄 Пользовательское соглашение",url:termsUrl}],[{text:"🔐 Политика конфиденциальности",url:privacyUrl}],[{text:"💬 Техническая поддержка",url:supportUrl}],...(webAppUrl?[[{text:"🛍 Открыть Nookly",web_app:{url:webAppUrl}}]]:[])]});
   } else if(command==="/terms"){
     await telegramSendMessage(update.message.chat.id,"Пользовательское соглашение Nookly. Откройте документ по кнопке ниже.",{inline_keyboard:[[ {text:"📄 Открыть соглашение",url:termsUrl} ]]});
   } else if(command==="/privacy"){
     await telegramSendMessage(update.message.chat.id,"Политика конфиденциальности Nookly. Откройте документ по кнопке ниже.",{inline_keyboard:[[ {text:"🔐 Открыть политику",url:privacyUrl} ]]});
   } else if(command==="/support"){
     await telegramSendMessage(update.message.chat.id,"Техническая поддержка Nookly. Напишите нам, если возникли вопросы по заказу, оплате или работе приложения.",{inline_keyboard:[[ {text:"💬 Написать в поддержку",url:supportUrl} ]]});
   } else if(command==="/requisites"||command==="/card"){
     await telegramSendMessage(update.message.chat.id,"В Nookly нет абонентской платы и оплаты тарифов. Покупатель оплачивает товар напрямую продавцу по реквизитам, указанным в заказе. Продавец настраивает способ получения оплаты в своём кабинете Nookly.");
   } else if(command==="/balance"){
     const u=(await pool.query("select id from users where telegram_id=$1",[update.message.from.id])).rows[0];
     if(!u){
       await telegramSendMessage(update.message.chat.id,"Сначала откройте Nookly через /start.");
     } else {
       const r=await pool.query("select coalesce(sum(case when type in ('sale','adjustment') then amount_minor else 0 end),0)::bigint as credited, coalesce(sum(case when type='payout' then amount_minor else 0 end),0)::bigint as payouts from ledger_entries where seller_id=$1 and currency='RUB'",[u.id]);
       const balance=Number(r.rows[0].credited)-Math.abs(Number(r.rows[0].payouts));
       await telegramSendMessage(update.message.chat.id,`Баланс Nookly: ${(balance/100).toFixed(2)} ₽`);
     }
   }
 }
 return {ok:true};
});
app.get("/api/telegram/webhook",async()=>({ok:true,route:"telegram-webhook",method:"POST",message:"Nookly bot webhook"}));

let bootPromise:Promise<void>|null=null;
export async function bootstrap(){
 if(!bootPromise)bootPromise=(async()=>{
  await runMigrations();
  await configureTelegramWebhook().catch(error=>app.log.error(error,"Failed to configure Telegram webhook"));

 })();
 return bootPromise;
}

if(!process.env.VERCEL){
 await bootstrap();
 await app.listen({host:"0.0.0.0",port:Number(process.env.PORT||3001)});
}