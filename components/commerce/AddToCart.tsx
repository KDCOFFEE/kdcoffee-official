"use client";

import { useMemo, useState } from "react";
import { useCart } from "./CartProvider";
import type { CoffeeArtwork, PurchaseOption } from "@/data/websiteData";
import {
  ALLOWED_BEAN_PREPARATIONS,
  ALLOWED_ROAST_LEVELS,
  CUSTOM_ROAST_MIN_QUANTITY,
  getProductionBatchQuantity,
  isCustomRoastLineEligible,
  isCustomRoastSku,
  isDripSku,
} from "@/lib/checkoutRules";

const PREPARATIONS = [
  { value: ALLOWED_BEAN_PREPARATIONS[0], label: "咖啡豆", note: "保留完整風味，適合家中有磨豆機" },
  { value: ALLOWED_BEAN_PREPARATIONS[1], label: "咖啡粉", note: "結帳備註沖煮方式，我們協助研磨" },
];

function normalizeOptions(product: CoffeeArtwork): PurchaseOption[] {
  const source = Array.isArray(product.skus) && product.skus.length ? product.skus : product.purchase;
  return (Array.isArray(source) ? source : [])
    .filter((item) => item && item.enabled !== false)
    .map((item, index) => ({
      ...item,
      id: item.id || `${product.slug}-${index + 1}`,
      label: String(item.label || "商品規格"),
      detail: String(item.detail || ""),
      price: Math.max(0, Number(item.price) || 0),
      stock: item.stock === undefined ? product.stock : Math.max(0, Number(item.stock) || 0),
    }));
}

export default function AddToCart({ product }: { product: CoffeeArtwork }) {
  const { addItem, items } = useCart();
  const options = useMemo(() => normalizeOptions(product), [product]);
  const [selectedId, setSelectedId] = useState(options[0]?.id || "");
  const [preparation, setPreparation] = useState("咖啡豆");
  const [quantity, setQuantity] = useState(1);
  const [customRoast, setCustomRoast] = useState(false);
  const [roastLevel, setRoastLevel] = useState("");
  const [roastNote, setRoastNote] = useState("");
  const [notice, setNotice] = useState("");
  const option = options.find((item) => item.id === selectedId) || options[0];
  const needsPreparation = !!option && isCustomRoastSku(option);
  const selectedLine = option
    ? {
        slug: product.slug,
        optionId: option.id,
        optionLabel: option.label,
        optionDetail: option.detail,
        kind: option.kind,
        preparationLabel: needsPreparation ? preparation : undefined,
        quantity,
      }
    : null;
  const aggregateQuantity = selectedLine
    ? getProductionBatchQuantity([...items, selectedLine], selectedLine)
    : 0;
  const customRoastEligible =
    !!selectedLine &&
    isCustomRoastLineEligible([...items, selectedLine], selectedLine);
  const unavailable = product.purchasable === false || product.status === "sold_out" || !option || option.enabled === false || option.stock === 0;

  function resetCustomRoast() {
    setCustomRoast(false);
    setRoastLevel("");
    setRoastNote("");
  }

  function chooseOption(item: PurchaseOption) {
    setSelectedId(item.id || "");
    setNotice("");
    resetCustomRoast();
    if (isDripSku(item)) setPreparation("");
    else setPreparation((current) => current || "咖啡豆");
  }

  function changeQuantity(next: number) {
    const safe = Math.max(1, Math.min(99, next));
    setQuantity(safe);
    setNotice("");
    if (!option) return;
    const nextLine = {
      slug: product.slug,
      optionId: option.id,
      optionLabel: option.label,
      optionDetail: option.detail,
      kind: option.kind,
      preparationLabel: needsPreparation ? preparation : undefined,
      quantity: safe,
    };
    if (!isCustomRoastLineEligible([...items, nextLine], nextLine)) {
      resetCustomRoast();
    }
  }

  function commit(goCheckout: boolean) {
    if (!option || unavailable) return setNotice("此規格目前暫停供應。");
    if (customRoast && !customRoastEligible) return setNotice("專屬烘焙需同一款半磅咖啡豆或咖啡粉達 4 包（2 磅）。");
    if (customRoast && !roastLevel) return setNotice("請先選擇專屬烘焙的烘焙度。");
    const prep = needsPreparation ? preparation || "咖啡豆" : undefined;
    addItem({
      slug: product.slug,
      name: product.name,
      optionId: option.id,
      optionLabel: option.label,
      optionDetail: option.detail,
      preparationLabel: prep,
      customRoast: customRoastEligible && customRoast,
      roastLevel: customRoastEligible && customRoast ? roastLevel : undefined,
      roastNote: customRoastEligible && customRoast ? roastNote.trim() : undefined,
      unitPrice: option.price,
    }, quantity);

    if (goCheckout) {
      window.setTimeout(() => window.location.assign("/checkout"), 80);
      return;
    }
    const roastText = customRoast ? `・專屬烘焙 ${roastLevel}` : "";
    setNotice(`已加入購物車：${product.name}・${option.label}${prep ? `・${prep}` : ""}${roastText} × ${quantity}`);
    window.dispatchEvent(new CustomEvent("kdcoffee:cart-added"));
  }

  if (!options.length) return <div className="buy-panel unavailable"><p>此作品目前尚未設定販售規格，請先到後台 Commerce 分頁啟用規格。</p></div>;

  return (
    <div className="buy-panel conversion-buy-panel v13-commerce-panel" id="purchase">
      <div className="buy-step"><span>1</span><b>選擇商品規格</b></div>
      <div className="buy-options" role="radiogroup" aria-label="選擇商品規格">
        {options.map((item) => {
          const soldOut = item.stock === 0;
          const active = option?.id === item.id;
          return <button key={item.id} type="button" aria-pressed={active} className={active ? "active" : ""} onClick={() => chooseOption(item)} disabled={soldOut}>
            <span><strong>{item.label}</strong><small>{item.detail}{soldOut ? "・暫時售完" : ""}</small></span><b>NT$ {item.price.toLocaleString("zh-TW")}</b>
          </button>;
        })}
      </div>

      {needsPreparation ? <>
        <div className="buy-step"><span>2</span><b>選擇咖啡豆或咖啡粉</b></div>
        <div className="preparation-options" role="radiogroup" aria-label="選擇咖啡豆或咖啡粉">
          {PREPARATIONS.map((item) => <button key={item.value} type="button" className={preparation === item.value ? "active" : ""} onClick={() => setPreparation(item.value)} aria-pressed={preparation === item.value}>
            <strong>{item.label}</strong><small>{item.note}</small>
          </button>)}
        </div>
      </> : null}

      <div className="buy-step"><span>{needsPreparation ? 3 : 2}</span><b>選擇數量</b></div>
      <div className="buy-actions">
        <div className="quantity-control" aria-label="購買數量">
          <button type="button" aria-label="減少數量" onClick={() => changeQuantity(quantity - 1)}>−</button>
          <span>{quantity}</span>
          <button type="button" aria-label="增加數量" onClick={() => changeQuantity(quantity + 1)}>＋</button>
        </div>
        <button type="button" className="add-cart-button" onClick={() => commit(false)} disabled={unavailable}>加入購物車</button>
      </div>

      {customRoastEligible ? <section className="custom-roast-panel" aria-live="polite">
        <div className="custom-roast-badge">已達 2 磅</div>
        <div><h3>KD Coffee 專屬烘焙服務</h3><p>同一款半磅咖啡豆或咖啡粉達 4 包，可選擇是否調整烘焙度。一般耳掛不提供此服務。</p></div>
        <label className="custom-roast-toggle"><input type="checkbox" checked={customRoast} onChange={(event) => { setCustomRoast(event.target.checked); if (!event.target.checked) { setRoastLevel(""); setRoastNote(""); } }} /><span>我要使用專屬烘焙服務</span></label>
        {customRoast ? <div className="custom-roast-fields">
          <fieldset><legend>選擇烘焙度</legend><div className="roast-level-options">{ALLOWED_ROAST_LEVELS.map((level) => <label key={level} className={roastLevel === level ? "active" : ""}><input type="radio" name="roastLevel" value={level} checked={roastLevel === level} onChange={() => setRoastLevel(level)} /><span>{level}</span></label>)}</div></fieldset>
          <label>風味需求或備註 <small>選填</small><textarea value={roastNote} onChange={(event) => setRoastNote(event.target.value.slice(0,160))} rows={3} placeholder="例如：希望甜感明顯、酸感柔和；實際烘焙仍會依咖啡豆特性由工作室確認。" /></label>
          <p className="custom-roast-caution">專屬烘焙會由工作室確認需求與豆款適合度；若指定烘焙度不適合該豆款，我們會先與你聯繫。</p>
        </div> : null}
      </section> : needsPreparation ? <p className="custom-roast-progress">同一 SKU 再選 {Math.max(0, CUSTOM_ROAST_MIN_QUANTITY - aggregateQuantity)} 包，即達 2 磅並可選擇專屬烘焙服務。</p> : null}

      <button type="button" className="buy-now-button" onClick={() => commit(true)} disabled={unavailable}>立即購買，前往結帳</button>
      {notice ? <p className="commerce-live-notice" role="status">{notice}</p> : null}
      <div className="buy-assurance"><span>✓ 7-ELEVEN 取貨付款</span><span>✓ 工作室自取</span><span>✓ 少量庫存管理</span></div>
      {needsPreparation ? <p className="buy-hint">選擇咖啡粉時，請在結帳備註填寫手沖、義式或其他沖煮方式。</p> : null}
    </div>
  );
}
