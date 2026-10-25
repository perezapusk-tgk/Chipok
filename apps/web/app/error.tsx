"use client";

import { useEffect } from "react";

export default function Error({reset}:{error:Error & {digest?:string};reset:()=>void}) {
  useEffect(()=>{try{window.Telegram?.WebApp?.ready?.();window.Telegram?.WebApp?.expand?.()}catch{}},[]);
  return <div className="app"><main className="shell boot"><div className="boot-logo"><img src="/chipok-logo.svg" alt="ЧИПОК" onError={e=>{e.currentTarget.style.display="none"}}/></div><h1>ЧИПОК</h1><p>Не удалось открыть Mini App. Попробуй ещё раз.</p><button className="primary wide" onClick={()=>reset()}>Повторить</button></main></div>;
}
