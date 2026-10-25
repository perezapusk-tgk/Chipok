"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id:string; title:string; price_minor?:number; price?:number; currency?:string;
  seller?:string; seller_id?:string; rating?:number; reviews?:number; category?:string; category_id?:string; image?:string;
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
const cats=["Все"];
const money=(minor:number,currency="RUB")=>new Intl.NumberFormat("ru-RU",{style:"currency",currency,maximumFractionDigits:0}).format(minor/100);
const api=()=>process.env.NEXT_PUBLIC_API_URL||(process.env.NODE_ENV==="production"?"https://chipok-api.onrender.com":"http://localhost:3001");

export default function Home(){
 const [tab,setTab]=useState("home"),[cat,setCat]=useState("Все"),[q,setQ]=useState("");
 const [cart,setCart]=useState<Product[]>([]),[selected,setSelected]=useState<Product|null>(null);
 const [products,setProducts]=useState<Product[]>(process.env.NODE_ENV==="production"?[]:fallback),[orders,setOrders]=useState<Order[]>([]),[user,setUser]=useState<User|null>(null),[categories,setCategories]=useState<any[]>([]),[notifications,setNotifications]=useState<any[]>([]);
 const [sellerProducts,setSellerProducts]=useState<any[]>([]),[loading,setLoading]=useState(false),[message,setMessage]=useState("");
 const tg=typeof window!=="undefined" ? window.Telegram?.WebApp : undefined;
 const authHeaders=():Record<string,string>=>{const initData=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";const headers:Record<string,string>={};if(initData)headers.Authorization="tma "+initData;return headers;};

 const [booted,setBooted]=useState(false);
 const [favoriteIds,setFavoriteIds]=useState<Set<string>>(new Set());
 useEffect(()=>{
   let alive=true;
   try{tg?.ready?.();tg?.expand?.();}catch{}
   load().finally(()=>{if(alive)setBooted(true)});
   return()=>{alive=false};
 },[]);
 async function load(){
   let catalogLoaded=false;
   try{
     const r=await fetch(api()+"/api/catalog?limit=50",{cache:"no-store"});
     if(r.ok){
       const d=await r.json();
       const apiItems=(d.items||[]).map((p:any)=>({...p,price_minor:Number(p.price_minor),price:Number(p.price_minor)/100,image:p.image_url}));
       setProducts(apiItems);
       catalogLoaded=true;
     }else{
       setProducts(process.env.NODE_ENV==="production"?[]:fallback);
     }
   }catch{
     setProducts(fallback);
     setMessage("Каталог временно не ответил. Показываем доступные товары — повтори обновление позже.");
   }
   try{
     const me=await fetch(api()+"/api/me",{headers:authHeaders(),cache:"no-store"}); if(me.ok){const d=await me.json();setUser(d.user)}
   }catch{}
   try{
     const cr=await fetch(api()+"/api/categories",{cache:"no-store"}); if(cr.ok){const d=await cr.json();setCategories(d.items||[])}
   }catch{}
   try{await loadFavorites()}catch{}
   try{await loadNotifications()}catch{}
   if(!catalogLoaded && process.env.NODE_ENV==="production") setMessage("Каталог API временно недоступен. Проверь соединение и обнови Nookly.");
 }
 async function loadOrders(){const r=await fetch(api()+"/api/orders",{headers:authHeaders()});if(r.ok)setOrders((await r.json()).items||[])}
 async function loadNotifications(){const r=await fetch(api()+"/api/notifications",{headers:authHeaders()});if(r.ok)setNotifications((await r.json()).items||[])}
 async function readNotification(id:string){const r=await fetch(api()+"/api/notifications/"+id+"/read",{method:"POST",headers:authHeaders()});if(r.ok)setNotifications(prev=>prev.map(n=>n.id===id?{...n,read_at:new Date().toISOString()}:n))}
 async function loadSeller(){const r=await fetch(api()+"/api/seller/products",{headers:authHeaders()});if(r.ok)setSellerProducts((await r.json()).items||[])}
 const categoryNames=useMemo(()=>["Все",...categories.map((x:any)=>String(x.name)).filter(Boolean)], [categories]);
 const items=useMemo(()=>products.filter(p=>(cat==="Все"||p.category===cat||p.category_id===categories.find((x:any)=>x.name===cat)?.id)&&(!q||p.title.toLowerCase().includes(q.toLowerCase()))),[products,cat,q,categories]);
 const total=cart.reduce((s,p)=>s+Number(p.price_minor??Math.round((p.price||0)*100)),0);
 const add=(p:Product)=>setCart(c=>[...c,p]);
 if(!booted) return <div className="app"><main className="shell boot"><div className="boot-logo"><img src="/nookly-logo.svg" alt="Nookly" onError={e=>{e.currentTarget.style.display="none"}}/></div><h1>Nookly</h1><p>Загружаем маркетплейс…</p></main></div>;
 const loadFavorites=async()=>{const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";if(!init)return;const r=await fetch(api()+"/api/favorites",{headers:{Authorization:"tma "+init}});if(r.ok){const d=await r.json();setFavoriteIds(new Set((d.items||d||[]).map((x:any)=>x.product_id||x.id)))}}; 
 const toggleFavorite=async(p:Product)=>{const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";if(!init){setMessage("Открой Nookly внутри Telegram.");return}const isFav=favoriteIds.has(p.id);const r=await fetch(api()+"/api/favorites/"+p.id,{method:isFav?"DELETE":"POST",headers:{Authorization:"tma "+init}});if(!r.ok){setMessage("Не удалось изменить избранное");return}setFavoriteIds(prev=>{const n=new Set(prev);if(isFav)n.delete(p.id);else n.add(p.id);return n});setMessage(isFav?"Удалено из избранного":"Товар добавлен в избранное.");};
 const checkout=async()=>{
   if(!cart.length)return;
   if(!tg?.initData){setMessage("Открой Nookly внутри Telegram для оплаты.");return}
   setLoading(true);setMessage("");
   try{
    const grouped=Object.values(cart.reduce((a,p)=>{a[p.id]=(a[p.id]||{productId:p.id,quantity:0});a[p.id].quantity++;return a},{} as Record<string,{productId:string;quantity:number}>));
    const r=await fetch(api()+"/api/orders",{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({items:grouped})});
    if(!r.ok)throw new Error((await r.json()).error||"Не удалось создать заказ");
    const data=await r.json();
    const pr=await fetch(api()+"/api/orders/"+data.order.id+"/payment",{method:"POST",headers:authHeaders()});
    if(!pr.ok){
      let body:any=null; try{body=await pr.json()}catch{}
      throw new Error(body?.error||("Ошибка оплаты ("+pr.status+")"));
    }
    const payment=await pr.json();
    if(!payment.invoiceLink||typeof tg.openInvoice!=="function")throw new Error("Telegram payment window is unavailable");
    const orderId=String(data.order.id);
    setMessage("Открываем оплату PayMaster TEST…");
    tg.openInvoice(payment.invoiceLink,(status)=>{
      if(status==="paid"){
        setMessage("Telegram сообщил об оплате. Проверяем подтверждение на сервере…");loadOrders();
      }else if(status==="cancelled"){
        setMessage("Оплата отменена. Заказ сохранён на 30 минут — можно открыть оплату снова.");
      }else if(status==="failed"){
        setMessage("Оплата не прошла. Попробуй ещё раз из заказа.");
      }else{
        setMessage("Ожидаем подтверждение оплаты…");
      }
    });
    const started=Date.now();
    const poll=async()=>{
      while(Date.now()-started<30000){
        await new Promise(resolve=>setTimeout(resolve,2000));
        const rr=await fetch(api()+"/api/orders",{headers:authHeaders()});
        if(!rr.ok)continue;
        const list=(await rr.json()).items||[];
        const current=list.find((o:any)=>o.id===orderId);
        if(current?.status&&current.status!=="created"){
          setOrders(list);
          if(["paid","seller_confirmed","ready_for_handover","completed"].includes(current.status)){
            setCart([]);setTab("orders");setMessage("Оплата подтверждена сервером. Заказ передан продавцу.");
          }else if(["cancelled","refunded","disputed","refund_pending"].includes(current.status)){
            setTab("orders");setMessage("Заказ получил статус: "+statusRu(current.status)+". Открой его в разделе «Заказы».");loadOrders();
          }
          return;
        }
      }
    };
    void poll();
   }catch(e){setMessage(e instanceof Error?e.message:"Ошибка оплаты")}finally{setLoading(false)}
 };
 if(selected)return <div className="app"><main className="shell detail"><button className="icon-btn back" onClick={()=>setSelected(null)}>←</button><div className="detail-image"><img src={selected.image||selected.image_url||""} alt=""/></div><h1>{selected.title}</h1><div className="rating"><b>★ {selected.rating||"—"}</b> {selected.reviews?"("+selected.reviews+" отзыва)":""}</div><div className="seller">♙ {selected.seller||"Продавец Nookly"}</div><div className="price">{money(selected.price_minor??Math.round((selected.price||0)*100),selected.currency)}</div><div className="meta"><div>Наличие<b>{(selected.available_stock??1)>0?"В наличии":"Нет"}</b></div><div>Формат<b>Самовывоз</b></div><div>Комиссия<b>5% с продавца</b></div></div><p className="desc">{selected.description||"Товар из каталога Nookly. Место и время получения покупатель согласовывает с продавцом в чате."}</p><div className="row" style={{gap:8}}>{selected.seller_id&&<button className="secondary wide" onClick={async()=>{const r=await fetch(api()+"/api/chat/threads",{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({sellerId:selected.seller_id,productId:selected.id})});if(r.ok){setMessage("Чат с продавцом открыт. Перейди во вкладку «Чаты».");setTab("chat")}else setMessage("Не удалось открыть чат с продавцом")}}>Написать продавцу</button>}<button className="primary wide sticky-buy" onClick={()=>{add(selected);setSelected(null)}}>Добавить в корзину</button></div></main></div>;

 const page=tab==="home"?<><label className="search">⌕<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Что ищем?"/></label><div className="chips">{categoryNames.map(c=><button key={c} className={"chip "+(cat===c?"active":"")} onClick={()=>setCat(c)}>{c}</button>)}</div><div className="section-head"><h2>Популярное</h2><span>{items.length} товаров</span></div><div className="grid">{items.map(p=><Card key={p.id} p={p} open={()=>setSelected(p)} add={()=>add(p)} toggleFavorite={toggleFavorite} isFavorite={favoriteIds.has(p.id)}/>)}</div></>
 :tab==="catalog"?<><div className="hero"><h1>Каталог</h1><p>Товары от продавцов твоего круга. Без лишних посредников.</p></div><div className="grid">{items.map(p=><Card key={p.id} p={p} open={()=>setSelected(p)} add={()=>add(p)} toggleFavorite={toggleFavorite} isFavorite={favoriteIds.has(p.id)}/>)}</div></>
 :tab==="orders"?<Orders orders={orders} onLoad={loadOrders}/>
 :tab==="chat"?<Chats authHeaders={authHeaders} setMessage={setMessage}/>
 :tab==="profile"?<Profile user={user} sellerProducts={sellerProducts} loadSeller={loadSeller} setMessage={setMessage} categories={categories} notifications={notifications} readNotification={readNotification} openProduct={async(id)=>{const r=await fetch(api()+"/api/products/"+id,{cache:"no-store"});if(r.ok){const d=await r.json();const p=d.product;if(p){setSelected({...p,image:p.images?.[0]?.url||p.image_url||"",image_url:p.images?.[0]?.url||p.image_url||""});return;}}setMessage("Товар больше недоступен в каталоге.");}}/>
 :<Cart cart={cart} total={total} checkout={checkout} loading={loading}/>;

 return <div className="app"><main className="shell"><header className="top"><div className="brand"><div className="brand-mark"><img src="/nookly-logo.svg" alt="Nookly"/></div><div><div className="brand-name">Nookly</div><div className="tagline">Твой маркетплейс. Свои люди. Свои товары.</div></div></div><button className="icon-btn" onClick={()=>{setTab("profile")}} aria-label="Уведомления">🔔{notifications.some(n=>!n.read_at)&&<span style={{position:"absolute",margin:"-25px 0 0 25px",width:7,height:7,borderRadius:"50%",background:"var(--gold)"}}/>}</button></header>{message&&<div className="hero" style={{marginBottom:10}}><p>{message}</p></div>}{page}{cart.length>0&&tab!=="cart"&&<button className="fab" onClick={()=>setTab("cart")}>🛒<span>{cart.length}</span></button>}<nav className="bottom">{[["home","⌂","Главная"],["catalog","⌘","Каталог"],["orders","▣","Заказы"],["chat","◌","Чаты"],["profile","♙","Профиль"]].map(([id,ico,label])=><button key={id} className={"nav "+(tab===id?"active":"")} onClick={()=>{setTab(id);if(id==="orders")loadOrders();if(id==="profile"&&user?.role==="seller")loadSeller()}}><strong>{ico}</strong>{label}</button>)}</nav></main></div>;
}

function Card({p,open,add,toggleFavorite,isFavorite}:{p:Product;open:()=>void;add:()=>void;toggleFavorite:(p:Product)=>void;isFavorite:boolean}){const price=p.price_minor??Math.round((p.price||0)*100);return <article className="card"><button onClick={open} style={{border:0,padding:0,width:"100%",background:"transparent",color:"inherit",textAlign:"left"}}><div className="card-img"><img src={p.image||p.image_url||""} alt={p.title}/><span className="badge">{(p.available_stock??1)>0?"В наличии":"Нет в наличии"}</span></div><div className="card-body"><div className="card-title">{p.title}</div><div className="rating"><b>★ {p.rating||"—"}</b> {p.reviews?"("+p.reviews+")":""}</div><div className="seller">{p.seller||"Продавец"}</div><div className="price">{money(price,p.currency)}</div></div></button><button className="bookmark" aria-label={(isFavorite?"Удалить из":"Добавить в")+" избранное: "+p.title} onClick={e=>{e.stopPropagation();toggleFavorite(p)}}>{isFavorite?"♥":"♡"}</button><button className="primary card-buy" disabled={(p.available_stock??1)<=0} onClick={e=>{e.stopPropagation();add()}}>{(p.available_stock??1)>0?"В корзину":"Нет в наличии"}</button></article>}

function Cart({cart,total,checkout,loading}:{cart:Product[];total:number;checkout:()=>void;loading:boolean}){return <div className="hero"><h1>Корзина</h1>{!cart.length?<p>Корзина пуста. Добавь товары из каталога.</p>:cart.map((p,i)=><div className="row" key={i} style={{padding:"12px 0",borderBottom:"1px solid #20323b"}}><img src={p.image||p.image_url||""} alt="" width="54" height="54" style={{borderRadius:12,objectFit:"cover"}}/><div style={{flex:1}}><b style={{fontSize:12}}>{p.title}</b><div className="small">{p.seller||"Продавец"}</div></div><b>{money(p.price_minor??Math.round((p.price||0)*100),p.currency)}</b></div>)}{cart.length>0&&<><p className="small">Комиссия Nookly 5% удерживается из суммы продавца, а не добавляется покупателю.</p><h2>Итого {money(total,"RUB")}</h2><button className="primary wide" onClick={checkout} disabled={loading}>{loading?"Создаём оплату…":"Оформить и оплатить в Telegram"}</button></>}</div>}

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

function statusRu(s:string){return ({created:"Ожидает оплаты",paid:"Оплачен",seller_confirmed:"Продавец подтвердил",ready_for_handover:"Готов к получению",completed:"Завершён",cancelled:"Отменён",refunded:"Возврат",refund_pending:"Возврат ожидает подтверждения",disputed:"Спор",draft:"Черновик",published:"Опубликован",archived:"Архив"} as Record<string,string>)[s]||s}

function Profile({user,sellerProducts,loadSeller,setMessage,categories,notifications,readNotification,openProduct}:{user:User|null;sellerProducts:any[];loadSeller:()=>void;setMessage:(s:string)=>void;categories:any[];notifications:any[];readNotification:(id:string)=>Promise<void>;openProduct:(id:string)=>Promise<void>}){
 const seller=user?.role==="seller";
 const admin=user?.role==="admin";
 const [mode,setMode]=useState<"profile"|"seller"|"favorites"|"notifications"|"admin"|"onboard">("profile");
 const [fav,setFav]=useState<any[]>([]);
 async function favorites(){const r=await fetch(api()+"/api/favorites",{headers:{Authorization:"tma "+(typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"")}});if(r.ok)setFav((await r.json()).items||[]);setMode("favorites")}
 if(mode==="notifications")return <div className="hero"><button className="icon-btn" onClick={()=>setMode("profile")}>←</button><h1>Уведомления</h1>{!notifications.length?<p>Новых событий пока нет.</p>:<div className="menu">{notifications.map(n=><button key={n.id} onClick={()=>readNotification(n.id)} style={{opacity:n.read_at?0.6:1,textAlign:"left"}}><span><b>{n.title}</b><br/><small>{n.body||""}</small></span><span>{n.read_at?"":"●"}</span></button>)}</div>}</div>;
 if(mode==="favorites")return <div className="hero"><button className="icon-btn" onClick={()=>setMode("profile")}>←</button><h1>Избранное</h1>{!fav.length?<p>Здесь пока ничего нет.</p>:<div className="menu">{fav.map(x=><button key={x.id} onClick={()=>openProduct(x.id)}><span>{x.title}</span><span>{money(x.price_minor,x.currency)} ›</span></button>)}</div>}</div>;
 if(mode==="seller")return <SellerPanel products={sellerProducts} loadSeller={loadSeller} setMessage={setMessage} back={()=>setMode("profile")} categories={categories}/>;
 if(mode==="onboard")return <SellerOnboard setMessage={setMessage} onDone={()=>window.location.reload()} back={()=>setMode("profile")}/>;
 if(mode==="admin")return <AdminPanel setMessage={setMessage} back={()=>setMode("profile")}/>;
 return <div><div className="profile-card"><div className="row"><div className="avatar">{(user?.first_name||"Ч").slice(0,1)}</div><div><b>{user?.first_name||"Покупатель"}</b><div className="small">{seller?"Продавец":"Покупатель"}</div></div></div><div className="menu"><button onClick={favorites}>Избранное <span>♡ ›</span></button>{seller&&<button onClick={()=>{loadSeller();setMode("seller")}}>Кабинет продавца <span>›</span></button>}{!seller&&!admin&&<button onClick={()=>setMode("onboard")}>Стать продавцом <span>›</span></button>}<button onClick={()=>setMode("notifications")}>Уведомления <span>{notifications.filter(n=>!n.read_at).length||""} ›</span></button>
 {admin&&<button onClick={()=>setMode("admin")}>Админ-панель <span>›</span></button>}<button onClick={()=>setMessage("Безопасная оплата проходит внутри Telegram. Комиссия Nookly удерживается с продавца.")}>Оплата и безопасность <span>›</span></button><button onClick={()=>setMessage("Получение: продавец и покупатель договариваются о месте и времени в чате.")}>Как получить заказ <span>›</span></button></div></div></div>
}
function SellerOnboard({setMessage,onDone,back}:{setMessage:(s:string)=>void;onDone:()=>void;back:()=>void}){
 const [storeName,setStoreName]=useState(""),[description,setDescription]=useState(""),[busy,setBusy]=useState(false);
 async function submit(){
  if(storeName.trim().length<2)return;
  setBusy(true);
  try{
   const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";
   const r=await fetch(api()+"/api/seller/onboard",{method:"POST",headers:{"content-type":"application/json",Authorization:"tma "+init},body:JSON.stringify({storeName:storeName.trim(),description:description.trim()||undefined})});
   if(!r.ok)throw new Error((await r.json()).error||"Не удалось открыть кабинет продавца");
   setMessage("Кабинет продавца создан.");
   onDone();
  }catch(e){setMessage(e instanceof Error?e.message:"Ошибка");setBusy(false)}
 }
 return <div className="hero">
  <button className="icon-btn" onClick={back}>←</button>
  <h1>Стать продавцом</h1>
  <p>Продавай товары в Nookly как обычный пользователь. Подписки и абонентской платы нет.</p>
  <div className="form-card">
   <input value={storeName} onChange={e=>setStoreName(e.target.value)} placeholder="Название магазина или имя" maxLength={100}/>
   <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Коротко о товарах (необязательно)" rows={4} maxLength={1000}/>
   <button className="primary wide" disabled={busy||storeName.trim().length<2} onClick={submit}>{busy?"Создаём кабинет…":"Открыть кабинет продавца"}</button>
  </div>
 </div>
}

function AdminPanel({setMessage,back}:{setMessage:(s:string)=>void;back:()=>void}){
 const [dash,setDash]=useState<any>(null),[payouts,setPayouts]=useState<any[]>([]),[disputes,setDisputes]=useState<any[]>([]),[moderation,setModeration]=useState<any[]>([]);
 const init=()=>typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"",h=()=>({Authorization:"tma "+init()});
 async function load(){const headers=h();const [d,p,ds,m]=await Promise.all([fetch(api()+"/api/admin/dashboard",{headers}),fetch(api()+"/api/admin/payouts",{headers}),fetch(api()+"/api/admin/disputes",{headers}),fetch(api()+"/api/admin/moderation",{headers})]);if(d.ok)setDash(await d.json());if(p.ok)setPayouts((await p.json()).items||[]);if(ds.ok)setDisputes((await ds.json()).items||[]);if(m.ok)setModeration((await m.json()).items||[])}
 useEffect(()=>{load()},[]);
 async function resolvePayout(id:string,status:"completed"|"failed"){const r=await fetch(api()+"/api/admin/payouts/"+id+"/resolve",{method:"POST",headers:{"content-type":"application/json",...h()},body:JSON.stringify({status})});if(!r.ok){setMessage((await r.json()).error||"Не удалось обработать вывод");return}await load();setMessage(status==="completed"?"Вывод отмечен выполненным.":"Вывод отклонён, средства возвращены на баланс.");}
 async function resolveDispute(id:string,resolution:"refund"|"reject"){const r=await fetch(api()+"/api/admin/disputes/"+id+"/resolve",{method:"POST",headers:{"content-type":"application/json",...h()},body:JSON.stringify({resolution})});if(!r.ok){setMessage((await r.json()).error||"Не удалось закрыть спор");return}await load();setMessage("Спор обработан.");}
 async function moderate(id:string,action:"approve"|"reject"){const r=await fetch(api()+"/api/admin/products/"+id+"/moderate",{method:"POST",headers:{"content-type":"application/json",...h()},body:JSON.stringify({action})});if(!r.ok){setMessage((await r.json()).error||"Не удалось изменить модерацию");return}await load();setMessage(action==="approve"?"Товар опубликован.":"Товар отклонён.");}
 return <div><button className="icon-btn" onClick={back}>←</button><div className="seller-hero"><div><div className="eyebrow">АДМИНИСТРАТОР</div><h1>Панель Nookly</h1><p>Контроль продаж, споров, выводов и модерации.</p></div><div className="balance">{money(Number(dash?.commissionMinor||0),"RUB")}</div></div><div className="seller-stats"><div><b>{dash?.users||0}</b><span>Пользователей</span></div><div><b>{dash?.sellers||0}</b><span>Продавцов</span></div><div><b>{dash?.orders||0}</b><span>Заказов</span></div><div><b>{dash?.openDisputes||0}</b><span>Споров</span></div></div><div className="section-head"><h2>Модерация</h2><span>{moderation.length}</span></div><div className="seller-products">{!moderation.length?<div className="empty">Нет товаров на проверке.</div>:moderation.map(x=><div className="seller-product" key={x.id}><div><b>{x.title}</b><span>{x.seller_name} · {money(Number(x.price_minor),x.currency)}</span></div><div className="row"><button className="primary mini" onClick={()=>moderate(x.product_id,"approve")}>Одобрить</button><button className="secondary mini" onClick={()=>moderate(x.product_id,"reject")}>Отклонить</button></div></div>)}</div><div className="section-head"><h2>Выводы</h2><span>{payouts.filter(x=>x.status==="pending").length} ожидают</span></div><div className="seller-products">{!payouts.length?<div className="empty">Заявок нет.</div>:payouts.map(x=><div className="seller-product" key={x.id}><div><b>{x.seller_name||"Продавец"}</b><span>{x.status} · {new Date(x.created_at).toLocaleString("ru-RU")}</span></div>{x.status==="pending"?<div className="row"><button className="primary mini" onClick={()=>resolvePayout(x.id,"completed")}>Выплатить</button><button className="secondary mini" onClick={()=>resolvePayout(x.id,"failed")}>Отклонить</button></div>:<strong>{money(Number(x.amount_minor),x.currency)}</strong>}</div>)}</div><div className="section-head"><h2>Споры</h2><span>{disputes.filter(x=>x.status==="open").length} открытых</span></div><div className="seller-products">{!disputes.length?<div className="empty">Споров нет.</div>:disputes.map(x=><div className="seller-product" key={x.id}><div><b>{x.buyer_name||"Покупатель"} · {x.reason}</b><span>{x.description}</span></div>{x.status==="open"?<div className="row"><button className="primary mini" onClick={()=>resolveDispute(x.id,"refund")}>Возврат</button><button className="secondary mini" onClick={()=>resolveDispute(x.id,"reject")}>Отклонить</button></div>:<strong>{x.status}</strong>}</div>)}</div></div>
}

function SellerPanel({products,loadSeller,setMessage,back,categories}:{products:any[];loadSeller:()=>void;setMessage:(s:string)=>void;back:()=>void;categories:any[]}){
 const [form,setForm]=useState(false),[editingId,setEditingId]=useState<string|null>(null),[title,setTitle]=useState(""),[price,setPrice]=useState(""),[stock,setStock]=useState("1"),[description,setDescription]=useState(""),[imageUrl,setImageUrl]=useState(""),[imageMode,setImageMode]=useState<"upload"|"search">("upload"),[imageQuery,setImageQuery]=useState(""),[imageResults,setImageResults]=useState<any[]>([]),[imageSearching,setImageSearching]=useState(false),[categoryId,setCategoryId]=useState(""),[fulfillment,setFulfillment]=useState<"pickup"|"meeting">("pickup"),[saving,setSaving]=useState(false);
 const [balance,setBalance]=useState<any>(null),[sellerOrders,setSellerOrders]=useState<any[]>([]),[payout,setPayout]=useState(""),[reliability,setReliability]=useState<any>(null);
 const init=()=>typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";
 async function loadFinance(){const h={Authorization:"tma "+init()};const [b,o,r]=await Promise.all([fetch(api()+"/api/seller/balance",{headers:h}),fetch(api()+"/api/seller/orders",{headers:h}),fetch(api()+"/api/seller/reliability",{headers:h})]);if(b.ok)setBalance(await b.json());if(o.ok)setSellerOrders((await o.json()).items||[]);if(r.ok)setReliability(await r.json())}
 useEffect(()=>{loadFinance()},[]);
 async function requestPayout(){const amount=Math.round(Number(payout)*100);if(!amount)return;const r=await fetch(api()+"/api/seller/payouts",{method:"POST",headers:{"content-type":"application/json",Authorization:"tma "+init()},body:JSON.stringify({amountMinor:amount,currency:"RUB"})});if(!r.ok){setMessage((await r.json()).error||"Не удалось создать вывод");return}setPayout("");await loadFinance();setMessage("Заявка на вывод создана.");}
 async function confirmOrder(id:string){const r=await fetch(api()+"/api/seller-orders/"+id+"/confirm",{method:"POST",headers:{Authorization:"tma "+init()}});if(!r.ok){setMessage((await r.json()).error||"Не удалось подтвердить заказ");return}await loadFinance();setMessage("Заказ подтверждён. Теперь отметьте его готовым к получению.");}
 async function rejectOrder(id:string){const r=await fetch(api()+"/api/seller-orders/"+id+"/reject",{method:"POST",headers:{Authorization:"tma "+init()}});if(!r.ok){setMessage((await r.json()).error||"Не удалось отменить заказ");return}await loadFinance();setMessage("Заказ отменён. Надёжность продавца пересчитана.");}
 async function readyOrder(id:string){const r=await fetch(api()+"/api/seller-orders/"+id+"/ready",{method:"POST",headers:{Authorization:"tma "+init()}});if(!r.ok){setMessage((await r.json()).error||"Не удалось отметить готовность");return}await loadFinance();setMessage("Заказ готов. Покупателю показан код получения.");}
 async function completeOrder(id:string){const code=window.prompt("Введите 6-значный код, который показал покупатель:")?.trim()||"";if(!/^\\d{6}$/.test(code))return;const r=await fetch(api()+"/api/seller-orders/"+id+"/complete",{method:"POST",headers:{"content-type":"application/json",Authorization:"tma "+init()},body:JSON.stringify({code})});if(!r.ok){setMessage((await r.json()).error||"Неверный код");return}await loadFinance();setMessage("Получение подтверждено. Средства доступны для вывода.");}
 async function searchImages(){
  const query=(imageQuery||title).trim();if(query.length<2)return;
  setImageSearching(true);
  try{const r=await fetch(api()+"/api/images/search?q="+encodeURIComponent(query)+"&limit=8");const d=await r.json();if(!r.ok)throw new Error(d.error||"Не удалось найти изображения");setImageResults(d.items||[]);}
  catch(e){setMessage(e instanceof Error?e.message:"Ошибка поиска изображений")}finally{setImageSearching(false)}
 }
 function pickImage(url:string){setImageUrl(url);setImageMode("search");}
 function handleImageFile(file:File|null){
  if(!file)return;
  if(!file.type.startsWith("image/")){setMessage("Можно выбрать только изображение.");return}
  if(file.size>6*1024*1024){setMessage("Фото слишком большое. Максимум 6 МБ.");return}
  const reader=new FileReader();
  reader.onload=()=>{const src=String(reader.result||"");const img=new Image();img.onload=()=>{const max=1400;const scale=Math.min(1,max/Math.max(img.width,img.height));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext("2d")?.drawImage(img,0,0,canvas.width,canvas.height);const compressed=canvas.toDataURL("image/jpeg",.82);if(compressed.length>2_000_000){setMessage("Фото после сжатия всё ещё слишком большое. Выбери другое.");return}setImageUrl(compressed);setImageMode("upload");};img.src=src;};
  reader.readAsDataURL(file);
 }
 function resetForm(){setTitle("");setPrice("");setStock("1");setDescription("");setImageUrl("");setImageQuery("");setImageResults([]);setCategoryId("");setFulfillment("pickup");setEditingId(null);setForm(false)}
function editProduct(p:any){setEditingId(p.id);setTitle(p.title||"");setPrice(String(Number(p.price_minor||0)/100));setStock(String(p.stock??0));setDescription(p.description||"");setImageUrl(p.image_url||"");setImageMode("upload");setImageQuery(p.title||"");setImageResults([]);setCategoryId(p.category_id||"");setFulfillment(p.fulfillment_type==="meeting"?"meeting":"pickup");setForm(true)}
async function create(){
 const priceValue=Number(price.replace(",","."));const stockValue=Number(stock);
 if(!title.trim()||!Number.isFinite(priceValue)||priceValue<=0||!Number.isInteger(stockValue)||stockValue<0)return;
 setSaving(true);const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";
 try{
  const payload={title:title.trim(),priceMinor:Math.round(priceValue*100),currency:"RUB",stock:stockValue,description:description.trim()||undefined,imageUrl:imageUrl.trim()||undefined,categoryId:categoryId||undefined,fulfillmentType:fulfillment};
  const url=editingId?api()+"/api/seller/products/"+editingId:api()+"/api/seller/products";
  const r=await fetch(url,{method:editingId?"PATCH":"POST",headers:{"content-type":"application/json",Authorization:"tma "+init},body:JSON.stringify(payload)});
  if(!r.ok)throw new Error((await r.json()).error||(editingId?"Не удалось сохранить товар":"Не удалось создать товар"));
  resetForm();loadSeller();setMessage(editingId?"Товар обновлён. Изменения уже видны в каталоге.":"Товар опубликован и уже доступен в каталоге.");
 }catch(e){setMessage(e instanceof Error?e.message:"Ошибка")}finally{setSaving(false)}
}
async function deleteProduct(p:any){
 if(!window.confirm("Удалить «"+p.title+"»? Товар исчезнет из каталога."))return;
 const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";
 const r=await fetch(api()+"/api/seller/products/"+p.id,{method:"DELETE",headers:{Authorization:"tma "+init}});
 if(!r.ok){setMessage((await r.json()).error||"Не удалось удалить товар");return}
 const d=await r.json();loadSeller();setMessage(d.mode==="archived"?"Товар скрыт из каталога, история заказов сохранена.":"Товар удалён.");
}
 const activeOrders=sellerOrders.filter(o=>["paid","seller_confirmed","ready_for_handover"].includes(o.status));
 const lowStock=products.filter(p=>Number(p.stock??p.available_stock??0)>0&&Number(p.stock??p.available_stock??0)<=2);
 const outOfStock=products.filter(p=>Number(p.stock??p.available_stock??0)<=0);
 const completedSales=sellerOrders.filter(o=>o.status==="completed").length;
 const needsAction=sellerOrders.filter(o=>o.status==="paid"||o.status==="seller_confirmed"||o.status==="ready_for_handover").length;
 return <div><button className="icon-btn" onClick={back}>←</button><div className="seller-hero"><div><div className="eyebrow">КАБИНЕТ ПРОДАВЦА</div><h1>Мои продажи</h1><p>Комиссия Nookly — 5%. Вывод средств выполняется после завершения заказа.</p></div><div className="balance">{money(balance?.availableMinor||0,"RUB")}</div></div><div className="seller-stats"><div><b>{products.length}</b><span>Товаров</span></div><div><b>{money(balance?.availableMinor||0,"RUB")}</b><span>Доступно</span></div><div><b>{needsAction}</b><span>Нужно сделать</span></div><div><b>{completedSales}</b><span>Завершено</span></div></div>
<div className="seller-quick"><button className="primary" disabled={reliability?.level==="blocked"} onClick={()=>{setEditingId(null);setForm(true);window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"})}}>＋ Новый товар</button><button className="secondary" onClick={()=>document.getElementById("seller-orders")?.scrollIntoView({behavior:"smooth"})}>📦 Заказы {needsAction>0&&<b>{needsAction}</b>}</button><button className="secondary" onClick={()=>document.getElementById("seller-products")?.scrollIntoView({behavior:"smooth"})}>🛍 Товары</button></div>
{(lowStock.length||outOfStock.length)&&<div className="seller-alerts">{outOfStock.length>0&&<div className="seller-alert danger"><b>⚠️ Закончились</b><span>{outOfStock.length} {outOfStock.length===1?"товар":"товара"} скрыто из каталога</span></div>}{lowStock.length>0&&<div className="seller-alert"><b>🔥 Заканчиваются</b><span>{lowStock.length} {lowStock.length===1?"товар":"товара"} — осталось 2 шт. или меньше</span></div>}</div>}
<div className="form-card finance-card"><div><b>Надёжность продавца</b><span className="small">Оценка: {reliability?.score ?? "—"} / 100 · {reliability?.level==="stable"?"Стабильный":reliability?.level==="warning"?"Предупреждение":reliability?.level==="restricted"?"Ограничен":reliability?.level==="blocked"?"Заблокирован":"—"}</span>{reliability?.level==="restricted"&&<span className="small">Новые заказы временно недоступны. Улучшайте качество исполнения заказов.</span>}{reliability?.level==="blocked"&&<span className="small">Продажи и публикация товаров заблокированы.</span>}</div></div>
<div className="form-card finance-card"><div><b>Вывод средств</b><span className="small">Доступно после подтверждения получения покупателем.</span><div className="row"><input value={payout} onChange={e=>setPayout(e.target.value)} placeholder="Сумма, ₽" inputMode="decimal"/><button className="primary mini" onClick={requestPayout}>Вывести</button></div></div></div><div id="seller-products" className="section-head"><h2>Мои товары</h2><button className="primary mini" disabled={reliability?.level==="blocked"} onClick={()=>{if(form)resetForm();else{setEditingId(null);setForm(true)}}}>＋ Добавить</button></div>{form&&<div className="form-card"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Название товара"/><input value={price} onChange={e=>setPrice(e.target.value)} placeholder="Цена, ₽" inputMode="decimal"/><input value={stock} onChange={e=>setStock(e.target.value)} placeholder="Остаток" inputMode="numeric"/><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Описание товара" rows={3}/><div className="image-picker"><div className="image-tabs"><button type="button" className={imageMode==="upload"?"active":""} onClick={()=>setImageMode("upload")}>📷 Фото</button><button type="button" className={imageMode==="search"?"active":""} onClick={()=>setImageMode("search")}>🌐 Найти в интернете</button></div>{imageMode==="upload"?<label className="upload-box"><input type="file" accept="image/*" onChange={e=>handleImageFile(e.target.files?.[0]||null)}/><span>Выбрать фото с устройства</span><small>JPG, PNG или WEBP · до 6 МБ</small></label>:<><div className="row"><input value={imageQuery} onChange={e=>setImageQuery(e.target.value)} placeholder={title||"Например: рюкзак туристический"}/><button type="button" className="primary mini" disabled={imageSearching} onClick={searchImages}>{imageSearching?"Ищем…":"Найти"}</button></div>{imageResults.length>0&&<div className="image-results">{imageResults.map((x:any)=><button type="button" key={x.id} className={"image-result "+(imageUrl===x.image?"selected":"")} onClick={()=>pickImage(x.image)}><img src={x.thumbnail||x.image} alt={x.title||"Изображение"}/><span>{x.title||"Изображение"}{x.creator&&<small>{x.creator}{x.license?" · "+x.license:""}</small>}</span></button>)}</div>}<small className="small">Поиск использует Openverse — выбирай изображения с подходящей лицензией.</small></>}{imageUrl&&<div className="image-preview"><img src={imageUrl} alt="Предпросмотр"/><button type="button" className="secondary mini" onClick={()=>setImageUrl("")}>Удалить</button></div>}</div><select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Категория</option>{categories.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={fulfillment} onChange={e=>setFulfillment(e.target.value as "pickup"|"meeting")}><option value="pickup">Самовывоз</option><option value="meeting">Встреча</option></select><div className="row"><button className="primary wide" disabled={saving} onClick={create}>{saving?(editingId?"Сохраняем…":"Публикуем…"):(editingId?"Сохранить изменения":"Опубликовать товар")}</button>{editingId&&<button type="button" className="secondary mini" onClick={resetForm}>Отмена</button>}</div></div>}<div className="seller-products">{products.length?products.map(p=><div className="seller-product" key={p.id}><div className="seller-product-main">{p.image_url&&<img className="seller-product-thumb" src={p.image_url} alt="" />}<div><b>{p.title}</b><span>{statusRu(p.status||"draft")} · остаток {p.stock??p.available_stock??0}{p.reserved?` · зарезервировано ${p.reserved}`:""}</span></div></div><div className="seller-product-actions"><strong>{money(p.price_minor,p.currency)}</strong><button className="secondary mini" onClick={()=>editProduct(p)}>Изменить</button><button className="secondary mini danger" onClick={()=>deleteProduct(p)}>Удалить</button></div></div>):<div className="empty">Добавь первый товар — после публикации он сразу появится в каталоге.</div>}</div>
<div id="seller-orders" className="section-head"><h2>Заказы продавца</h2><span>{sellerOrders.length}</span></div>
<div className="seller-products">{sellerOrders.slice(0,8).map(o=><div className="seller-product" key={o.id}><div><b>#{o.order_id.slice(0,8)}</b><span>{statusRu(o.status)} · {o.fulfillment_type}</span></div>{o.status==="paid"?<div className="row"><button className="primary mini" onClick={()=>confirmOrder(o.id)}>Подтвердить</button><button className="secondary mini" onClick={()=>rejectOrder(o.id)}>Нет товара</button></div>:o.status==="seller_confirmed"?<button className="primary mini" onClick={()=>readyOrder(o.id)}>Готов к выдаче</button>:o.status==="ready_for_handover"?<button className="primary mini" onClick={()=>completeOrder(o.id)}>Выдать по коду</button>:<strong>{money(o.seller_amount_minor,o.currency||"RUB")}</strong>}</div>)}</div></div>
}


function Chats({authHeaders,setMessage}:{authHeaders:()=>Record<string,string>;setMessage:(s:string)=>void}){
 const [threads,setThreads]=useState<any[]>([]),[active,setActive]=useState<any|null>(null),[messages,setMessages]=useState<any[]>([]),[text,setText]=useState("");
 async function load(){const r=await fetch(api()+"/api/chat/threads",{headers:authHeaders()});if(r.ok)setThreads((await r.json()).items||[])}
 async function open(t:any){setActive(t);const r=await fetch(api()+"/api/chat/threads/"+t.id+"/messages",{headers:authHeaders()});if(r.ok)setMessages((await r.json()).messages||[])}
 async function send(){if(!active||!text.trim())return;const r=await fetch(api()+"/api/chat/threads/"+active.id+"/messages",{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({body:text.trim()})});if(r.ok){setText("");open(active)}else setMessage("Не удалось отправить сообщение")}
 useEffect(()=>{load()},[]);
 return <div className="hero"><h1>Чаты</h1>{active?<><button className="icon-btn" onClick={()=>setActive(null)}>← Назад</button><div className="menu">{messages.map(m=><div key={m.id} className="row" style={{padding:"10px 0"}}><span>{m.body}</span></div>)}</div><div className="row" style={{marginTop:12}}><input className="chat-input" value={text} onChange={e=>setText(e.target.value)} placeholder="Написать сообщение..." style={{flex:1}}/><button className="primary" onClick={send}>➤</button></div></>:threads.length?<div className="menu">{threads.map(t=><button key={t.id} onClick={()=>open(t)}>{t.product_title||"Чат"} <span>{t.last_message||"Открыть ›"}</span></button>)}</div>:<p>Открой товар и начни общение с продавцом.</p>}</div>
}
