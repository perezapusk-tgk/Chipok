"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

type Product = {
  id:string; title:string; price_minor?:number; price?:number; currency?:string;
  seller?:string; seller_id?:string; rating?:number; reviews?:number; category?:string; category_id?:string; image?:string;
  image_url?:string; available_stock?:number; status?:string; description?:string; fulfillment_type?:"meeting"|"pickup";
};
type Order = { id:string; status:string; total_minor:number; currency:string; created_at:string; seller_orders:any[]; payment_currency?:string; payment_amount_minor?:number; fx_rate_rub_per_payment?:number };
type User = { id:string; first_name:string; username?:string; role:string };

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready:()=>void; expand:()=>void; initData?:string; openLink?:(url:string)=>void; openTelegramLink?:(url:string)=>void;
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
const api=()=>process.env.NEXT_PUBLIC_API_URL||(process.env.NODE_ENV==="production"?"https://nookly-api.vercel.app":"http://localhost:3001");
const actionApi=(path:string)=>{const u=new URL(api()+path);u.searchParams.set("_action","20261026");return u.toString()};
const logo=()=>process.env.GITHUB_PAGES==="true"?"/Chipok/nookly-logo.svg?v=20261103":"/nookly-logo.svg?v=20261103";

export default function Home(){
 const [tab,setTab]=useState("home"),[cat,setCat]=useState("Все"),[q,setQ]=useState("");
 const [cart,setCart]=useState<Product[]>([]),[selected,setSelected]=useState<Product|null>(null);
 const [products,setProducts]=useState<Product[]>(process.env.NODE_ENV==="production"?[]:fallback),[orders,setOrders]=useState<Order[]>([]),[user,setUser]=useState<User|null>(null),[categories,setCategories]=useState<any[]>([]),[notifications,setNotifications]=useState<any[]>([]);
 const [sellerProducts,setSellerProducts]=useState<any[]>([]),[loading,setLoading]=useState(false),[message,setMessage]=useState("");
 const tg=typeof window!=="undefined" ? window.Telegram?.WebApp : undefined;
 const authHeaders=():Record<string,string>=>{const initData=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";const headers:Record<string,string>={};if(initData)headers.Authorization="tma "+initData;return headers;};

 const [booted,setBooted]=useState(false);
 useEffect(()=>{if(!message)return;const t=window.setTimeout(()=>setMessage(""),4200);return()=>window.clearTimeout(t)},[message]);
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
     const catalogUrl=new URL(api()+"/api/catalog"); catalogUrl.searchParams.set("limit","50"); catalogUrl.searchParams.set("_catalog","20261026"); let r:Response; try { r=await fetch(catalogUrl.toString(),{cache:"no-store",headers:{"Accept":"application/json"},signal:AbortSignal.timeout(12000)}); } catch { await new Promise(resolve=>setTimeout(resolve,800)); r=await fetch(catalogUrl.toString(),{cache:"no-store",headers:{"Accept":"application/json"},signal:AbortSignal.timeout(12000)}); }
     if(r.ok){
       const d=await r.json();
       const apiItems=(d.items||[]).map((p:any)=>({...p,price_minor:Number(p.price_minor),price:Number(p.price_minor)/100,image:p.image_url,seller:p.store_name||p.seller_first_name||(p.seller_username?"@"+p.seller_username:"Продавец Nookly")}));
       setProducts(apiItems);
       catalogLoaded=true;
     }else{
       setProducts(process.env.NODE_ENV==="production"?[]:fallback);
     }
   }catch{
     setProducts(process.env.NODE_ENV==="production"?[]:fallback);
     setMessage("Каталог временно не ответил. Обнови Nookly через несколько секунд.");
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
 async function loadSeller(){const r=await fetch(api()+"/api/seller/products",{headers:authHeaders()});if(r.ok)setSellerProducts(((await r.json()).items||[]).filter((x:any)=>x.status!=="archived"))}
 const categoryNames=useMemo(()=>["Все",...categories.map((x:any)=>String(x.name)).filter(Boolean)], [categories]);
 const items=useMemo(()=>products.filter(p=>(cat==="Все"||p.category===cat||p.category_id===categories.find((x:any)=>x.name===cat)?.id)&&(!q||p.title.toLowerCase().includes(q.toLowerCase()))),[products,cat,q,categories]);
 const total=cart.reduce((s,p)=>s+Number(p.price_minor??Math.round((p.price||0)*100)),0);

 const add=(p:Product)=>{
   const stock=Number(p.available_stock??0);
   setCart(c=>{
     const count=c.filter(x=>x.id===p.id).length;
     if(stock<=count){
       setMessage("Больше этого товара добавить нельзя: достигнут доступный остаток.");
       return c;
     }
     return [...c,p];
   });
 };
 if(!booted) return <div className="app"><main className="shell boot"><div className="boot-logo boot-logo-nookly"><img src={logo()} alt="Nookly" onError={e=>{e.currentTarget.src="/nookly-logo.svg?v=20261103"}}/></div><div className="boot-brand">Nookly</div><p>Загружаем маркетплейс…</p></main></div>;
 const loadFavorites=async()=>{const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";if(!init)return;const r=await fetch(api()+"/api/favorites",{headers:{Authorization:"tma "+init}});if(r.ok){const d=await r.json();setFavoriteIds(new Set((d.items||d||[]).map((x:any)=>x.product_id||x.id)))}}; 
 const toggleFavorite=async(p:Product)=>{const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";if(!init){setMessage("Открой Nookly внутри Telegram.");return}const isFav=favoriteIds.has(p.id);const r=await fetch(api()+"/api/favorites/"+p.id,{method:isFav?"DELETE":"POST",headers:{Authorization:"tma "+init}});if(!r.ok){setMessage("Не удалось изменить избранное");return}setFavoriteIds(prev=>{const n=new Set(prev);if(isFav)n.delete(p.id);else n.add(p.id);return n});setMessage(isFav?"Удалено из избранного":"Товар добавлен в избранное.");};
 const checkout=async()=>{
   if(!cart.length)return;
   if(!tg?.initData){setMessage("Открой Nookly внутри Telegram.");return}
   setLoading(true);setMessage("");
   const createdSellerIds=new Set<string>();
   let chatWarning=false;
   try{
    const bySeller=new Map<string,Product[]>();
    for(const p of cart){
      if(!p.seller_id)throw new Error("Не удалось определить продавца одного из товаров. Обнови каталог.");
      const group=bySeller.get(p.seller_id)||[];group.push(p);bySeller.set(p.seller_id,group);
    }
    for(const [sellerId,productsForSeller] of bySeller){
      const quantities=new Map<string,number>();
      productsForSeller.forEach(p=>quantities.set(p.id,(quantities.get(p.id)||0)+1));
      const items=Array.from(quantities.entries()).map(([productId,quantity])=>({productId,quantity}));
      const r=await fetch(api()+"/api/orders",{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({items})});
      if(!r.ok)throw new Error((await r.json()).error||"Не удалось создать заказ");
      createdSellerIds.add(sellerId);
      setCart(prev=>prev.filter(p=>p.seller_id!==sellerId));
      try{
        const chat=await fetch(api()+"/api/chat/threads",{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({sellerId,productId:productsForSeller[0].id})});
        if(!chat.ok)chatWarning=true;
      }catch{chatWarning=true}
    }
    await loadOrders();
    setTab("orders");
    setMessage(chatWarning?"Заказы созданы отдельно для каждого продавца. Если чат не появился, открой раздел «Чаты» и обнови список.":"Заказы созданы отдельно для каждого продавца. Переводи оплату каждому продавцу по реквизитам в заказе.");
   }catch(e){
    if(createdSellerIds.size){
      await loadOrders();
      setTab("orders");
      setMessage("Часть заказов уже создана. Остальные товары оставлены в корзине. "+(e instanceof Error?e.message:"Не удалось создать оставшиеся заказы."));
    }else{
      setMessage(e instanceof Error?e.message:"Не удалось создать заказ");
    }
   }finally{
    setLoading(false);
   }
 };
 if(selected)return <div className="app"><main className="shell detail"><button className="icon-btn back" onClick={()=>setSelected(null)}>←</button><div className="detail-image"><img src={selected.image||selected.image_url||logo()} alt={selected.title} onError={e=>{e.currentTarget.src=logo()}}/></div><h1>{selected.title}</h1><div className="rating"><b>★ {selected.rating||"—"}</b> {selected.reviews?"("+selected.reviews+" отзыва)":""}</div><div className="seller">♙ {selected.seller||"Продавец Nookly"}</div><div className="price">{money(selected.price_minor??Math.round((selected.price||0)*100),selected.currency)}</div><div className="meta"><div>Наличие<b>{Number(selected.available_stock??0)>0?"В наличии":"Нет"}</b></div><div>Формат<b>{selected.fulfillment_type==="meeting"?"Встреча":"Самовывоз"}</b></div><div>Оплата<b>Напрямую продавцу</b></div></div><p className="desc">{selected.description||"Товар из каталога Nookly. Место и время получения покупатель согласовывает с продавцом в чате."}</p><div className="row" style={{gap:8}}>{selected.seller_id&&<button className="secondary wide" onClick={async()=>{const r=await fetch(api()+"/api/chat/threads",{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({sellerId:selected.seller_id,productId:selected.id})});if(r.ok){setMessage("Чат с продавцом открыт. Перейди во вкладку «Чаты».");setTab("chat")}else setMessage("Не удалось открыть чат с продавцом")}}>Написать продавцу</button>}<button className="primary wide sticky-buy" disabled={Number(selected.available_stock??0)<=0} onClick={()=>{if(Number(selected.available_stock??0)>0){add(selected);setSelected(null)}}}>{Number(selected.available_stock??0)>0?"Добавить в корзину":"Нет в наличии"}</button></div></main></div>;

 const page=tab==="home"?<>
 <section className="market-hero">
   <div className="market-hero-glow"/>
   <div className="market-hero-copy">
     <span className="eyebrow">NOOKLY MARKET</span>
     <h1>Выбери.<br/>Напиши. Забери.</h1>
     <p>Товары от людей из твоего круга. Договорись о получении напрямую в чате.</p>
     <div className="market-hero-actions">
       <button className="primary" onClick={()=>setTab("catalog")}>Смотреть каталог</button>
       <button className="secondary" onClick={()=>setTab("chat")}>Мои чаты</button>
     </div>
   </div>
   <div className="market-hero-orb"><img src={logo()} alt="Nookly" onError={e=>{e.currentTarget.src="/nookly-logo.svg?v=20261103"}} /></div>
 </section>
 <label className="search market-search">⌕<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Найти товар или категорию"/></label>
 <div className="chips">{categoryNames.map(c=><button key={c} className={"chip "+(cat===c?"active":"")} onClick={()=>setCat(c)}>{c}</button>)}</div>
 <div className="section-head"><h2>{cat==="Все"&&!q?"Популярное":cat}</h2><span>{items.length} товаров</span></div>
 {items.length?<div className="grid">{items.map(p=><Card key={p.id} p={p} open={()=>setSelected(p)} add={()=>add(p)} toggleFavorite={toggleFavorite} isFavorite={favoriteIds.has(p.id)}/>)}</div>:<div className="empty-state"><b>{q?"Ничего не нашли":"Пока нет товаров"}</b><span>{q?"Измени запрос или выбери другую категорию.":"Товары появятся здесь, когда продавцы их опубликуют."}</span></div>}
 </>
 :tab==="catalog"?<><div className="hero"><h1>Каталог</h1><p>Товары от продавцов твоего круга. Без лишних посредников.</p></div><div className="grid">{items.map(p=><Card key={p.id} p={p} open={()=>setSelected(p)} add={()=>add(p)} toggleFavorite={toggleFavorite} isFavorite={favoriteIds.has(p.id)}/>)}</div></>
 :tab==="orders"?<Orders orders={orders} onLoad={loadOrders}/>
 :tab==="chat"?<Chats authHeaders={authHeaders} setMessage={setMessage}/>
 :tab==="profile"?<Profile user={user} sellerProducts={sellerProducts} setSellerProducts={setSellerProducts} loadSeller={loadSeller} setMessage={setMessage} categories={categories} notifications={notifications} readNotification={readNotification} openProduct={async(id)=>{const r=await fetch(api()+"/api/products/"+id,{cache:"no-store"});if(r.ok){const d=await r.json();const p=d.product;if(p){setSelected({...p,image:p.images?.[0]?.url||p.image_url||"",image_url:p.images?.[0]?.url||p.image_url||""});return;}}setMessage("Товар больше недоступен в каталоге.");}}/>
 :<Cart cart={cart} total={total} setCart={setCart} checkout={checkout} loading={loading}/>;

 return <div className="app"><main className="shell"><header className="top"><div className="brand"><div className="brand-mark brand-mark-nookly"><img src={logo()} alt="Nookly" onError={e=>{e.currentTarget.src="/nookly-logo.svg?v=20261103"}}/></div><div><div className="brand-name">Nookly</div><div className="tagline">Твой маркетплейс. Свои люди. Свои товары.</div></div></div><button className="icon-btn" onClick={()=>{setTab("profile")}} aria-label="Уведомления">🔔{notifications.some(n=>!n.read_at)&&<span style={{position:"absolute",margin:"-25px 0 0 25px",width:7,height:7,borderRadius:"50%",background:"var(--gold)"}}/>}</button></header>{message&&<div className="notice-banner" role="status"><span>{message}</span><button onClick={()=>setMessage("")} aria-label="Закрыть">×</button></div>}{page}{cart.length>0&&tab!=="cart"&&<button className="fab" onClick={()=>setTab("cart")}>🛒<span>{cart.length}</span></button>}<nav className="bottom-nav-v6"><div className="nav-v6-glow"/>{[["home","🏠","Главная"],["catalog","🛍️","Каталог"],["orders","🎁","Заказы"],["chat","💬","Чаты"],["profile","👤","Профиль"]].map(([id,ico,label])=><button key={id} className={"nav "+(tab===id?"active":"")} onClick={()=>{setTab(id);if(id==="orders")loadOrders();if(id==="profile"&&(user?.role==="seller"||user?.role==="admin"))loadSeller()}}><span className="nav-v6-icon">{ico}</span><span className="nav-v6-label">{label}</span></button>)}</nav></main></div>;
}


function Cart({cart,total,setCart,checkout,loading}:{cart:Product[];total:number;setCart:Dispatch<SetStateAction<Product[]>>;checkout:()=>Promise<void>;loading:boolean}){
 const groups=Object.values(cart.reduce<Record<string,{p:Product;count:number}>>((a,p)=>{const k=p.id;a[k]=a[k]||{p,count:0};a[k].count++;return a},{}));
 const change=(id:string,delta:number)=>setCart(prev=>{const next=[...prev];if(delta>0){const p=prev.find(x=>x.id===id);if(p&&next.filter(x=>x.id===id).length<Number(p.available_stock??0))next.push(p)}else{const i=next.findIndex(x=>x.id===id);if(i>=0)next.splice(i,1)}return next});
 return <div className="hero cart-page"><div className="chat-head"><div><h1>Корзина</h1><span className="small">{cart.length} товаров</span></div></div>{groups.length?groups.map(({p,count})=><div className="cart-row" key={p.id}><img src={p.image||p.image_url||logo()} alt="" /><div><b>{p.title}</b><span>{money(Number(p.price_minor??Math.round((p.price||0)*100)),p.currency)}</span><div className="cart-qty"><button disabled={loading} onClick={()=>change(p.id,-1)}>−</button><strong>{count}</strong><button disabled={loading} onClick={()=>change(p.id,1)}>＋</button></div></div><button className="secondary mini danger" disabled={loading} onClick={()=>setCart(prev=>prev.filter(x=>x.id!==p.id))}>Удалить</button></div>):<div className="chat-empty chat-empty-card">Корзина пуста.</div>}<div className="cart-total"><span>Итого</span><strong>{money(total)}</strong></div>{groups.length>0&&<button className="primary wide" disabled={loading} onClick={()=>void checkout()}>{loading?"Оформляем заказ…":"Оформить заказ"}</button>}<p className="small">Оплата проходит напрямую продавцу. Nookly не удерживает деньги и не берёт подписку.</p></div>
}

function Card({p,open,add,toggleFavorite,isFavorite}:{p:Product;open:()=>void;add:()=>void;toggleFavorite:(p:Product)=>Promise<void>;isFavorite:boolean}){
 const price=money(Number(p.price_minor??Math.round((p.price||0)*100)),p.currency);
 const stock=Number(p.available_stock??0);
 return <article className="product-card" onClick={open}>
  <div className="product-card-image">
   <img src={p.image||p.image_url||logo()} alt="" loading="lazy" onError={e=>{e.currentTarget.src=logo()}}/>
   <button className={"favorite-sticker "+(isFavorite?"active":"")} aria-label={isFavorite?"Убрать из избранного":"Добавить в избранное"} onClick={e=>{e.stopPropagation();void toggleFavorite(p)}}>{isFavorite?"♥":"♡"}</button>
   {stock>0&&stock<=3&&<span className="stock-sticker">Осталось {stock}</span>}
  </div>
  <div className="product-card-body">
   <span className="product-card-category">{p.category||"Товар"}</span>
   <h3>{p.title}</h3>
   <div className="product-card-seller"><span>●</span>{p.seller||"Продавец Nookly"}{p.rating&&<em>★ {p.rating}</em>}</div>
   <div className="product-card-footer"><strong>{price}</strong><button className="add-sticker" onClick={e=>{e.stopPropagation();add()}} disabled={stock<=0}>{stock>0?"＋":"Нет"}</button></div>
  </div>
 </article>
}

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

 async function confirmDirectPayment(){ if(!active)return; setBusy(true); setLocalMessage(''); try{ const init=typeof window!=='undefined'?window.Telegram?.WebApp?.initData||'':''; const r=await fetch(api()+'/api/orders/'+active.id+'/confirm-direct-payment',{method:'POST',headers:{Authorization:'tma '+init}}); if(!r.ok)throw new Error((await r.json()).error||'Не удалось подтвердить перевод'); setActive({...active,status:'paid',seller_orders:(active.seller_orders||[]).map((so:any)=>({...so,status:so.status==='created'?'paid':so.status}))}); onLoad(); setLocalMessage('Подтверждение сохранено. Продавцы получили уведомление.'); }catch(e){setLocalMessage(e instanceof Error?e.message:'Ошибка')}finally{setBusy(false)} }
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
   <div className={"order-status status-"+active.status}>{statusRu(active.status)}</div>
   <div className="order-total">{money(Number(active.total_minor),active.currency)}</div>
   <div className="order-progress"><span className={["created","seller_confirmed","ready_for_handover","completed"].includes(active.status)?"done":""}>Заказ</span><span className={["seller_confirmed","ready_for_handover","completed"].includes(active.status)?"done":""}>Подтверждение</span><span className={["ready_for_handover","completed"].includes(active.status)?"done":""}>Получение</span><span className={active.status==="completed"?"done":""}>Завершено</span></div>
   <div className="small">{new Date(active.created_at).toLocaleString("ru-RU")}</div>
   {active.status==="created"&&<div className="form-card"><p>Переведи деньги каждому продавцу отдельно по указанным ниже реквизитам. После перевода нажми «Я перевёл оплату». Продавец самостоятельно проверит поступление.</p><button className="primary wide" disabled={busy} onClick={confirmDirectPayment}>{busy?"Подтверждаем…":"Я перевёл оплату продавцу"}</button></div>}

   <div className="menu order-sellers">
     {(active.seller_orders||[]).map((so:any)=><div className="order-seller" key={so.id}>
       <b>{so.store_name||"Продавец"}</b>
       <span>{statusRu(so.status)} · {so.fulfillment_type==="meeting"?"Встреча":"Самовывоз"} · {money(Number(so.seller_amount_minor),active.currency)}</span>
       {active.status==="created"&&<div className="form-card"><b>Оплата продавцу напрямую</b>{so.payment_method==="link"&&so.payment_link?<a className="primary wide" href={so.payment_link} target="_blank" rel="noreferrer">Перейти к оплате</a>:<><span>{so.payment_method==="card"?"Перевод на карту":"СБП по номеру телефона"}: {so.payment_details||"Продавец ещё не добавил реквизиты"}</span>{so.payment_bank&&<span>Банк: {so.payment_bank}</span>}</>}{so.payment_recipient&&<span>Получатель: {so.payment_recipient}</span>}</div>}
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

function statusRu(s:string){return ({created:"Ожидает оплаты",paid:"Покупатель сообщил об оплате",seller_confirmed:"Продавец подтвердил",ready_for_handover:"Готов к получению",completed:"Завершён",cancelled:"Отменён",refunded:"Возврат",refund_pending:"Возврат ожидает подтверждения",disputed:"Спор",draft:"Черновик",published:"Опубликован",archived:"Архив"} as Record<string,string>)[s]||s}

function Profile({user,sellerProducts,setSellerProducts,loadSeller,setMessage,categories,notifications,readNotification,openProduct}:{user:User|null;sellerProducts:any[];setSellerProducts:Dispatch<SetStateAction<any[]>>;loadSeller:()=>void;setMessage:(s:string)=>void;categories:any[];notifications:any[];readNotification:(id:string)=>Promise<void>;openProduct:(id:string)=>Promise<void>}){
 const admin=user?.role==="admin";
 const seller=user?.role==="seller"||admin;
 const [mode,setMode]=useState<"profile"|"seller"|"favorites"|"notifications"|"admin"|"onboard">("profile");
 const [fav,setFav]=useState<any[]>([]);
 const unread=notifications.filter(n=>!n.read_at).length;
 async function favorites(){
  const r=await fetch(api()+"/api/favorites",{headers:{Authorization:"tma "+(typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"")}});
  if(r.ok){const d=await r.json();setFav(d.items||[]);}
  setMode("favorites");
 }
 if(mode==="notifications")return <div className="hero notifications-page">
  <button className="icon-btn" onClick={()=>setMode("profile")}>←</button>
  <div className="section-head"><h1>Уведомления</h1><span>{unread?unread+" новых":"Все прочитаны"}</span></div>
  {!notifications.length?<div className="empty-state"><b>Пока тихо</b><span>Здесь появятся важные события по заказам, оплатам и аккаунту.</span></div>:
   <div className="notification-list">{notifications.map((n:any)=><button className={"notification-item "+(n.read_at?"read":"unread")} key={n.id} onClick={()=>readNotification(n.id)}>
    <span className="notification-dot"/>
    <span className="notification-copy"><b>{n.title}</b><small>{n.body||""}</small>{n.created_at&&<em>{new Date(n.created_at).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</em>}</span>
    <span className="notification-arrow">›</span>
   </button>)}</div>}
 </div>;
 if(mode==="favorites")return <div className="hero">
  <button className="icon-btn" onClick={()=>setMode("profile")}>←</button>
  <div className="section-head"><h1>Избранное</h1><span>{fav.length}</span></div>
  {!fav.length?<div className="empty-state"><b>Избранное пусто</b><span>Сохраняй товары, чтобы быстро вернуться к ним позже.</span></div>:
   <div className="menu">{fav.map((x:any)=><button key={x.id} onClick={()=>openProduct(x.id)}><span>{x.title}</span><span>{money(Number(x.price_minor),x.currency)} ›</span></button>)}</div>}
 </div>;
 if(mode==="seller")return <SellerPanel products={sellerProducts} loadSeller={loadSeller} setSellerProducts={setSellerProducts} setMessage={setMessage} back={()=>setMode("profile")} categories={categories}/>;
 if(mode==="onboard")return <SellerOnboard setMessage={setMessage} onDone={()=>window.location.reload()} back={()=>setMode("profile")}/>;
 if(mode==="admin" && user?.role==="admin")return <AdminPanel setMessage={setMessage} back={()=>setMode("profile")}/>;
 return <div className="profile-page">
  <div className="profile-card">
   <div className="row"><div className="avatar">{(user?.first_name||"Ч").slice(0,1)}</div><div style={{minWidth:0}}><b>{user?.first_name||"Покупатель"}</b><div className="small">{admin?"Администратор · продавец":seller?"Продавец":"Покупатель"}{user?.username?" · @"+user.username:""}</div></div></div>
   {unread>0&&<button className="profile-alert" onClick={()=>setMode("notifications")}><span>🔔</span><span><b>{unread} новых уведомления</b><small>Проверь события по заказам и оплатам</small></span><strong>›</strong></button>}
   <div className="menu">
    <button onClick={favorites}><span>Избранное</span><span>♡ ›</span></button>
    {seller&&<button onClick={()=>{loadSeller();setMode("seller")}}><span>Кабинет продавца</span><span>›</span></button>}
    {!seller&&!admin&&<button onClick={()=>setMode("onboard")}><span>Стать продавцом</span><span>›</span></button>}
    {admin&&<button onClick={()=>setMode("onboard")}><span>Тест регистрации и оплаты продавца</span><span>›</span></button>}
    <button onClick={()=>setMode("notifications")}><span>Уведомления</span><span>{unread?unread+" новых":"›"}</span></button>
    {admin&&<button onClick={()=>setMode("admin")}><span>Админ-панель</span><span>›</span></button>}
    <button onClick={()=>setMessage("Оплата товара проходит напрямую между покупателем и продавцом по реквизитам продавца. Nookly не принимает и не хранит деньги за товары. Перед подтверждением продавец обязан проверить фактическое поступление денег. Подписок и комиссии Nookly нет.")}><span>Оплата и безопасность</span><span>›</span></button>
    <button onClick={()=>setMessage("Получение: продавец и покупатель договариваются о месте и времени в чате.")}><span>Как получить заказ</span><span>›</span></button>
    <div className="small" style={{padding:"14px 4px 4px",fontWeight:800,letterSpacing:".08em"}}>ИНФОРМАЦИЯ И ПОМОЩЬ</div>
    <button onClick={()=>{const u=(process.env.GITHUB_PAGES==="true"?"/Chipok":"")+"/legal/terms.html";if(window.Telegram?.WebApp?.openLink)window.Telegram.WebApp.openLink(new URL(u,window.location.origin).toString());else window.open(u,"_blank","noopener,noreferrer")}}><span>Пользовательское соглашение</span><span>↗</span></button>
    <button onClick={()=>{const u=(process.env.GITHUB_PAGES==="true"?"/Chipok":"")+"/legal/privacy.html";if(window.Telegram?.WebApp?.openLink)window.Telegram.WebApp.openLink(new URL(u,window.location.origin).toString());else window.open(u,"_blank","noopener,noreferrer")}}><span>Политика конфиденциальности</span><span>↗</span></button>
    <button onClick={()=>{const u="https://t.me/nikita_seton";if(window.Telegram?.WebApp?.openTelegramLink)window.Telegram.WebApp.openTelegramLink(u);else window.open(u,"_blank","noopener,noreferrer")}}><span>Техническая поддержка</span><span>↗</span></button>
   </div>
  </div>
 </div>;
}
function SellerOnboard({setMessage,onDone,back}:{setMessage:(s:string)=>void;onDone:()=>void;back:()=>void}){
 const [storeName,setStoreName]=useState(""),[description,setDescription]=useState(""),[plan,setPlan]=useState<"start"|"standard"|"plus">("start"),[promo,setPromo]=useState("START99"),[request,setRequest]=useState<any>(null),[paymentDetails,setPaymentDetails]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const plans=[
  {id:"start",name:"Старт",price:199,desc:"До 50 активных товаров · всё необходимое для старта"},
  {id:"standard",name:"Стандарт",price:399,desc:"До 100 активных товаров · больше возможностей для магазина"},
  {id:"plus",name:"Плюс",price:699,desc:"Без лимита на товары · максимум возможностей для активного продавца"},
 ] as const;
 async function submit(){
  if(storeName.trim().length<2)return;
  setBusy(true);
  try{
   const init=typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";
   const r=await fetch(api()+"/api/seller/onboard",{method:"POST",headers:{"content-type":"application/json",Authorization:"tma "+init},body:JSON.stringify({storeName:storeName.trim(),description:description.trim()||undefined,plan,promoCode:promo.trim()||undefined})});
   if(!r.ok)throw new Error((await r.json()).error||"Не удалось оформить подписку");
   const data=await r.json();setRequest(data.subscription);setPaymentDetails(data.paymentDetails||null);setMessage("Заявка создана. После подтверждения оплаты кабинет продавца будет активирован.");
  }catch(e){setMessage(e instanceof Error?e.message:"Ошибка")}
  finally{setBusy(false)}
 }
 return <div className="hero">
  <button className="icon-btn" onClick={back}>←</button>
  <h1>Стать продавцом</h1>
  <p>Выбирай тариф на 30 дней. Комиссия Nookly с продаж — <b>0%</b>: деньги за товар получает продавец напрямую.</p>
  {request?<div className="form-card">
   <h2>Заявка отправлена</h2>
   <p><b>{plans.find(x=>x.id===request.plan)?.name||request.plan}</b> · {money(Number(request.amount_minor),"RUB")}</p>
   {request.promo_code&&<p className="small">Промокод <b>{request.promo_code}</b> применён.</p>}
   <p className="small">Статус: ожидает подтверждения оплаты. После подтверждения тариф действует 30 дней.</p>
   {paymentDetails?<p style={{whiteSpace:"pre-wrap"}}>{paymentDetails}</p>:<p className="small">Реквизиты для оплаты уточни в поддержке.</p>}
   <button className="secondary wide" onClick={back}>Назад</button>
  </div>:<div className="form-card">
   <input value={storeName} onChange={e=>setStoreName(e.target.value)} placeholder="Название магазина или имя" maxLength={100}/>
   <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Коротко о товарах (необязательно)" rows={4} maxLength={1000}/>
   <div className="small" style={{fontWeight:800}}>ТАРИФ НА 30 ДНЕЙ</div>
   <div className="menu">
    {plans.map(p=><button key={p.id} type="button" onClick={()=>setPlan(p.id)}><span><b>{p.name} · {p.price} ₽</b><br/><small>{p.desc}</small></span><b>{plan===p.id?"✓":"Выбрать"}</b></button>)}
   </div>
   <input value={promo} onChange={e=>setPromo(e.target.value.toUpperCase())} placeholder="Промокод (необязательно)"/>
   <p className="small"><b>START99</b> — первый месяц за 99 ₽ для первых 5 продавцов.</p>
   <button className="primary wide" disabled={busy||storeName.trim().length<2} onClick={submit}>{busy?"Оформляем…":"Оформить подписку"}</button>
  </div>}
 </div>
}
function AdminPanel({setMessage,back}:{setMessage:(s:string)=>void;back:()=>void}){
 const [dash,setDash]=useState<any>(null),[orders,setOrders]=useState<any[]>([]),[disputes,setDisputes]=useState<any[]>([]),[refunds,setRefunds]=useState<any[]>([]),[moderation,setModeration]=useState<any[]>([]),[subscriptions,setSubscriptions]=useState<any[]>([]);
 const init=()=>typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"",h=()=>({Authorization:"tma "+init()});
 async function load(){const headers=h();const [d,os,ds,rf,m,ss]=await Promise.all([fetch(api()+"/api/admin/dashboard",{headers}),fetch(api()+"/api/admin/orders?limit=30",{headers}),fetch(api()+"/api/admin/disputes",{headers}),fetch(api()+"/api/admin/refunds",{headers}),fetch(api()+"/api/admin/moderation",{headers}),fetch(api()+"/api/admin/subscriptions",{headers})]);if(d.ok)setDash(await d.json());if(os.ok)setOrders((await os.json()).items||[]);if(ds.ok)setDisputes((await ds.json()).items||[]);if(rf.ok)setRefunds((await rf.json()).items||[]);if(m.ok)setModeration((await m.json()).items||[]);if(ss.ok)setSubscriptions((await ss.json()).items||[])}
 useEffect(()=>{load()},[]);

 async function resolveDispute(id:string,resolution:"refund"|"reject"){const r=await fetch(api()+"/api/admin/disputes/"+id+"/resolve",{method:"POST",headers:{"content-type":"application/json",...h()},body:JSON.stringify({resolution})});if(!r.ok){setMessage((await r.json()).error||"Не удалось закрыть спор");return}await load();setMessage("Спор обработан.");} async function resolveRefund(id:string,status:"completed"|"failed"){const r=await fetch(api()+"/api/admin/refunds/"+id+"/resolve",{method:"POST",headers:{"content-type":"application/json",...h()},body:JSON.stringify({status})});if(!r.ok){setMessage((await r.json()).error||"Не удалось обработать возврат");return}await load();setMessage(status==="completed"?"Прямой возврат покупателю подтверждён вручную.":"Прямой возврат не подтверждён — заказ остаётся в споре.");}

 async function activateSubscription(id:string){const r=await fetch(api()+"/api/admin/subscriptions/"+id+"/activate",{method:"POST",headers:h()});if(!r.ok){setMessage((await r.json()).error||"Не удалось активировать подписку");return}await load();setMessage("Подписка активирована на 30 дней.");}
 async function moderate(id:string,action:"approve"|"reject"){const r=await fetch(api()+"/api/admin/products/"+id+"/moderate",{method:"POST",headers:{"content-type":"application/json",...h()},body:JSON.stringify({action})});if(!r.ok){setMessage((await r.json()).error||"Не удалось изменить модерацию");return}await load();setMessage(action==="approve"?"Товар опубликован.":"Товар отклонён.");}
 return <div>

<button className="icon-btn" onClick={back}>←</button><div className="seller-hero"><div><div className="eyebrow">АДМИНИСТРАТОР</div><h1>Панель Nookly</h1><p>Контроль пользователей, заказов, споров и модерации.</p></div></div><div className="seller-stats"><div><b>{dash?.users||0}</b><span>Пользователей</span></div><div><b>{dash?.sellers||0}</b><span>Продавцов</span></div><div><b>{dash?.orders||0}</b><span>Заказов</span></div><div><b>{dash?.openDisputes||0}</b><span>Споров</span></div></div><div className="section-head"><h2>Последние заказы</h2><span>{orders.length}</span></div><div className="seller-products">{!orders.length?<div className="empty">Заказов пока нет.</div>:orders.map(x=><div className="seller-product" key={x.id}><div><b>Заказ #{String(x.id).slice(0,8)} · {money(Number(x.total_minor),x.currency)}</b><span>{statusRu(x.status)} · {x.seller_orders} продавец(ов) · {new Date(x.created_at).toLocaleString("ru-RU")}</span></div></div>)}</div><div className="section-head"><h2>Подписки продавцов</h2><span>{subscriptions.length} ожидают</span></div><div className="seller-products">{!subscriptions.length?<div className="empty">Новых заявок нет.</div>:subscriptions.map(x=><div className="seller-product" key={x.id}><div><b>{x.display_name||x.username||"Продавец"}</b><span>{x.plan==="start"?"Старт":x.plan==="standard"?"Стандарт":"Плюс"} · {money(Number(x.amount_minor),"RUB")}{x.promo_code?" · "+x.promo_code:""}</span></div><button className="primary mini" onClick={()=>activateSubscription(x.id)}>Активировать</button></div>)}</div><div className="section-head"><h2>Модерация</h2><span>{moderation.length}</span></div><div className="seller-products">{!moderation.length?<div className="empty">Нет товаров на проверке.</div>:moderation.map(x=><div className="seller-product" key={x.id}><div><b>{x.title}</b><span>{x.seller_name} · {money(Number(x.price_minor),x.currency)}</span></div><div className="row"><button className="primary mini" onClick={()=>moderate(x.product_id,"approve")}>Одобрить</button><button className="secondary mini" onClick={()=>moderate(x.product_id,"reject")}>Отклонить</button></div></div>)}</div><div className="section-head"><h2>Споры</h2><span>{disputes.filter(x=>x.status==="open").length} открытых</span></div><div className="seller-products">{!disputes.length?<div className="empty">Споров нет.</div>:disputes.map(x=><div className="seller-product" key={x.id}><div><b>{x.buyer_name||"Покупатель"} · {x.reason}</b><span>{x.description}</span></div>{x.status==="open"?<div className="row"><button className="primary mini" onClick={()=>resolveDispute(x.id,"refund")}>Возврат</button><button className="secondary mini" onClick={()=>resolveDispute(x.id,"reject")}>Отклонить</button></div>:<strong>{x.status}</strong>}</div>)}</div><div className="section-head"><h2>Возвраты</h2><span>{refunds.filter(x=>x.status==="pending").length} ожидают</span></div><p className="small">Nookly не принимает и не возвращает деньги. Продавец переводит возврат покупателю напрямую; здесь администратор фиксирует результат после проверки.</p><div className="seller-products">{!refunds.length?<div className="empty">Возвратов нет.</div>:refunds.map(x=><div className="seller-product refund-row" key={x.id}><div><b>{x.buyer_name||"Покупатель"} · {money(Number(x.amount_minor),x.currency)}</b><span>{x.status} · {x.reason||"Возврат по спору"} · {new Date(x.created_at).toLocaleString("ru-RU")}</span></div>{x.status==="pending"?<div className="row"><button className="primary mini" onClick={()=>resolveRefund(x.id,"completed")}>Продавец вернул деньги — подтвердить</button><button className="secondary mini" onClick={()=>resolveRefund(x.id,"failed")}>Не подтверждён</button></div>:<strong>{x.status}</strong>}</div>)}</div></div>
}

function SellerPanel({products,loadSeller,setSellerProducts,setMessage,back,categories}:{products:any[];loadSeller:()=>void;setSellerProducts:React.Dispatch<React.SetStateAction<any[]>>;setMessage:(s:string)=>void;back:()=>void;categories:any[]}){
 const [form,setForm]=useState(false),[editingId,setEditingId]=useState<string|null>(null),[title,setTitle]=useState(""),[price,setPrice]=useState(""),[stock,setStock]=useState("1"),[description,setDescription]=useState(""),[imageUrl,setImageUrl]=useState(""),[imageMode,setImageMode]=useState<"upload"|"search">("upload"),[imageQuery,setImageQuery]=useState(""),[imageResults,setImageResults]=useState<any[]>([]),[imageSearching,setImageSearching]=useState(false),[categoryId,setCategoryId]=useState(""),[fulfillment,setFulfillment]=useState<"pickup"|"meeting">("pickup"),[saving,setSaving]=useState(false);
 const [paymentMethod,setPaymentMethod]=useState<"sbp"|"card"|"link">("sbp");
 const [paymentDetails,setPaymentDetails]=useState("");
 const [paymentRecipient,setPaymentRecipient]=useState("");
 const [paymentBank,setPaymentBank]=useState("");
 const [paymentLink,setPaymentLink]=useState("");
 const [paymentSaving,setPaymentSaving]=useState(false);
 const [sellerOrders,setSellerOrders]=useState<any[]>([]);

 const [reliability,setReliability]=useState<any>(null);
 const [deleteTarget,setDeleteTarget]=useState<any|null>(null),[handoverTarget,setHandoverTarget]=useState<any|null>(null),[handoverCode,setHandoverCode]=useState(""),[actionBusy,setActionBusy]=useState(false),[actionError,setActionError]=useState("");
 const init=()=>typeof window!=="undefined"?window.Telegram?.WebApp?.initData||"":"";
 async function loadFinance(){const h={Authorization:"tma "+init()};const [o,r,p]=await Promise.all([fetch(api()+"/api/seller/orders",{headers:h}),fetch(api()+"/api/seller/reliability",{headers:h}),fetch(api()+"/api/seller/payment-settings",{headers:h})]);if(o.ok)setSellerOrders((await o.json()).items||[]);if(r.ok)setReliability(await r.json());if(p.ok){const s=(await p.json()).settings||{};setPaymentMethod(s.payment_method||"sbp");setPaymentDetails(s.payment_details||"");setPaymentRecipient(s.payment_recipient||"");setPaymentBank(s.payment_bank||"");setPaymentLink(s.payment_link||"");}}
 useEffect(()=>{loadFinance()},[]);
 async function savePaymentSettings(){setPaymentSaving(true);try{const r=await fetch(api()+"/api/seller/payment-settings",{method:"PUT",headers:{"content-type":"application/json",Authorization:"tma "+init()},body:JSON.stringify({paymentMethod,paymentDetails:paymentDetails.trim()||null,paymentRecipient:paymentRecipient.trim()||null,paymentBank:paymentBank.trim()||null,paymentLink:paymentLink.trim()||null})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Не удалось сохранить реквизиты");setMessage("Способ оплаты сохранён. Покупатели увидят его в заказе.");}catch(e){setMessage(e instanceof Error?e.message:"Ошибка сохранения")}finally{setPaymentSaving(false)}}
 async function confirmOrder(id:string){const r=await fetch(api()+"/api/seller-orders/"+id+"/confirm",{method:"POST",headers:{Authorization:"tma "+init()}});if(!r.ok){setMessage((await r.json()).error||"Не удалось подтвердить заказ");return}await loadFinance();setMessage("Заказ подтверждён. Теперь отметьте его готовым к получению.");}
 async function rejectOrder(id:string){const r=await fetch(api()+"/api/seller-orders/"+id+"/reject",{method:"POST",headers:{Authorization:"tma "+init()}});if(!r.ok){setMessage((await r.json()).error||"Не удалось отменить заказ");return}await loadFinance();setMessage("Заказ отменён. Надёжность продавца пересчитана.");}
 async function readyOrder(id:string){const r=await fetch(api()+"/api/seller-orders/"+id+"/ready",{method:"POST",headers:{Authorization:"tma "+init()}});if(!r.ok){setMessage((await r.json()).error||"Не удалось отметить готовность");return}await loadFinance();setMessage("Заказ готов. Покупателю показан код получения.");}
 async function completeOrder(id:string){
 setHandoverTarget(sellerOrders.find(o=>o.id===id)||{id});
 setHandoverCode("");
 setActionError("");
 setActionBusy(false);
}
async function submitHandover(){
 if(!handoverTarget||actionBusy)return;
 const code=handoverCode.trim();
 if(!/^\d{6}$/.test(code)){setActionError("Введите ровно 6 цифр.");return}
 setActionBusy(true);
 setActionError("");
 try{
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),15000);
  let r:Response;
  try{
   r=await fetch(actionApi("/api/seller-orders/"+handoverTarget.id+"/complete"),{method:"POST",headers:{"content-type":"application/json",Authorization:"tma "+init()},body:JSON.stringify({code}),signal:controller.signal});
  }finally{window.clearTimeout(timer)}
  let body:any=null;try{body=await r.json()}catch{}
  if(!r.ok){const msg=body?.error||("Не удалось подтвердить выдачу ("+r.status+")");setActionError(msg);setMessage(msg);return}
  const completedId=handoverTarget.id;
  setSellerOrders(prev=>prev.map((x:any)=>x.id===completedId?{...x,status:"completed"}:x));
  setHandoverTarget(null);
  setHandoverCode("");
  setActionError("");
  await loadFinance();
  setMessage("Получение подтверждено. Заказ завершён — расчёт с покупателем уже произведён напрямую.");
 }catch(e){
  const msg=e instanceof DOMException&&e.name==="AbortError"?"Сервер не ответил за 15 секунд. Попробуйте ещё раз.":e instanceof Error?e.message:"Не удалось подтвердить выдачу";
  setActionError(msg);
  setMessage(msg);
 }finally{setActionBusy(false)}
}
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
 setDeleteTarget(p);
}
async function submitDelete(){
 if(!deleteTarget||actionBusy)return;
 const target=deleteTarget;
 setActionBusy(true);
 setMessage("Удаляем товар…");
 try{
  const r=await fetch(actionApi("/api/seller/products/"+target.id),{method:"DELETE",headers:{Authorization:"tma "+init()}});
  let body:any=null;try{body=await r.json()}catch{}
  if(!r.ok){setMessage(body?.error||("Не удалось удалить товар ("+r.status+")"));return}
  setSellerProducts((prev:any[])=>prev.filter((x:any)=>x.id!==target.id));
  setDeleteTarget(null);
  await loadSeller();
  setMessage(body?.mode==="archived"?"Товар скрыт из каталога.":"Товар удалён.");
 }catch(e){
  setMessage(e instanceof Error?e.message:"Не удалось удалить товар");
 }finally{setActionBusy(false)}
}
 const activeOrders=sellerOrders.filter(o=>["paid","seller_confirmed","ready_for_handover"].includes(o.status));
 const lowStock=products.filter(p=>Number(p.stock??p.available_stock??0)>0&&Number(p.stock??p.available_stock??0)<=2);
 const outOfStock=products.filter(p=>Number(p.stock??p.available_stock??0)<=0);
 const completedSales=sellerOrders.filter(o=>o.status==="completed").length;
 const needsAction=sellerOrders.filter(o=>o.status==="paid"||o.status==="seller_confirmed"||o.status==="ready_for_handover").length;
 return <div className="seller-page"><button className="icon-btn seller-back" onClick={back}>←</button><div className="seller-hero"><div><div className="eyebrow">КАБИНЕТ ПРОДАВЦА</div><h1>Мои продажи</h1><p>Комиссия Nookly с продаж — 0%. Покупатели платят вам напрямую.</p></div><div className="balance">0% комиссия</div></div><div className="seller-stats"><div><b>{products.length}</b><span>Товаров</span></div><div><b>0%</b><span>Комиссия</span></div><div><b>{needsAction}</b><span>Нужно сделать</span></div><div><b>{completedSales}</b><span>Завершено</span></div></div>
<div className="seller-quick"><button className="primary" disabled={reliability?.level==="blocked"} onClick={()=>{setEditingId(null);setForm(true);window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"})}}>＋ Новый товар</button><button className="secondary" onClick={()=>document.getElementById("seller-orders")?.scrollIntoView({behavior:"smooth"})}>📦 Заказы {needsAction>0&&<b>{needsAction}</b>}</button><button className="secondary" onClick={()=>document.getElementById("seller-products")?.scrollIntoView({behavior:"smooth"})}>🛍 Товары</button></div>
{(lowStock.length||outOfStock.length)&&<div className="seller-alerts">{outOfStock.length>0&&<div className="seller-alert danger"><b>⚠️ Закончились</b><span>{outOfStock.length} {outOfStock.length===1?"товар":"товара"} скрыто из каталога</span></div>}{lowStock.length>0&&<div className="seller-alert"><b>🔥 Заканчиваются</b><span>{lowStock.length} {lowStock.length===1?"товар":"товара"} — осталось 2 шт. или меньше</span></div>}</div>}
<div className="form-card finance-card"><div><b>Надёжность продавца</b><span className="small">Оценка: {reliability?.score ?? "—"} / 100 · {reliability?.level==="stable"?"Стабильный":reliability?.level==="warning"?"Предупреждение":reliability?.level==="restricted"?"Ограничен":reliability?.level==="blocked"?"Заблокирован":"—"}</span>{reliability?.level==="restricted"&&<span className="small">Новые заказы временно недоступны. Улучшайте качество исполнения заказов.</span>}{reliability?.level==="blocked"&&<span className="small">Продажи и публикация товаров заблокированы.</span>}</div></div>
<div className="form-card finance-card"><div><b>Как покупатели будут платить вам</b><span className="small">Деньги переводятся напрямую на ваш счёт. Nookly не принимает и не хранит оплату за товары.</span><select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as "sbp"|"card"|"link")}><option value="sbp">СБП по номеру телефона</option><option value="card">Перевод на карту</option><option value="link">Ссылка на оплату</option></select>{paymentMethod==="link"?<input value={paymentLink} onChange={e=>setPaymentLink(e.target.value)} placeholder="https://ссылка-на-оплату"/>:<><input value={paymentDetails} onChange={e=>setPaymentDetails(e.target.value)} placeholder={paymentMethod==="sbp"?"Номер телефона для СБП":"+7… или номер карты"}/><input value={paymentBank} onChange={e=>setPaymentBank(e.target.value)} placeholder="Банк (например, Т-Банк)"/></>}<input value={paymentRecipient} onChange={e=>setPaymentRecipient(e.target.value)} placeholder="Получатель (имя)"/><button className="primary wide" disabled={paymentSaving} onClick={savePaymentSettings}>{paymentSaving?"Сохраняем…":"Сохранить способ оплаты"}</button><span className="small">Указывайте только реквизиты, на которые согласны принимать переводы. Не публикуйте CVV, PIN-код или пароли.</span></div></div>{deleteTarget&&<div className="modal-backdrop" style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(0,0,0,.7)"}}><div className="modal-card" style={{width:"100%",maxWidth:420,borderRadius:20,padding:20,background:"var(--panel,#13232b)",boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}><h2>Удалить товар?</h2><p>«{deleteTarget.title}» исчезнет из каталога. История заказов сохранится.</p>{actionError&&<div style={{marginTop:8,color:"var(--danger,#ff6b6b)",textAlign:"center",fontSize:14}}>{actionError}</div>}<div className="row"><button className="secondary wide" disabled={actionBusy} onClick={()=>setDeleteTarget(null)}>Отмена</button><button className="primary wide danger" disabled={actionBusy} onClick={submitDelete}>{actionBusy?"Удаляем…":"Удалить"}</button></div></div></div>}
{handoverTarget&&<div className="modal-backdrop" style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(0,0,0,.7)"}}><div className="modal-card" style={{width:"100%",maxWidth:420,borderRadius:20,padding:20,background:"var(--panel,#13232b)",boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}><h2>Подтверждение выдачи</h2><p>Попросите покупателя показать 6-значный код получения.</p><input autoFocus value={handoverCode} onChange={e=>setHandoverCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" maxLength={6} placeholder="000000" style={{fontSize:24,textAlign:"center",letterSpacing:6}}/>{actionError&&<div style={{marginTop:8,color:"var(--danger,#ff6b6b)",textAlign:"center",fontSize:14}}>{actionError}</div>}<div className="row"><button className="secondary wide" disabled={actionBusy} onClick={()=>{setHandoverTarget(null);setHandoverCode("")}}>Отмена</button><button className="primary wide" disabled={actionBusy||handoverCode.length!==6} onClick={submitHandover}>{actionBusy?"Проверяем…":"Подтвердить код"}</button></div></div></div>}
<div id="seller-products" className="section-head"><h2>Мои товары</h2><button className="primary mini" disabled={reliability?.level==="blocked"} onClick={()=>{if(form)resetForm();else{setEditingId(null);setForm(true)}}}>＋ Добавить</button></div>{form&&<div className="form-card"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Название товара"/><input value={price} onChange={e=>setPrice(e.target.value)} placeholder="Цена, ₽" inputMode="decimal"/><input value={stock} onChange={e=>setStock(e.target.value)} placeholder="Остаток" inputMode="numeric"/><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Описание товара" rows={3}/><div className="image-picker"><div className="image-tabs"><button type="button" className={imageMode==="upload"?"active":""} onClick={()=>setImageMode("upload")}>📷 Фото</button><button type="button" className={imageMode==="search"?"active":""} onClick={()=>setImageMode("search")}>🌐 Найти в интернете</button></div>{imageMode==="upload"?<label className="upload-box"><input type="file" accept="image/*" onChange={e=>handleImageFile(e.target.files?.[0]||null)}/><span>Выбрать фото с устройства</span><small>JPG, PNG или WEBP · до 6 МБ</small></label>:<><div className="row"><input value={imageQuery} onChange={e=>setImageQuery(e.target.value)} placeholder={title||"Например: рюкзак туристический"}/><button type="button" className="primary mini" disabled={imageSearching} onClick={searchImages}>{imageSearching?"Ищем…":"Найти"}</button></div>{imageResults.length>0&&<div className="image-results">{imageResults.map((x:any)=><button type="button" key={x.id} className={"image-result "+(imageUrl===x.image?"selected":"")} onClick={()=>pickImage(x.image)}><img src={x.thumbnail||x.image} alt={x.title||"Изображение"}/><span>{x.title||"Изображение"}{x.creator&&<small>{x.creator}{x.license?" · "+x.license:""}</small>}</span></button>)}</div>}<small className="small">Поиск использует Openverse — выбирай изображения с подходящей лицензией.</small></>}{imageUrl&&<div className="image-preview"><img src={imageUrl} alt="Предпросмотр"/><button type="button" className="secondary mini" onClick={()=>setImageUrl("")}>Удалить</button></div>}</div><select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Категория</option>{categories.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={fulfillment} onChange={e=>setFulfillment(e.target.value as "pickup"|"meeting")}><option value="pickup">Самовывоз</option><option value="meeting">Встреча</option></select><div className="row"><button className="primary wide" disabled={saving} onClick={create}>{saving?(editingId?"Сохраняем…":"Публикуем…"):(editingId?"Сохранить изменения":"Опубликовать товар")}</button>{editingId&&<button type="button" className="secondary mini" onClick={resetForm}>Отмена</button>}</div></div>}<div className="seller-products">{products.length?products.map(p=><div className="seller-product" key={p.id}><div className="seller-product-main">{p.image_url&&<img className="seller-product-thumb" src={p.image_url} alt="" />}<div><b>{p.title}</b><span>{statusRu(p.status||"draft")} · остаток {p.stock??p.available_stock??0}{p.reserved?` · зарезервировано ${p.reserved}`:""}</span></div></div><div className="seller-product-actions"><strong>{money(p.price_minor,p.currency)}</strong><button className="secondary mini" onClick={()=>editProduct(p)}>Изменить</button><button className="secondary mini danger" onClick={()=>deleteProduct(p)}>Удалить</button></div></div>):<div className="empty">Добавь первый товар — после публикации он сразу появится в каталоге.</div>}</div>
<div id="seller-orders" className="section-head"><h2>Заказы продавца</h2><span>{sellerOrders.length}</span></div>
<div className="seller-products">{sellerOrders.slice(0,8).map(o=><div className="seller-product" key={o.id}><div><b>#{o.order_id.slice(0,8)}</b><span className={"seller-order-status "+(o.status==="ready_for_handover"?"ready":o.status==="paid"?"paid":"")}>{statusRu(o.status)} · {o.fulfillment_type==="meeting"?"Встреча":"Самовывоз"}</span></div>{o.status==="paid"?<div className="seller-orders-actions"><button className="primary mini" onClick={()=>confirmOrder(o.id)}>Подтвердить поступление оплаты</button><button className="secondary mini danger" onClick={()=>rejectOrder(o.id)}>Нет товара</button></div>:o.status==="seller_confirmed"?<div className="seller-orders-actions"><button className="primary mini" onClick={()=>readyOrder(o.id)}>Готов к выдаче</button></div>:o.status==="ready_for_handover"?<div className="seller-orders-actions"><button className="primary mini" onClick={()=>completeOrder(o.id)}>Выдать по коду</button></div>:<strong>{money(o.seller_amount_minor,o.currency||"RUB")}</strong>}</div>)}</div></div>
}


function Chats({authHeaders,setMessage}:{authHeaders:()=>Record<string,string>;setMessage:(s:string)=>void}){
 const [threads,setThreads]=useState<any[]>([]),[active,setActive]=useState<any|null>(null),[messages,setMessages]=useState<any[]>([]),[text,setText]=useState(""),[busy,setBusy]=useState(false),[currentUserId,setCurrentUserId]=useState<string>(""),[role,setRole]=useState<string>(""),[offers,setOffers]=useState<any[]>([]),[offerBusy,setOfferBusy]=useState(false);
 async function load(){const [r,me,o]=await Promise.all([fetch(api()+"/api/chat/threads",{headers:authHeaders(),cache:"no-store"}),fetch(api()+"/api/me",{headers:authHeaders(),cache:"no-store"}),fetch(api()+"/api/chat/offers",{headers:authHeaders(),cache:"no-store"})]);if(r.ok)setThreads((await r.json()).items||[]);if(me.ok){const d=await me.json();setCurrentUserId(String(d.user?.id||""));setRole(String(d.user?.role||""));}if(o.ok)setOffers((await o.json()).items||[]);}
 async function open(t:any){setActive(t);const [r,o]=await Promise.all([fetch(api()+"/api/chat/threads/"+t.id+"/messages",{headers:authHeaders(),cache:"no-store"}),fetch(api()+"/api/chat/offers",{headers:authHeaders(),cache:"no-store"})]);if(r.ok)setMessages((await r.json()).messages||[]);if(o.ok)setOffers((await o.json()).items||[])}
 async function send(){
   const body=text.trim();if(!active||!body||busy)return;
   setBusy(true);
   try{
     const r=await fetch(api()+"/api/chat/threads/"+active.id+"/messages",{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({body})});
     if(!r.ok)throw new Error("Не удалось отправить сообщение");
     setText("");await open(active);await load();
   }catch(e){setMessage(e instanceof Error?e.message:"Ошибка отправки")}
   finally{setBusy(false)}
 }
 async function acceptOffer(offer:any){
   if(offerBusy)return;
   setOfferBusy(true);setMessage("Оформляем заказ по предложению…");
   try{
     const r=await fetch(api()+"/api/chat/offers/"+offer.id+"/accept",{method:"POST",headers:authHeaders()});
     const body=await r.json().catch(()=>null);
     if(!r.ok)throw new Error(body?.error||"Не удалось принять предложение");
     setMessage("Предложение принято. Заказ создан — перейдите в «Заказы» для оплаты.");
     await load();if(active)await open(active);
   }catch(e){setMessage(e instanceof Error?e.message:"Не удалось принять предложение")}
   finally{setOfferBusy(false)}
 }
 const activeOffers=active?offers.filter((o:any)=>o.thread_id===active.id):[];
 return <div className="hero chat-page">
   <div className="chat-head"><div><h1>Чаты</h1><span className="small">{threads.length?threads.length+" диалогов":"Личные сообщения с продавцами"}</span></div>{!active&&<button className="secondary mini" onClick={load}>Обновить</button>}</div>
   {active?<><button className="secondary mini chat-back" onClick={()=>{setActive(null);setMessages([]);load()}}>← Все чаты</button>
     <div className="chat-thread-head"><b>{active.product_title||active.store_name||"Диалог"}</b><span>{active.seller_name||active.seller||"Продавец Nookly"}</span></div>
     <div className="chat-messages">{messages.length?messages.map((m:any)=><div key={m.id} className={"chat-message "+(m.is_mine||m.from_me||String(m.sender_id)===currentUserId?"mine":"theirs")}><div>{m.body}</div>{m.created_at&&<small>{new Date(m.created_at).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</small>}</div>):<div className="chat-empty">Начните диалог — договоритесь о месте и времени получения.</div>}</div>
     {activeOffers.length>0&&<div className="chat-offers"><b>Предложения</b>{activeOffers.map((o:any)=>{const expired=o.status==="pending"&&o.expires_at&&new Date(o.expires_at).getTime()<=Date.now();const state=expired?"expired":o.status;return <div className="chat-offer" key={o.id}><div><strong>{o.title}</strong><span>{(Number(o.price_minor)/100).toLocaleString("ru-RU",{minimumFractionDigits:2})} {o.currency} · {o.quantity} шт.</span><small>{state==="pending"?"Ожидает решения":state==="accepted"?"Принято":state==="rejected"?"Отклонено":"Истекло"}</small></div>{role!=="seller"&&state==="pending"&&<button className="primary mini" disabled={offerBusy} onClick={()=>acceptOffer(o)}>{offerBusy?"…":"Принять"}</button>}</div>})}</div>}
     <div className="chat-compose"><input className="chat-input" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Написать сообщение..." maxLength={2000}/><button className="primary chat-send" disabled={busy||!text.trim()} onClick={send}>{busy?"…":"➤"}</button></div>
   </>:threads.length?<div className="chat-list">{threads.map(t=><button className="chat-thread" key={t.id} onClick={()=>open(t)}><div className="chat-thread-icon">♙</div><div className="chat-thread-main"><b>{t.product_title||t.store_name||"Диалог"}</b><span>{t.last_message||"Открыть диалог"}</span></div><div className="chat-thread-meta"><small>{t.updated_at?new Date(t.updated_at).toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit"}):""}</small><strong>›</strong></div></button>)}</div>:<div className="chat-empty chat-empty-card">Открой товар и нажми «Написать продавцу», чтобы начать диалог.</div>}
 </div>
}
