"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id:string; title:string; price_minor?:number; price?:number; currency?:string;
  seller?:string; rating?:number; reviews?:number; category?:string; image?:string;
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
 {id:"30000000-0000-4000-8000-000000000001",title:"Тактический рюкзак 35 л",price:4990,seller:"TacticalStore",rating:4.8,reviews:124,category:"Одежда",image:"https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85"},
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
 const [products,setProducts]=useState<Product[]>(fallback),[orders,setOrders]=useState<Order[]>([]),[user,setUser]=useState<User|null>(null);
 const [sellerProducts,setSellerProducts]=useState<any[]>([]),[loading,setLoading]=useState(false),[message,setMessage]=useState("");
 const tg=typeof window!=="undefined"?window.Telegram?.WebApp:null;
 const authHeaders=()=>{const initData=typeof window!=="undefined"?window.Telegram?.WebApp?.initData:"";return initData?{Authorization:"tma "+initData}:{}};

 useEffect(()=>{tg?.ready();tg?.expand();load();},[]);
 async function load(){
   try{
     const r=await fetch(api()+"/api/catalog"); if(r.ok){const d=await r.json(); if(d.items?.length)setProducts(d.items.map((p:any)=>({...p,price:p.price_minor/100,image:p.image_url})))}
     const me=await fetch(api()+"/api/me",{headers:authHeaders()}); if(me.ok){const d=await me.json();setUser(d.user)}
   }catch{}
 }
 async function loadOrders(){const r=await fetch(api()+"/api/orders",{headers:authHeaders()});if(r.ok)setOrders((await r.json()).items||[])}
 async function loadSeller(){const r=await fetch(api()+"/api/seller/products",{headers:authHeaders()});if(r.ok)setSellerProducts((await r.json()).items||[])}
 const items=useMemo(()=>products.filter(p=>(cat==="Все"||p.category===cat)&&(!q||p.title.toLowerCase().includes(q.toLowerCase()))),[products,cat,q]);
 const total=cart.reduce((s,p)=>s+(p.price_minor??Math.round((p.price||0)*100)),0);
 const add=(p:Product)=>setCart(c=>[...c,p]);
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
 if(selected)return <div className="app"><main className="shell detail"><button className="icon-btn back" onClick={()=>setSelected(null)}>←</button><div className="detail-image"><img src={selected.image||selected.image_url||""} alt=""/></div><h1>{selected.title}</h1><div className="rating"><b>★ {selected.rating||"—"}</b> {selected.reviews?"("+selected.reviews+" отзыва)":""}</div><div className="seller">♙ {selected.seller||"Продавец ЧИПОК"}</div><div className="price">{money(selected.price_minor??Math.round((selected.price||0)*100),selected.currency)}</div><div className="meta"><div>Наличие<b>{(selected.available_stock??1)>0?"В наличии":"Нет"}</b></div><div>Формат<b>Самовывоз</b></div><div>Комиссия<b>5% с продавца</b></div></div><p className="desc">{selected.description||"Товар из каталога ЧИПОК. Место и время получения покупатель согласовывает с продавцом в чате."}</p><button className="primary wide sticky-buy" onClick={()=>{add(selected);setSelected(null)}}>Добавить в корзину</button></main></div>;

 const page=tab==="home"?<><label className="search">⌕<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Что ищем?"/></label><div className="chips">{cats.map(c=><button key={c} className={"chip "+(cat===c?"active":"")} onClick={()=>setCat(c)}>{c}</button>)}</div><div className="section-head"><h2>Популярное</h2><span>{items.length} товаров</span></div><div className="grid">{items.map(p=><Card key={p.id} p={p} open={()=>setSelected(p)} add={()=>add(p)}/>)}</div></>
 :tab==="catalog"?<><div className="hero"><h1>Каталог</h1><p>Товары от продавцов твоего круга. Без лишних посредников.</p></div><div className="grid">{items.map(p=><Card key={p.id} p={p} open={()=>setSelected(p)} add={()=>add(p)}/>)}</div></>
 :tab==="orders"?<Orders orders={orders} onLoad={loadOrders}/>
 :tab==="chat"?<Chats authHeaders={authHeaders} setMessage={setMessage}/>
 :tab==="profile"?<Profile user={user} sellerProducts={sellerProducts} loadSeller={loadSeller} setMessage={setMessage}/>
 :<Cart cart={cart} total={total} checkout={checkout} loading={loading}/>;

 return <div className="app"><main className="shell"><header className="top"><div className="brand"><div className="brand-mark">Ч</div><div><div className="brand-name">ЧИПОК</div><div className="tagline">Твой маркетплейс. Свои люди. Свои товары.</div></div></div><button className="icon-btn">♧</button></header>{message&&<div className="hero" style={{marginBottom:10}}><p>{message}</p></div>}{page}{cart.length>0&&tab!=="cart"&&<button className="fab" onClick={()=>setTab("cart")}>🛒<span>{cart.length}</span></button>}<nav className="bottom">{[["home","⌂","Главная"],["catalog","⌘","Каталог"],["orders","▣","Заказы"],["chat","◌","Чаты"],["profile","♙","Профиль"]].map(([id,ico,label])=><button key={id} className={"nav "+(tab===id?"active":"")} onClick={()=>{setTab(id);if(id==="orders")loadOrders();if(id==="profile"&&user?.role==="seller")loadSeller()}}><strong>{ico}</strong>{label}</button>)}</nav></main></div>;
}

function Card({p,open,add}:{p:Product;open:()=>void;add:()=>void}){const price=p.price_minor??Math.round((p.price||0)*100);return <article className="card"><button onClick={open} style={{border:0,padding:0,width:"100%",background:"transparent",color:"inherit",textAlign:"left"}}><div className="card-img"><img src={p.image||p.image_url||""} alt={p.title}/><span className="badge">В наличии</span></div><div className="card-body"><div className="card-title">{p.title}</div><div className="rating"><b>★ {p.rating||"—"}</b> {p.reviews?"("+p.reviews+")":""}</div><div className="seller">{p.seller||"Продавец"}</div><div className="price">{money(price,p.currency)}</div></div></button><button className="bookmark" onClick={e=>{e.stopPropagation();add()}}>♡</button></article>}

function Cart({cart,total,checkout,loading}:{cart:Product[];total:number;checkout:()=>void;loading:boolean}){return <div className="hero"><h1>Корзина</h1>{!cart.length?<p>Корзина пуста. Добавь товары из каталога.</p>:cart.map((p,i)=><div className="row" key={i} style={{padding:"12px 0",borderBottom:"1px solid #20323b"}}><img src={p.image||p.image_url||""} alt="" width="54" height="54" style={{borderRadius:12,objectFit:"cover"}}/><div style={{flex:1}}><b style={{fontSize:12}}>{p.title}</b><div className="small">{p.seller||"Продавец"}</div></div><b>{money(p.price_minor??Math.round((p.price||0)*100),p.currency)}</b></div>)}{cart.length>0&&<><p className="small">Комиссия ЧИПОК 5% удерживается из суммы продавца, а не добавляется покупателю.</p><h2>Итого {money(total,"RUB")}</h2><button className="primary wide" onClick={checkout} disabled={loading}>{loading?"Создаём оплату…":"Оформить и оплатить в Telegram"}</button></>}</div>}

function Orders({orders,onLoad}:{orders:Order[];onLoad:()=>void}){useEffect(()=>{onLoad()},[]);return <div className="hero"><h1>Мои заказы</h1>{!orders.length?<p>Здесь появятся твои заказы после первой покупки.</p>:<div className="menu">{orders.map(o=><button key={o.id}><span>#{o.id.slice(0,8)} · {statusRu(o.status)}</span><b>{money(Number(o.total_minor),o.currency)}</b></button>)}</div>}</div>}
function statusRu(s:string){return ({created:"Ожидает оплаты",paid:"Оплачен",seller_confirmed:"Продавец подтвердил",ready_for_handover:"Готов к получению",completed:"Завершён",cancelled:"Отменён",refunded:"Возврат",disputed:"Спор"} as Record<string,string>)[s]||s}

function Profile({user,sellerProducts,loadSeller,setMessage}:{user:User|null;sellerProducts:any[];loadSeller:()=>void;setMessage:(s:string)=>void}){const seller=user?.role==="seller";return <div><div className="profile-card"><div className="row"><div className="avatar">{(user?.first_name||"Ч").slice(0,1)}</div><div><b>{user?.first_name||"Покупатель"}</b><div className="small">{seller?"Продавец":"Покупатель"}</div></div></div>{seller&&<><div className="small" style={{marginTop:16}}>Кабинет продавца</div><div className="menu"><button onClick={loadSeller}>Мои товары <span>{sellerProducts.length} ›</span></button><button onClick={()=>setMessage("Добавление товара: название, цена, остаток, категория и фото. После сохранения товар проходит модерацию.")}>Добавить товар <span>＋</span></button><button onClick={()=>setMessage("Баланс продавца подключён к ledger и будет доступен после подтверждения продажи.")}>Баланс и выплаты <span>›</span></button><button onClick={()=>setMessage("В кабинете продавца доступны заказы и подтверждение наличия.")}>Заказы продавца <span>›</span></button></div></>}</div></div>}


function Chats({authHeaders,setMessage}:{authHeaders:()=>Record<string,string>;setMessage:(s:string)=>void}){
 const [threads,setThreads]=useState<any[]>([]),[active,setActive]=useState<any|null>(null),[messages,setMessages]=useState<any[]>([]),[text,setText]=useState("");
 async function load(){const r=await fetch(api()+"/api/chat/threads",{headers:authHeaders()});if(r.ok)setThreads((await r.json()).items||[])}
 async function open(t:any){setActive(t);const r=await fetch(api()+"/api/chat/threads/"+t.id+"/messages",{headers:authHeaders()});if(r.ok)setMessages((await r.json()).messages||[])}
 async function send(){if(!active||!text.trim())return;const r=await fetch(api()+"/api/chat/threads/"+active.id+"/messages",{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({body:text.trim()})});if(r.ok){setText("");open(active)}else setMessage("Не удалось отправить сообщение")}
 useEffect(()=>{load()},[]);
 return <div className="hero"><h1>Чаты</h1>{active?<><button className="icon-btn" onClick={()=>setActive(null)}>← Назад</button><div className="menu">{messages.map(m=><div key={m.id} className="row" style={{padding:"10px 0"}}><span>{m.body}</span></div>)}</div><div className="row" style={{marginTop:12}}><input className="search" value={text} onChange={e=>setText(e.target.value)} placeholder="Написать сообщение..." style={{flex:1}}/><button className="primary" onClick={send}>➤</button></div></>:threads.length?<div className="menu">{threads.map(t=><button key={t.id} onClick={()=>open(t)}>{t.product_title||"Чат"} <span>{t.last_message||"Открыть ›"}</span></button>)}</div>:<p>Открой товар и начни общение с продавцом.</p>}</div>
}
