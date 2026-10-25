"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id:string; title:string; price_minor?:number; price?:number; currency?:string;
  seller?:string; seller_id?:string; rating?:number; reviews?:number; category?:string; image?:string;
  image_url?:string; available_stock?:number; status?:string; description?:string;
};
type Order = { id:string; status:string; total_minor:number; currency:string; created_at:string; seller_orders:any[] };
type User = { id:string; first_name:string; username?:string; role:string };

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready:()=>void; expand:()=>void; initData?:string;
        openInvoice?:(url:string,cb?:(status:string)=>void)=>void;
      }
    }
  }
}

const fallback:Product[]=[
 {id:"30000000-0000-4000-8000-000000000001",title:"Рюкзак 35 л",price:4990,seller:"OutdoorStore",rating:4.8,reviews:124,category:"Одежда",image:"https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85"},
 {id:"30000000-0000-4000-8000-000000000002",title:"Худи оверсайз",price:2490,seller:"UrbanWear",rating:4.7,reviews:89,category:"Одежда",image:"https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=85"},
 {id:"30000000-0000-4000-8000-000000000003",title:"Беспроводные наушники",price:3990,seller:"TechZone",rating:4.9,reviews:210,category:"Электроника",image:"https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=85"},
 {id:"30000000-0000-4000-8000-000000000004",title:"Туристический стул",price:1990,seller:"OutdoorLife",rating:4.6,reviews:72,category:"Дом",image:"https://images.unsplash.com/photo-1598301257982-0cf014dabbcd?auto=format&fit=crop&w=900&q=85"}
];
const cats=["Все","Еда","Одежда","Электроника","Дом"];
const money=(minor:number,currency="RUB")=>new Intl.NumberFormat("ru-RU",{style:"currency",currency,maximumFractionDigits:0}).format(minor/100);
const api=()=>process.env.NEXT_PUBLIC_API_URL||"http://localhost:3001";

export default function Home(){
 const [tab,setTab]=useState("home"),[cat,setCat]=useState("Все"),[q,setQ]=useState("");
 const [cart,setCart]=useState<Product[]>([]),[selected,setSelected]=useState<Product|null>(null);
 const [products,setProducts]=useState<Product[]>(process.env.NODE_ENV==="production"?[]:fallback),[orders,setOrders]=useState<Order[]>([]),[user,setUser]=useState<User|null>(null),[categories,setCategories]=useState<any[]>([]),[notifications,setNotifications]=useState<any[]>([]);
 const [sellerProducts,setSellerProducts]=useState<any[]>([]),[loading,setLoading]=useState(false),[message,setMessage]=useState("");
 const tg=typeof window!=="undefined"?window.Telegram?.WebApp:null;
 const authHeaders=():Record<string,string>=>{const initData=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";const headers:Record<string,string>={};if(initData)headers.Authorization="tma "+initData;return headers;};

 useEffect(()=>{tg?.ready();tg?.expand();load();},[]);
 async function load(){
   try{
     const r=await fetch(api()+"/api/catalog"); if(r.ok){const d=await r.json(); setProducts((d.items||[]).map((p:any)=>({...p,price:p.price_minor/100,image:p.image_url})))} else if(process.env.NODE_ENV!=="production"){setProducts(fallback)}
     const me=await fetch(api()+"/api/me",{headers:authHeaders()}); if(me.ok){const d=await me.json();setUser(d.user)}
     const cr=await fetch(api()+"/api/categories"); if(cr.ok){const d=await cr.json();setCategories(d.items||[])}
     await loadFavorites();
     await loadNotifications();
   }catch{if(process.env.NODE_ENV==="production")setProducts([])}
 }
 async function loadOrders(){const r=await fetch(api()+"/api/orders",{headers:authHeaders()});if(r.ok)setOrders((await r.json()).items||[])}
 async function loadNotifications(){const r=await fetch(api()+"/api/notifications",{headers:authHeaders()});if(r.ok)setNotifications((await r.json()).items||[])}
 async function readNotification(id:string){const r=await fetch(api()+"/api/notifications/"+id+"/read",{method:"POST",headers:authHeaders()});if(r.ok)setNotifications(prev=>prev.map(n=>n.id===id?{...n,read_at:new Date().toISOString()}:n))}
 async function loadSeller(){const r=await fetch(api()+"/api/seller/products",{headers:authHeaders()});if(r.ok)setSellerProducts((await r.json()).items||[])}
 const items=useMemo(()=>products.filter(p=>(cat==="Все"||p.category===cat)&&(!q||p.title.toLowerCase().includes(q.toLowerCase()))),[products,cat,q]);
 const total=cart.reduce((s,p)=>s+(p.price_minor??Math.round((p.price||0)*100)),0);
 const add=(p:Product)=>setCart(c=>[...c,p]);
 const [favoriteIds,setFavoriteIds]=useState<Set<string>>(new Set());
 const loadFavorites=async()=>{const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";if(!init)return;const r=await fetch(api()+"/api/favorites",{headers:{Authorization:"tma "+init}});if(r.ok){const d=await r.json();setFavoriteIds(new Set((d.items||d||[]).map((x:any)=>x.product_id||x.id)))}}; 
 const toggleFavorite=async(p:Product)=>{const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";if(!init){setMessage("Открой ЧИПОК внутри Telegram.");return}const isFav=favoriteIds.has(p.id);const r=await fetch(api()+"/api/favorites/"+p.id,{method:isFav?"DELETE":"POST",headers:{Authorization:"tma "+init}});if(!r.ok){setMessage("Не удалось изменить избранное");return}setFavoriteIds(prev=>{const n=new Set(prev);if(isFav)n.delete(p.id);else n.add(p.id);return n});setMessage(isFav?"Удалено из избранного":"Товар добавлен в избранное.");};
 const checkout=async()=>{
   if(!cart.length)return;
   if(!tg?.initData){setMessage("Открой ЧИПОК внутри Telegram для оплаты.");return}
   setLoading(true);setMessage("");
   try{
    const grouped=Object.values(cart.reduce((a,p)=>{a[p.id]=(a[p.id]||{productId:p.id,quantity:0});a[p.id].quantity++;return a},{} as Record<string,{productId:string;quantity:number}>));
    const r=await fetch(api()+"/api/orders",{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({items:grouped})});
    if(!r.ok)throw new Error((await r.json()).error||"Не удалось создать заказ");
    const data=await r.json();
    const pr=await fetch(api()+"/api/orders/"+data.order.id+"/payment",{method:"POST",headers:authHeaders()});
    if(!pr.ok)throw new Error((await pr.json()).error||"Не удалось создать оплату");
    const payment=await pr.json();
    tg.openInvoice?.(payment.invoiceLink,(status)=>{if(status==="paid"){setCart([]);setTab("orders");loadOrders()}});
   }catch(e){setMessage(e instanceof Error?e.message:"Ошибка оплаты")}finally{setLoading(false)}
 };
 if(selected)return <div className="app"><main className="shell detail"><button className="icon-btn back" onClick={()=>setSelected(null)}>←</button><div className="detail-image"><img src={selected.image||selected.image_url||""} alt=""/></div><h1>{selected.title}</h1><div className="rating"><b>★ {selected.rating||"—"}</b> {selected.reviews?"("+selected.reviews+" отзыва)":""}</div><div className="seller">♙ {selected.seller||"Продавец ЧИПОК"}</div><div className="price">{money(selected.price_minor??Math.round((selected.price||0)*100),selected.currency)}</div><div className="meta"><div>Наличие<b>{(selected.available_stock??1)>0?"В наличии":"Нет"}</b></div><div>Формат<b>Самовывоз</b></div><div>Комиссия<b>5% с продавца</b></div></div><p className="desc">{selected.description||"Товар из каталога ЧИПОК. Место и время получения покупатель согласовывает с продавцом в чате."}</p><div className="row" style={{gap:8}}>{selected.seller_id&&<button className="secondary wide" onClick={async()=>{const r=await fetch(api()+"/api/chat/threads",{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({sellerId:selected.seller_id,productId:selected.id})});if(r.ok){setMessage("Чат с продавцом открыт. Перейди во вкладку «Чаты».");setTab("chat")}else setMessage("Не удалось открыть чат с продавцом")}}>Написать продавцу</button>}<button className="primary wide sticky-buy" onClick={()=>{add(selected);setSelected(null)}}>Добавить в корзину</button></div></main></div>;

 const page=tab==="home"?<><label className="search">⌕<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Что ищем?"/></label><div className="chips">{cats.map(c=><button key={c} className={"chip "+(cat===c?"active":"")} onClick={()=>setCat(c)}>{c}</button>)}</div><div className="section-head"><h2>Популярное</h2><span>{items.length} товаров</span></div><div className="grid">{items.map(p=><Card key={p.id} p={p} open={()=>setSelected(p)} add={()=>add(p)} toggleFavorite={toggleFavorite}/>)}</div></>
 :tab==="catalog"?<><div className="hero"><h1>Каталог</h1><p>Товары от продавцов твоего круга. Без лишних посредников.</p></div><div className="grid">{items.map(p=><Card key={p.id} p={p} open={()=>setSelected(p)} add={()=>add(p)} toggleFavorite={toggleFavorite}/>)}</div></>
 :tab==="orders"?<Orders orders={orders} onLoad={loadOrders}/>
 :tab==="chat"?<Chats authHeaders={authHeaders} setMessage={setMessage}/>
 :tab==="profile"?<Profile user={user} sellerProducts={sellerProducts} loadSeller={loadSeller} setMessage={setMessage} categories={categories} notifications={notifications} readNotification={readNotification}/>
 :<Cart cart={cart} total={total} checkout={checkout} loading={loading}/>;

 return <div className="app"><main className="shell"><header className="top"><div className="brand"><div className="brand-mark"><img src="/chipok-logo.svg" alt="ЧИПОК"/></div><div><div className="brand-name">ЧИПОК</div><div className="tagline">Твой маркетплейс. Свои люди. Свои товары.</div></div></div><button className="icon-btn" onClick={()=>{setTab("profile")}} aria-label="Уведомления">🔔{notifications.some(n=>!n.read_at)&&<span style={{position:"absolute",margin:"-25px 0 0 25px",width:7,height:7,borderRadius:"50%",background:"var(--gold)"}}/>}</button></header>{message&&<div className="hero" style={{marginBottom:10}}><p>{message}</p></div>}{page}{cart.length>0&&tab!=="cart"&&<button className="fab" onClick={()=>setTab("cart")}>🛒<span>{cart.length}</span></button>}<nav className="bottom">{[["home","⌂","Главная"],["catalog","⌘","Каталог"],["orders","▣","Заказы"],["chat","◌","Чаты"],["profile","♙","Профиль"]].map(([id,ico,label])=><button key={id} className={"nav "+(tab===id?"active":"")} onClick={()=>{setTab(id);if(id==="orders")loadOrders();if(id==="profile"&&user?.role==="seller")loadSeller()}}><strong>{ico}</strong>{label}</button>)}</nav></main></div>;
}

function Card({p,open,add,toggleFavorite}:{p:Product;open:()=>void;add:()=>void;toggleFavorite:(p:Product)=>void}){const price=p.price_minor??Math.round((p.price||0)*100);return <article className="card"><button onClick={open} style={{border:0,padding:0,width:"100%",background:"transparent",color:"inherit",textAlign:"left"}}><div className="card-img"><img src={p.image||p.image_url||""} alt={p.title}/><span className="badge">В наличии</span></div><div className="card-body"><div className="card-title">{p.title}</div><div className="rating"><b>★ {p.rating||"—"}</b> {p.reviews?"("+p.reviews+")":""}</div><div className="seller">{p.seller||"Продавец"}</div><div className="price">{money(price,p.currency)}</div></div></button><button className="bookmark" onClick={e=>{e.stopPropagation();toggleFavorite(p)}}>♡</button></article>}

function Cart({cart,total,checkout,loading}:{cart:Product[];total:number;checkout:()=>void;loading:boolean}){return <div className="hero"><h1>Корзина</h1>{!cart.length?<p>Корзина пуста. Добавь товары из каталога.</p>:cart.map((p,i)=><div className="row" key={i} style={{padding:"12px 0",borderBottom:"1px solid #20323b"}}><img src={p.image||p.image_url||""} alt="" width="54" height="54" style={{borderRadius:12,objectFit:"cover"}}/><div style={{flex:1}}><b style={{fontSize:12}}>{p.title}</b><div className="small">{p.seller||"Продавец"}</div></div><b>{money(p.price_minor??Math.round((p.price||0)*100),p.currency)}</b></div>)}{cart.length>0&&<><p className="small">Комиссия ЧИПОК 5% удерживается из суммы продавца, а не добавляется покупателю.</p><h2>Итого {money(total,"RUB")}</h2><button className="primary wide" onClick={checkout} disabled={loading}>{loading?"Создаём оплату…":"Оформить и оплатить в Telegram"}</button></>}</div>}

function Orders({orders,onLoad}:{orders:Order[];onLoad:()=>void}) {
 const [active,setActive]=useState<Order|null>(null);
 const [handover,setHandover]=useState<any[]>([]);
 const [dispute,setDispute]=useState(false);
 const [reason,setReason]=useState("other");
 const [description,setDescription]=useState("");
 const [busy,setBusy]=useState(false);
 const [localMessage,setLocalMessage]=useState("");
 const [reviewItem,setReviewItem]=useState<any>(null);
 const [reviewRating,setReviewRating]=useState(5);
 const [reviewText,setReviewText]=useState("");

 useEffect(()=>{onLoad()},[]);

 async function openOrder(o:Order){
   setActive(o); setDispute(false); setLocalMessage("");
   const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";
   const r=await fetch(api()+"/api/orders/"+o.id+"/handover",{headers:{Authorization:"tma "+init}});
   if(r.ok)setHandover((await r.json()).items||[]);
 }

 async function sendReview(){
   if(!reviewItem)return;
   setBusy(true);
   try{
     const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";
     const r=await fetch(api()+"/api/reviews",{method:"POST",headers:{"content-type":"application/json",Authorization:"tma "+init},body:JSON.stringify({orderItemId:reviewItem.id,rating:reviewRating,text:reviewText.trim()||undefined})});
     if(!r.ok)throw new Error((await r.json()).error||"Не удалось сохранить отзыв");
     setReviewItem(null);setReviewText("");setLocalMessage("Отзыв сохранён.");
   }catch(e){setLocalMessage(e instanceof Error?e.message:"Ошибка")}
   finally{setBusy(false)}
 }

 async function sendDispute(){
   if(!active||description.trim().length<5)return;
   setBusy(true);
   try{
     const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";
     const r=await fetch(api()+"/api/disputes",{method:"POST",headers:{"content-type":"application/json",Authorization:"tma "+init},body:JSON.stringify({orderId:active.id,reason,description:description.trim()})});
     if(!r.ok)throw new Error((await r.json()).error||"Не удалось открыть спор");
     setDispute(false);setDescription("");onLoad();setLocalMessage("Спор открыт. Администратор рассмотрит заказ.");
   }catch(e){setLocalMessage(e instanceof Error?e.message:"Ошибка")}
   finally{setBusy(false)}
 }

 if(active) return <div className="hero">
   {localMessage&&<p className="small">{localMessage}</p>}
   <button className="icon-btn" onClick={()=>setActive(null)}>←</button>
   <h1>Заказ #{active.id.slice(0,8)}</h1>
   <div className="order-status">{statusRu(active.status)}</div>
   <div className="order-total">{money(Number(active.total_minor),active.currency)}</div>
   <div className="small">{new Date(active.created_at).toLocaleString("ru-RU")}</div>

   <div className="menu order-sellers">
     {(active.seller_orders||[]).map((so:any)=><div className="order-seller" key={so.id}>
       <b>{statusRu(so.status)}</b>
       <span>{so.fulfillment_type==="meeting"?"Встреча":"Самовывоз"} · {money(Number(so.seller_amount_minor),active.currency)}</span>
       {so.status==="completed"&&(so.items||[]).map((item:any)=><div className="review-list" key={item.id}>
         <span>{item.title} × {item.quantity}</span>
         <button className="secondary mini" onClick={()=>{setReviewItem(item);setReviewRating(5)}}>Оставить отзыв</button>
       </div>)}
       {so.status==="ready_for_handover"&&handover.find(h=>h.seller_order_id===so.id)?.handoverCode&&<div className="handover-code">
         <span>Код получения</span>
         <strong>{handover.find(h=>h.seller_order_id===so.id).handoverCode}</strong>
         <small>Покажи этот код продавцу при получении.</small>
       </div>}
     </div>)}
   </div>

   {reviewItem&&<div className="form-card">
     <b>Отзыв: {reviewItem.title}</b>
     <select value={reviewRating} onChange={e=>setReviewRating(Number(e.target.value))}>
       <option value="5">★★★★★</option><option value="4">★★★★☆</option><option value="3">★★★☆☆</option><option value="2">★★☆☆☆</option><option value="1">★☆☆☆☆</option>
     </select>
     <textarea value={reviewText} onChange={e=>setReviewText(e.target.value)} placeholder="Комментарий (необязательно)" rows={3}/>
     <button className="primary wide" disabled={busy} onClick={sendReview}>{busy?"Сохраняем…":"Опубликовать отзыв"}</button>
   </div>}

   {!["cancelled","refunded","disputed"].includes(active.status)&&<>
     <button className="secondary wide" onClick={()=>setDispute(true)}>Проблема с заказом</button>
     {dispute&&<div className="form-card">
       <select value={reason} onChange={e=>setReason(e.target.value)}>
         <option value="missing">Не получил заказ</option><option value="wrong_item">Не тот товар</option><option value="damaged">Товар повреждён</option><option value="not_as_described">Не соответствует описанию</option><option value="other">Другое</option>
       </select>
       <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Опиши проблему" rows={4}/>
       <button className="primary wide" disabled={busy||description.trim().length<5} onClick={sendDispute}>{busy?"Отправляем…":"Открыть спор"}</button>
     </div>}
   </>}
 </div>;

 return <div className="hero">
   <h1>Заказы</h1>
   {!orders.length?<p>Заказов пока нет.</p>:<div className="menu">
     {orders.map(o=><button key={o.id} onClick={()=>openOrder(o)}>
       <span>#{o.id.slice(0,8)} · {statusRu(o.status)}</span>
       <span>{money(Number(o.total_minor),o.currency)} ›</span>
     </button>)}
   </div>}
 </div>;
}

function statusRu(s:string){return ({created:"Ожидает оплаты",paid:"Оплачен",seller_confirmed:"Продавец подтвердил",ready_for_handover:"Готов к получению",completed:"Завершён",cancelled:"Отменён",refunded:"Возврат",disputed:"Спор"} as Record<string,string>)[s]||s}

function Profile({user,sellerProducts,loadSeller,setMessage,categories,notifications,readNotification}:{user:User|null;sellerProducts:any[];loadSeller:()=>void;setMessage:(s:string)=>void;categories:any[];notifications:any[];readNotification:(id:string)=>Promise<void>}){
 const seller=user?.role==="seller";
 const admin=user?.role==="admin";
 const [mode,setMode]=useState<"profile"|"seller"|"favorites"|"notifications"|"admin">("profile");
 const [fav,setFav]=useState<any[]>([]);
 async function favorites(){const r=await fetch(api()+"/api/favorites",{headers:{Authorization:"tma "+(typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"")}});if(r.ok)setFav((await r.json()).items||[]);setMode("favorites")}
 if(mode==="notifications")return <div className="hero"><button className="icon-btn" onClick={()=>setMode("profile")}>←</button><h1>Уведомления</h1>{!notifications.length?<p>Новых событий пока нет.</p>:<div className="menu">{notifications.map(n=><button key={n.id} onClick={()=>readNotification(n.id)} style={{opacity:n.read_at?0.6:1,textAlign:"left"}}><span><b>{n.title}</b><br/><small>{n.body||""}</small></span><span>{n.read_at?"":"●"}</span></button>)}</div>}</div>;
 if(mode==="favorites")return <div className="hero"><button className="icon-btn" onClick={()=>setMode("profile")}>←</button><h1>Избранное</h1>{!fav.length?<p>Здесь пока ничего нет.</p>:<div className="menu">{fav.map(x=><button key={x.id}>{x.title}<span>{money(x.price_minor,x.currency)} ›</span></button>)}</div>}</div>;
 if(mode==="seller")return <SellerPanel products={sellerProducts} loadSeller={loadSeller} setMessage={setMessage} back={()=>setMode("profile")} categories={categories}/>;
 if(mode==="admin")return <AdminPanel setMessage={setMessage} back={()=>setMode("profile")}/>;
 return <div><div className="profile-card"><div className="row"><div className="avatar">{(user?.first_name||"Ч").slice(0,1)}</div><div><b>{user?.first_name||"Покупатель"}</b><div className="small">{seller?"Продавец":"Покупатель"}</div></div></div><div className="menu"><button onClick={favorites}>Избранное <span>♡ ›</span></button>{seller&&<button onClick={()=>{loadSeller();setMode("seller")}}>Кабинет продавца <span>›</span></button>}<button onClick={()=>setMode("notifications")}>Уведомления <span>{notifications.filter(n=>!n.read_at).length||""} ›</span></button>
 {admin&&<button onClick={()=>setMode("admin")}>Админ-панель <span>›</span></button>}<button onClick={()=>setMessage("Безопасная оплата проходит внутри Telegram. Комиссия ЧИПОК удерживается с продавца.")}>Оплата и безопасность <span>›</span></button><button onClick={()=>setMessage("Получение: продавец и покупатель договариваются о месте и времени в чате.")}>Как получить заказ <span>›</span></button></div></div></div>
}
function AdminPanel({setMessage,back}:{setMessage:(s:string)=>void;back:()=>void}){
 const [dash,setDash]=useState<any>(null),[payouts,setPayouts]=useState<any[]>([]),[disputes,setDisputes]=useState<any[]>([]),[moderation,setModeration]=useState<any[]>([]);
 const init=()=>typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"",h=()=>({Authorization:"tma "+init()});
 async function load(){const headers=h();const [d,p,ds,m]=await Promise.all([fetch(api()+"/api/admin/dashboard",{headers}),fetch(api()+"/api/admin/payouts",{headers}),fetch(api()+"/api/admin/disputes",{headers}),fetch(api()+"/api/admin/moderation",{headers})]);if(d.ok)setDash(await d.json());if(p.ok)setPayouts((await p.json()).items||[]);if(ds.ok)setDisputes((await ds.json()).items||[]);if(m.ok)setModeration((await m.json()).items||[])}
 useEffect(()=>{load()},[]);
 async function resolvePayout(id:string,status:"completed"|"failed"){const r=await fetch(api()+"/api/admin/payouts/"+id+"/resolve",{method:"POST",headers:{"content-type":"application/json",...h()},body:JSON.stringify({status})});if(!r.ok){setMessage((await r.json()).error||"Не удалось обработать вывод");return}await load();setMessage(status==="completed"?"Вывод отмечен выполненным.":"Вывод отклонён, средства возвращены на баланс.");}
 async function resolveDispute(id:string,resolution:"refund"|"reject"){const r=await fetch(api()+"/api/admin/disputes/"+id+"/resolve",{method:"POST",headers:{"content-type":"application/json",...h()},body:JSON.stringify({resolution})});if(!r.ok){setMessage((await r.json()).error||"Не удалось закрыть спор");return}await load();setMessage("Спор обработан.");}
 async function moderate(id:string,action:"approve"|"reject"){const r=await fetch(api()+"/api/admin/products/"+id+"/moderate",{method:"POST",headers:{"content-type":"application/json",...h()},body:JSON.stringify({action})});if(!r.ok){setMessage((await r.json()).error||"Не удалось изменить модерацию");return}await load();setMessage(action==="approve"?"Товар опубликован.":"Товар отклонён.");}
 return <div><button className="icon-btn" onClick={back}>←</button><div className="seller-hero"><div><div className="eyebrow">АДМИНИСТРАТОР</div><h1>Панель ЧИПОК</h1><p>Контроль продаж, споров, выводов и модерации.</p></div><div className="balance">{money(Number(dash?.commissionMinor||0),"RUB")}</div></div><div className="seller-stats"><div><b>{dash?.users||0}</b><span>Пользователей</span></div><div><b>{dash?.sellers||0}</b><span>Продавцов</span></div><div><b>{dash?.orders||0}</b><span>Заказов</span></div><div><b>{dash?.openDisputes||0}</b><span>Споров</span></div></div><div className="section-head"><h2>Модерация</h2><span>{moderation.length}</span></div><div className="seller-products">{!moderation.length?<div className="empty">Нет товаров на проверке.</div>:moderation.map(x=><div className="seller-product" key={x.id}><div><b>{x.title}</b><span>{x.seller_name} · {money(Number(x.price_minor),x.currency)}</span></div><div className="row"><button className="primary mini" onClick={()=>moderate(x.product_id,"approve")}>Одобрить</button><button className="secondary mini" onClick={()=>moderate(x.product_id,"reject")}>Отклонить</button></div></div>)}</div><div className="section-head"><h2>Выводы</h2><span>{payouts.filter(x=>x.status==="pending").length} ожидают</span></div><div className="seller-products">{!payouts.length?<div className="empty">Заявок нет.</div>:payouts.map(x=><div className="seller-product" key={x.id}><div><b>{x.seller_name||"Продавец"}</b><span>{x.status} · {new Date(x.created_at).toLocaleString("ru-RU")}</span></div>{x.status==="pending"?<div className="row"><button className="primary mini" onClick={()=>resolvePayout(x.id,"completed")}>Выплатить</button><button className="secondary mini" onClick={()=>resolvePayout(x.id,"failed")}>Отклонить</button></div>:<strong>{money(Number(x.amount_minor),x.currency)}</strong>}</div>)}</div><div className="section-head"><h2>Споры</h2><span>{disputes.filter(x=>x.status==="open").length} открытых</span></div><div className="seller-products">{!disputes.length?<div className="empty">Споров нет.</div>:disputes.map(x=><div className="seller-product" key={x.id}><div><b>{x.buyer_name||"Покупатель"} · {x.reason}</b><span>{x.description}</span></div>{x.status==="open"?<div className="row"><button className="primary mini" onClick={()=>resolveDispute(x.id,"refund")}>Возврат</button><button className="secondary mini" onClick={()=>resolveDispute(x.id,"reject")}>Отклонить</button></div>:<strong>{x.status}</strong>}</div>)}</div></div>
}

function SellerPanel({products,loadSeller,setMessage,back,categories}:{products:any[];loadSeller:()=>void;setMessage:(s:string)=>void;back:()=>void;categories:any[]}){
 const [form,setForm]=useState(false),[title,setTitle]=useState(""),[price,setPrice]=useState(""),[stock,setStock]=useState("1"),[description,setDescription]=useState(""),[imageUrl,setImageUrl]=useState(""),[categoryId,setCategoryId]=useState(""),[fulfillment,setFulfillment]=useState<"pickup"|"meeting">("pickup"),[saving,setSaving]=useState(false);
 const [balance,setBalance]=useState<any>(null),[sellerOrders,setSellerOrders]=useState<any[]>([]),[payout,setPayout]=useState(""),[reliability,setReliability]=useState<any>(null);
 const init=()=>typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";
 async function loadFinance(){const h={Authorization:"tma "+init()};const [b,o,r]=await Promise.all([fetch(api()+"/api/seller/balance",{headers:h}),fetch(api()+"/api/seller/orders",{headers:h}),fetch(api()+"/api/seller/reliability",{headers:h})]);if(b.ok)setBalance(await b.json());if(o.ok)setSellerOrders((await o.json()).items||[]);if(r.ok)setReliability(await r.json())}
 useEffect(()=>{loadFinance()},[]);
 async function requestPayout(){const amount=Math.round(Number(payout)*100);if(!amount)return;const r=await fetch(api()+"/api/seller/payouts",{method:"POST",headers:{"content-type":"application/json",Authorization:"tma "+init()},body:JSON.stringify({amountMinor:amount,currency:"RUB"})});if(!r.ok){setMessage((await r.json()).error||"Не удалось создать вывод");return}setPayout("");await loadFinance();setMessage("Заявка на вывод создана.");}
 async function confirmOrder(id:string){const r=await fetch(api()+"/api/seller-orders/"+id+"/confirm",{method:"POST",headers:{Authorization:"tma "+init()}});if(!r.ok){setMessage((await r.json()).error||"Не удалось подтвердить заказ");return}await loadFinance();setMessage("Заказ подтверждён. Теперь отметьте его готовым к получению.");}
 async function rejectOrder(id:string){const r=await fetch(api()+"/api/seller-orders/"+id+"/reject",{method:"POST",headers:{Authorization:"tma "+init()}});if(!r.ok){setMessage((await r.json()).error||"Не удалось отменить заказ");return}await loadFinance();setMessage("Заказ отменён. Надёжность продавца пересчитана.");}
 async function readyOrder(id:string){const r=await fetch(api()+"/api/seller-orders/"+id+"/ready",{method:"POST",headers:{Authorization:"tma "+init()}});if(!r.ok){setMessage((await r.json()).error||"Не удалось отметить готовность");return}await loadFinance();setMessage("Заказ готов. Покупателю показан код получения.");}
 async function completeOrder(id:string){const code=window.prompt("Введите 6-значный код, который показал покупатель:")?.trim()||"";if(!/^\\d{6}$/.test(code))return;const r=await fetch(api()+"/api/seller-orders/"+id+"/complete",{method:"POST",headers:{"content-type":"application/json",Authorization:"tma "+init()},body:JSON.stringify({code})});if(!r.ok){setMessage((await r.json()).error||"Неверный код");return}await loadFinance();setMessage("Получение подтверждено. Средства доступны для вывода.");}
 async function create(){if(!title.trim()||!price)return;setSaving(true);const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";try{const r=await fetch(api()+"/api/seller/products",{method:"POST",headers:{"content-type":"application/json",Authorization:"tma "+init},body:JSON.stringify({title:title.trim(),priceMinor:Math.round(Number(price)*100),currency:"RUB",stock:Number(stock),description:description.trim()||undefined,imageUrl:imageUrl.trim()||undefined,categoryId:categoryId||undefined,fulfillmentType:fulfillment})});if(!r.ok)throw new Error((await r.json()).error||"Не удалось создать товар");setTitle("");setPrice("");setStock("1");setDescription("");setImageUrl("");setCategoryId("");setFulfillment("pickup");setForm(false);loadSeller();setMessage("Товар отправлен на модерацию.");}catch(e){setMessage(e instanceof Error?e.message:"Ошибка")}finally{setSaving(false)}}
 return <div><button className="icon-btn" onClick={back}>←</button><div className="seller-hero"><div><div className="eyebrow">КАБИНЕТ ПРОДАВЦА</div><h1>Мои продажи</h1><p>Комиссия ЧИПОК — 5%. Вывод средств выполняется после завершения заказа.</p></div><div className="balance">{money(balance?.availableMinor||0,"RUB")}</div></div><div className="seller-stats"><div><b>{products.length}</b><span>Товаров</span></div><div><b>{money(balance?.availableMinor||0,"RUB")}</b><span>Доступно</span></div><div><b>{money(balance?.pendingMinor||0,"RUB")}</b><span>В ожидании</span></div></div>
<div className="form-card finance-card"><div><b>Надёжность продавца</b><span className="small">Оценка: {reliability?.score ?? "—"} / 100 · {reliability?.level==="stable"?"Стабильный":reliability?.level==="warning"?"Предупреждение":reliability?.level==="restricted"?"Ограничен":reliability?.level==="blocked"?"Заблокирован":"—"}</span>{reliability?.level==="restricted"&&<span className="small">Новые заказы временно недоступны. Улучшайте качество исполнения заказов.</span>}{reliability?.level==="blocked"&&<span className="small">Продажи и публикация товаров заблокированы.</span>}</div></div>
<div className="form-card finance-card"><div><b>Вывод средств</b><span className="small">Доступно после подтверждения получения покупателем.</span><div className="row"><input value={payout} onChange={e=>setPayout(e.target.value)} placeholder="Сумма, ₽" inputMode="decimal"/><button className="primary mini" onClick={requestPayout}>Вывести</button></div></div></div><div className="section-head"><h2>Мои товары</h2><button className="primary mini" disabled={reliability?.level==="blocked"} onClick={()=>setForm(!form)}>＋ Добавить</button></div>{form&&<div className="form-card"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Название товара"/><input value={price} onChange={e=>setPrice(e.target.value)} placeholder="Цена, ₽" inputMode="decimal"/><input value={stock} onChange={e=>setStock(e.target.value)} placeholder="Остаток" inputMode="numeric"/><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Описание товара" rows={3}/><input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="Ссылка на изображение (необязательно)"/><select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Категория</option>{categories.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={fulfillment} onChange={e=>setFulfillment(e.target.value as "pickup"|"meeting")}><option value="pickup">Самовывоз</option><option value="meeting">Встреча</option></select><button className="primary wide" disabled={saving} onClick={create}>{saving?"Сохраняем…":"Отправить на модерацию"}</button></div>}<div className="seller-products">{products.length?products.map(p=><div className="seller-product" key={p.id}><div><b>{p.title}</b><span>{p.status||"draft"} · остаток {p.stock??p.available_stock??0}</span></div><strong>{money(p.price_minor,p.currency)}</strong></div>):<div className="empty">Добавь первый товар — после проверки он появится в каталоге.</div>}</div>
<div className="section-head"><h2>Заказы продавца</h2><span>{sellerOrders.length}</span></div>
<div className="seller-products">{sellerOrders.slice(0,8).map(o=><div className="seller-product" key={o.id}><div><b>#{o.order_id.slice(0,8)}</b><span>{statusRu(o.status)} · {o.fulfillment_type}</span></div>{o.status==="paid"?<div className="row"><button className="primary mini" onClick={()=>confirmOrder(o.id)}>Подтвердить</button><button className="secondary mini" onClick={()=>rejectOrder(o.id)}>Нет товара</button></div>:o.status==="seller_confirmed"?<button className="primary mini" onClick={()=>readyOrder(o.id)}>Готов к выдаче</button>:o.status==="ready_for_handover"?<button className="primary mini" onClick={()=>completeOrder(o.id)}>Выдать по коду</button>:<strong>{money(o.seller_amount_minor,o.currency||"RUB")}</strong>}</div>)}</div></div>
}


function Chats({authHeaders,setMessage}:{authHeaders:()=>Record<string,string>;setMessage:(s:string)=>void}){
 const [threads,setThreads]=useState<any[]>([]),[active,setActive]=useState<any|null>(null),[messages,setMessages]=useState<any[]>([]),[text,setText]=useState("");
 async function load(){const r=await fetch(api()+"/api/chat/threads",{headers:authHeaders()});if(r.ok)setThreads((await r.json()).items||[])}
 async function open(t:any){setActive(t);const r=await fetch(api()+"/api/chat/threads/"+t.id+"/messages",{headers:authHeaders()});if(r.ok)setMessages((await r.json()).messages||[])}
 async function send(){if(!active||!text.trim())return;const r=await fetch(api()+"/api/chat/threads/"+active.id+"/messages",{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({body:text.trim()})});if(r.ok){setText("");open(active)}else setMessage("Не удалось отправить сообщение")}
 useEffect(()=>{load()},[]);
 return <div className="hero"><h1>Чаты</h1>{active?<><button className="icon-btn" onClick={()=>setActive(null)}>← Назад</button><div className="menu">{messages.map(m=><div key={m.id} className="row" style={{padding:"10px 0"}}><span>{m.body}</span></div>)}</div><div className="row" style={{marginTop:12}}><input className="search" value={text} onChange={e=>setText(e.target.value)} placeholder="Написать сообщение..." style={{flex:1}}/><button className="primary" onClick={send}>➤</button></div></>:threads.length?<div className="menu">{threads.map(t=><button key={t.id} onClick={()=>open(t)}>{t.product_title||"Чат"} <span>{t.last_message||"Открыть ›"}</span></button>)}</div>:<p>Открой товар и начни общение с продавцом.</p>}</div>
}
