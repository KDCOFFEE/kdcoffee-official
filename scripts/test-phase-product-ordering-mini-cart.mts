import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), "utf8");
const [product, miniCart, provider, fullCart, checkout, orderRoute, css] = await Promise.all([
  read("components/commerce/AddToCart.tsx"),
  read("components/commerce/FloatingCart.tsx"),
  read("components/commerce/CartProvider.tsx"),
  read("app/cart/page.tsx"),
  read("app/checkout/page.tsx"),
  read("app/api/orders/route.ts"),
  read("app/globals.css"),
]);

let passed = 0;
function test(name: string, assertion: () => void) {
  assertion();
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")}: ${name}`);
}

const optionCardSource = product.match(/\{options\.map[\s\S]*?<\/div>\s*\{needsPreparation/)?.[0] ?? "";
const addHandlerSource = product.match(/function addSelectedItem\(\) \{[\s\S]*?window\.dispatchEvent\([\s\S]*?\n  \}/)?.[0] ?? "";
const checkoutHandlerSource = product.match(/function goToCheckout\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

test("mini cart renders decrement", () => assert.match(miniCart, />−<\/button>/));
test("mini cart renders increment", () => assert.match(miniCart, />＋<\/button>/));
test("mini cart keeps explicit delete", () => assert.match(miniCart, /className="mini-cart-remove"[\s\S]*?>刪除<\/button>/));
test("mini cart consumes canonical updateQuantity", () => assert.match(miniCart, /subtotal, updateQuantity, ready/));
test("plus requests exactly one additional unit", () => assert.match(miniCart, /updateQuantity\(key, item\.quantity \+ 1\)/));
test("minus requests exactly one fewer unit", () => assert.match(miniCart, /updateQuantity\(key, item\.quantity - 1\)/));
test("minus is disabled at quantity one", () => assert.match(miniCart, /disabled=\{item\.quantity <= 1\}/));
test("plus is disabled at the shared SKU inventory limit", () => assert.match(miniCart, /disabled=\{atStockLimit\}/));
test("mini-cart quantity controls meet the 48px preferred target", () => assert.match(css, /\.mini-cart-quantity button \{ width: 48px; height: 48px;/));
test("provider clamps quantities to at least one", () => assert.match(provider, /Math\.max\(1, Math\.min\(99, Number\(quantity\) \|\| 1\)\)/));
test("provider preserves the existing maximum of 99", () => assert.match(provider, /Math\.min\(99, Number\(quantity\)/));
test("provider applies the shared SKU inventory limit", () => assert.match(provider, /maxForThisLine = Math\.max\(1, stockLimit - otherSkuQuantity\)/));
test("cart badge count is quantity-based", () => assert.match(provider, /count: items\.reduce\(\(sum, item\) => sum \+ item\.quantity, 0\)/));
test("canonical cart subtotal is quantity-based", () => assert.match(provider, /subtotal: items\.reduce\(\(sum, item\) => sum \+ item\.unitPrice \* item\.quantity, 0\)/));
test("mini-cart line subtotal reacts to quantity", () => assert.match(miniCart, /item\.unitPrice \* item\.quantity/));
test("mini-cart total renders canonical subtotal", () => assert.match(miniCart, /subtotal\.toLocaleString\("zh-TW"\)/));

test("Add to Cart has its own mutation handler", () => assert.match(product, /function addSelectedItem\(\)/));
test("Add to Cart still invokes addItem", () => assert.match(addHandlerSource, /addItem\(\{/));
test("Add to Cart passes the selected quantity", () => assert.match(addHandlerSource, /\}, quantity\)/));
test("Add to Cart preserves selected option identity", () => assert.match(addHandlerSource, /optionId: option\.id/));
test("Add to Cart preserves bean or ground preparation", () => assert.match(addHandlerSource, /preparationLabel: prep/));
test("Immediate Checkout uses a dedicated non-mutating handler", () => assert.match(product, /onClick=\{goToCheckout\}>立即結帳/));
test("Immediate Checkout no longer shares a mutation handler", () => assert.doesNotMatch(product, /commit\(goCheckout|commit\(true\)/));
test("Immediate Checkout label is concise", () => assert.match(product, />立即結帳<\/button>/));
test("obsolete buy-and-add label is absent", () => assert.doesNotMatch(product, /立即購買，前往結帳/));
test("Immediate Checkout explains that it does not add again", () => assert.match(product, /直接前往結帳，不會再次加入此商品/));
test("Immediate Checkout is not disabled by the displayed product", () => assert.doesNotMatch(product, /className="buy-now-button"[^>]*disabled/));
test("Immediate Checkout reads canonical cart items", () => assert.match(product, /const \{ addItem, items \} = useCart\(\)/));
test("empty cart returns before navigation", () => assert.match(checkoutHandlerSource, /if \(!items\.length\) \{[\s\S]*setEmptyCartDialogOpen\(true\);[\s\S]*return;[\s\S]*\}[\s\S]*router\.push\("\/checkout"\)/));
test("non-empty cart still navigates to checkout", () => assert.match(checkoutHandlerSource, /router\.push\("\/checkout"\)/));
test("checkout handler never adds or mutates a line", () => assert.doesNotMatch(checkoutHandlerSource, /addItem|updateQuantity|removeItem|setItems/));
test("empty-cart dialog uses native dialog semantics", () => assert.match(product, /<dialog[\s\S]*ref=\{emptyCartDialogRef\}[\s\S]*aria-labelledby="empty-cart-checkout-title"/));
test("empty-cart dialog opens modally", () => assert.match(product, /emptyCartDialogOpen && !dialog\.open\) dialog\.showModal\(\)/));
test("empty-cart dialog contains the approved message", () => assert.match(product, /目前購物車沒有商品，請繼續選購/));
test("empty-cart dialog contains Continue Shopping", () => assert.match(product, />繼續選購<\/button>/));
test("dialog close button has an accessible name", () => assert.match(product, /aria-label="關閉購物車提示"/));
test("closing the dialog restores focus to Immediate Checkout", () => assert.match(product, /window\.requestAnimationFrame\(\(\) => checkoutTriggerRef\.current\?\.focus\(\)\)/));
test("dialog primary action is touch friendly", () => assert.match(css, /\.empty-cart-checkout-action \{[\s\S]*min-height: 54px/));
test("dialog controls have visible keyboard focus", () => assert.match(css, /\.empty-cart-checkout-close:focus-visible,[\s\S]*outline: 3px solid #c69459/));

test("normal specification cards do not expose raw exact stock", () => assert.doesNotMatch(optionCardSource, /現貨\s*\$?\{|現貨\s*\d|現貨上限/));
test("sold-out presentation remains explicit", () => assert.match(optionCardSource, /暫時售完/));
test("existing five-unit low-stock threshold is presented subtly", () => assert.match(optionCardSource, /itemStock > 0 && itemStock <= 5[\s\S]*僅剩少量/));
test("specification price comes from option data", () => assert.match(optionCardSource, /item\.price\.toLocaleString/));
test("KD points come from the existing option value", () => assert.match(optionCardSource, /item\.pvValue\.toLocaleString/));
test("KD-point UI introduces no example-value hardcoding", () => assert.doesNotMatch(product, /350 KD點|250 KD點/));
test("selected specification has a visible check indicator", () => assert.match(product, /buy-option-check/));
test("bean and ground cards retain the two canonical values", () => {
  assert.match(product, /label: "咖啡豆"/);
  assert.match(product, /label: "咖啡粉"/);
});
test("product quantity decrement cannot go below one", () => assert.match(product, /disabled=\{quantity <= 1\}/));
test("product quantity increment respects remaining stock", () => assert.match(product, /disabled=\{remainingStock <= quantity\}/));
test("product quantity controls use 52px targets", () => assert.match(css, /min-height: 52px;[\s\S]*font-size: 24px/));
test("Add to Cart and Immediate Checkout have distinct visual treatments", () => {
  assert.match(css, /\.purchase-cta-group \.add-cart-button[\s\S]*background: transparent/);
  assert.match(css, /\.purchase-cta-group \.buy-now-button[\s\S]*background: #3b2517/);
});
test("very narrow layouts stack the two CTAs", () => assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.purchase-cta-group \{ grid-template-columns: 1fr; \}/));
test("narrow tablet option cards stack instead of becoming cramped", () => assert.match(css, /@media \(min-width: 700px\) and \(max-width: 900px\)[\s\S]*\.product-purchase-chapter \.buy-options,[\s\S]*grid-template-columns: 1fr/));

test("existing full cart still uses canonical quantity updates", () => assert.match(fullCart, /updateQuantity\(key, item\.quantity \+ 1\)/));
test("guest checkout remains explicitly supported", () => assert.match(checkout, /不登入也可以直接以訪客身分購買/));
test("member checkout remains explicitly supported", () => assert.match(checkout, /已登入會員/));
test("checkout line conversion preserves option, preparation, roast, and quantity", () => assert.match(checkout, /items\.map\(\(\{ slug, optionId, optionLabel, unitPrice, preparationLabel, customRoast, roastLevel, roastNote, quantity \}\)/));
test("order creation still uses the inventory transaction", () => assert.match(orderRoute, /runInventoryOrderTransaction/));
test("cart line identity still includes option, preparation, and roast", () => assert.match(provider, /item\.slug[\s\S]*item\.optionId \|\| item\.optionLabel[\s\S]*item\.preparationLabel[\s\S]*item\.customRoast/));
test("phase components do not access protected production data files", () => {
  const changedUi = `${product}\n${miniCart}`;
  assert.doesNotMatch(changedUi, /fulfillment\/state|member-identity\/registry|commerce-state|business-rules|public\/uploads/);
});

console.log(`\nProduct ordering UX + mini cart regression: ${passed}/${passed} PASS`);
