"use client";
import Link from "next/link";
import { useState } from "react";
import { cartItemKey, useCart } from "@/components/commerce/CartProvider";

const ROAST_LEVELS = ["淺焙", "淺中焙", "中焙", "中深焙"];

function isCustomRoastEligible(item: { optionLabel:string; optionDetail:string; optionId?:string; quantity:number }) {
  const descriptor = `${item.optionLabel} ${item.optionDetail} ${item.optionId || ""}`;
  return item.quantity >= 4 && !/耳掛|drip/i.test(descriptor) && /半磅|咖啡豆|咖啡粉|227g|beans|ground/i.test(descriptor);
}

export default function CartPage() {
  const { items, subtotal, updateQuantity, removeItem, updateCustomRoast } = useCart();
  const [draftNotes, setDraftNotes] = useState<Record<string,string>>({});
  return <main className="commerce-page">
    <header className="commerce-topbar"><Link href="/">KD COFFEE</Link><span>購物車</span><Link href="/works">繼續選購</Link></header>
    <section className="commerce-shell">
      <div className="commerce-title"><p className="eyebrow dark">YOUR SELECTION</p><h1>購物車</h1><p>確認作品、規格與專屬烘焙需求後，再前往填寫取貨資料。</p></div>
      {items.length === 0 ? <div className="empty-cart"><h2>購物車目前是空的</h2><p>從本月作品中，選一杯想帶回家的風味。</p><Link href="/works">探索咖啡作品 →</Link></div> : <div className="cart-layout">
        <div className="cart-list">{items.map((item) => {
          const key = cartItemKey(item);
          const eligible = isCustomRoastEligible(item);
          const note = draftNotes[key] ?? item.roastNote ?? "";
          return <article className="cart-row" key={key}>
            <div className="cart-row-copy">
              <h2>{item.name}</h2>
              <p>{item.optionLabel} · {item.optionDetail}{item.preparationLabel ? ` · ${item.preparationLabel}` : ""}</p>
              {eligible ? <section className="cart-roast-editor">
                <div className="cart-roast-editor-head"><strong>已達 2 磅，可選專屬烘焙</strong><span>選填</span></div>
                <label className="cart-roast-switch"><input type="checkbox" checked={item.customRoast === true} onChange={(e)=>updateCustomRoast(key,{enabled:e.target.checked, roastLevel:e.target.checked ? (item.roastLevel || "淺中焙") : undefined, roastNote:note})}/><span>我要使用專屬烘焙服務</span></label>
                {item.customRoast ? <div className="cart-roast-options">
                  <div className="cart-roast-levels">{ROAST_LEVELS.map(level=><button type="button" className={item.roastLevel===level?"active":""} key={level} onClick={()=>updateCustomRoast(key,{enabled:true,roastLevel:level,roastNote:note})}>{level}</button>)}</div>
                  <label>風味需求或備註<textarea value={note} maxLength={160} rows={2} placeholder="例如：希望甜感明顯、酸感柔和" onChange={e=>setDraftNotes(v=>({...v,[key]:e.target.value}))} onBlur={()=>updateCustomRoast(key,{enabled:true,roastLevel:item.roastLevel || "淺中焙",roastNote:note})}/></label>
                </div> : null}
              </section> : item.customRoast ? <div className="cart-custom-roast"><b>專屬烘焙：{item.roastLevel || "待確認"}</b>{item.roastNote ? <span>{item.roastNote}</span> : null}</div> : null}
              <button className="cart-remove-button" type="button" onClick={() => removeItem(key)}>刪除此商品</button>
            </div>
            <div className="quantity-control"><button type="button" onClick={() => item.quantity <= 1 ? removeItem(key) : updateQuantity(key, item.quantity - 1)}>−</button><span>{item.quantity}</span><button type="button" onClick={() => updateQuantity(key, item.quantity + 1)}>＋</button></div>
            <strong>NT$ {(item.unitPrice * item.quantity).toLocaleString("zh-TW")}</strong>
          </article>;
        })}</div>
        <aside className="cart-summary"><p>商品小計</p><strong>NT$ {subtotal.toLocaleString("zh-TW")}</strong><small>運費將在結帳頁依設定計算。</small><Link href="/checkout">前往結帳</Link></aside>
      </div>}
    </section>
  </main>;
}
