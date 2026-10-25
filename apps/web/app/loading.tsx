export default function Loading(){
  return <div className="app"><main className="shell boot"><div className="boot-logo"><img src="/chipok-logo.svg" alt="ЧИПОК" onError={e=>{e.currentTarget.style.display="none"}}/></div><h1>ЧИПОК</h1><p>Загружаем маркетплейс…</p></main></div>;
}
