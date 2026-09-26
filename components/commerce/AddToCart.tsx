"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "./CartProvider";
import type { CoffeeArtwork, PurchaseOption } from "@/data/websiteData";
import {
  ALLOWED_BEAN_PREPARATIONS,
  ALLOWED_ROAST_LEVELS,
  CUSTOM_ROAST_MIN_QUANTITY,
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

export default function AddToCart({ product, showPv = false, pointDisplayName = "KD點" }: { product: CoffeeArtwork; showPv?: boolean; pointDisplayName?: string }) {
  const { addItem, items } = useCart();
  const router = useRouter();
  const options = useMemo(() => normalizeOptions(product), [product]);
  const [selectedId, setSelectedId] = useState(options[0]?.id || "");
  const [preparation, setPreparation] = useState("咖啡豆");
  const [quantity, setQuantity] = useState(1);
  const [customRoast, setCustomRoast] = useState(false);
  const [roastLevel, setRoastLevel] = useState("");
  const [roastNote, setRoastNote] = useState("");
  const [notice, setNotice] = useState("");
  const [emptyCartDialogOpen, setEmptyCartDialogOpen] = useState(false);
  const emptyCartDialogRef = useRef<HTMLDialogElement>(null);
  const checkoutTriggerRef = useRef<HTMLButtonElement>(null);
  const option = options.find((item) => item.id === selectedId) || options[0];
  const needsPreparation = !!option && isCustomRoastSku(option);
  const selectedLine = option
    ? {
        slug: product.slug,
        optionId: option.id,
        optionLabel: option.label,
        optionDetail: option.detail,
        kind: option.kind,
        quantity,
      }
    : null;
  const customRoastEligible =
    !!selectedLine &&
    isCustomRoastLineEligible(selectedLine);
  const optionStock = option && typeof option.stock === "number" && Number.isInteger(option.stock) && option.stock >= 0 ? option.stock : 0;
  const sameSkuInCart = option
    ? items.reduce((sum, item) => sum + (
        item.slug === product.slug &&
        (item.optionId || item.optionLabel) === (option.id || option.label)
          ? item.quantity
          : 0
      ), 0)
    : 0;
  const remainingStock = Math.max(0, optionStock - sameSkuInCart);
  const unavailable = product.purchasable === false || product.status === "sold_out" || !option || option.enabled === false || optionStock === 0;

  useEffect(() => {
    const dialog = emptyCartDialogRef.current;
    if (!dialog) return;
    if (emptyCartDialogOpen && !dialog.open) dialog.showModal();
    if (!emptyCartDialogOpen && dialog.open) dialog.close();
  }, [emptyCartDialogOpen]);

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
    if (!option) return;
    const requested = Math.max(1, Math.min(99, next));
    const safe = Math.min(requested, Math.max(1, remainingStock));
    setQuantity(safe);
    setNotice(requested > remainingStock ? `目前現貨最多還可加入 ${remainingStock} 包。` : "");
    const nextLine = {
      slug: product.slug,
      optionId: option.id,
      optionLabel: option.label,
      optionDetail: option.detail,
      kind: option.kind,
      quantity: safe,
    };
    if (!isCustomRoastLineEligible(nextLine)) {
      resetCustomRoast();
    }
  }

  function addSelectedItem() {
    if (!option || unavailable) return setNotice("此規格目前暫停供應。");
    if (remainingStock <= 0) return setNotice(`購物車已達此規格的現貨上限（${optionStock} 包）。`);
    if (quantity > remainingStock) return setNotice(`目前現貨最多還可加入 ${remainingStock} 包。`);
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
      stock: optionStock,
    }, quantity);

    const roastText = customRoast ? `・專屬烘焙 ${roastLevel}` : "";
    setNotice(`已加入購物車：${product.name}・${option.label}${prep ? `・${prep}` : ""}${roastText} × ${quantity}`);
    window.dispatchEvent(new CustomEvent("kdcoffee:cart-added"));
  }

  function goToCheckout() {
    if (!items.length) {
      setEmptyCartDialogOpen(true);
      return;
    }
    router.push("/checkout");
  }

  if (!options.length) return <div className="buy-panel unavailable"><p>此作品目前尚未設定販售規格，請先到後台 Commerce 分頁啟用規格。</p></div>;

  return (
    <div className="buy-panel conversion-buy-panel v13-commerce-panel" id="purchase">
      <div className="buy-step"><span>1</span><b>選擇商品規格</b></div>
      <div className="buy-options" role="radiogroup" aria-label="選擇商品規格">
        {options.map((item) => {
          const itemStock = typeof item.stock === "number" ? item.stock : 0;
          const soldOut = itemStock === 0;
          const lowStock = itemStock > 0 && itemStock <= 5;
          const active = option?.id === item.id;
          return <button key={item.id} type="button" aria-pressed={active} className={active ? "active" : ""} onClick={() => chooseOption(item)} disabled={soldOut}>
            <span className="buy-option-copy">
              <strong>{item.label}</strong>
              {item.detail ? <small>{item.detail}</small> : null}
              {soldOut ? <em className="buy-option-stock is-sold-out">暫時售完</em> : lowStock ? <em className="buy-option-stock">僅剩少量</em> : null}
            </span>
            <span className="buy-option-value">
              <b>NT$ {item.price.toLocaleString("zh-TW")}</b>
              {showPv && item.pvEnabled && typeof item.pvValue === "number" ? <small>☆ 可獲得 {item.pvValue.toLocaleString("zh-TW")} {pointDisplayName}</small> : null}
            </span>
            <span className="buy-option-check" aria-hidden="true">✓</span>
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
          <button type="button" aria-label="減少數量" disabled={quantity <= 1} onClick={() => changeQuantity(quantity - 1)}>−</button>
          <span>{quantity}</span>
          <button type="button" aria-label="增加數量" disabled={remainingStock <= quantity} onClick={() => changeQuantity(quantity + 1)}>＋</button>
        </div>
      </div>
      {option && optionStock > 0 && optionStock <= 5 ? <p className="buy-hint buy-availability-hint">僅剩少量，數量仍以結帳前庫存為準。</p> : null}

      {customRoastEligible ? <section className="custom-roast-panel" aria-live="polite">
        <div className="custom-roast-badge">已達 2 磅</div>
        <div><h3>KD Coffee 專屬烘焙服務</h3><p>同一款半磅咖啡豆或咖啡粉達 4 包，可選擇是否調整烘焙度。一般耳掛不提供此服務。</p></div>
        <label className="custom-roast-toggle"><input type="checkbox" checked={customRoast} onChange={(event) => { setCustomRoast(event.target.checked); if (!event.target.checked) { setRoastLevel(""); setRoastNote(""); } }} /><span>我要使用專屬烘焙服務</span></label>
        {customRoast ? <div className="custom-roast-fields">
          <fieldset><legend>選擇烘焙度</legend><div className="roast-level-options">{ALLOWED_ROAST_LEVELS.map((level) => <label key={level} className={roastLevel === level ? "active" : ""}><input type="radio" name="roastLevel" value={level} checked={roastLevel === level} onChange={() => setRoastLevel(level)} /><span>{level}</span></label>)}</div></fieldset>
          <label>風味需求或備註 <small>選填</small><textarea value={roastNote} onChange={(event) => setRoastNote(event.target.value.slice(0,160))} rows={3} placeholder="例如：希望甜感明顯、酸感柔和；實際烘焙仍會依咖啡豆特性由工作室確認。" /></label>
          <p className="custom-roast-caution">專屬烘焙會由工作室確認需求與豆款適合度；若指定烘焙度不適合該豆款，我們會先與你聯繫。</p>
        </div> : null}
      </section> : needsPreparation ? <p className="custom-roast-progress">此規格再選 {Math.max(0, CUSTOM_ROAST_MIN_QUANTITY - quantity)} 包，即達 2 磅並可選擇專屬烘焙服務。</p> : null}

      <div className="purchase-cta-group">
        <button type="button" className="add-cart-button" onClick={addSelectedItem} disabled={unavailable}>加入購物車</button>
        <button ref={checkoutTriggerRef} type="button" className="buy-now-button" onClick={goToCheckout}>立即結帳</button>
      </div>
      <p className="checkout-direct-hint">直接前往結帳，不會再次加入此商品</p>
      {notice ? <p className="commerce-live-notice" role="status">{notice}</p> : null}
      <div className="buy-assurance"><span>✓ 7-ELEVEN 取貨付款</span><span>✓ 工作室自取</span><span>✓ 少量庫存管理</span></div>
      {needsPreparation ? <p className="buy-hint">選擇咖啡粉時，請在結帳備註填寫手沖、義式或其他沖煮方式。</p> : null}
      <dialog
        ref={emptyCartDialogRef}
        className="empty-cart-checkout-dialog"
        aria-labelledby="empty-cart-checkout-title"
        onClose={() => {
          setEmptyCartDialogOpen(false);
          window.requestAnimationFrame(() => checkoutTriggerRef.current?.focus());
        }}
      >
        <div className="empty-cart-checkout-shell">
          <button type="button" className="empty-cart-checkout-close" aria-label="關閉購物車提示" onClick={() => emptyCartDialogRef.current?.close()}>×</button>
          <h2 id="empty-cart-checkout-title">目前購物車沒有商品，請繼續選購</h2>
          <button type="button" className="empty-cart-checkout-action" autoFocus onClick={() => emptyCartDialogRef.current?.close()}>繼續選購</button>
        </div>
      </dialog>
    </div>
  );
}
