export default function Home() {
  return <main style={{maxWidth:760,margin:"0 auto",padding:24,fontFamily:"system-ui"}}>
    <h1>ЧИПОК</h1>
    <p>Маркетплейс внутри Telegram.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
      {["Каталог","Мои заказы","Избранное","Профиль"].map(x=>
        <button key={x} style={{padding:18,borderRadius:14,border:"1px solid #ddd",background:"#fff"}}>{x}</button>
      )}
    </div>
  </main>;
}