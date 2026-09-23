import fs from "fs";

let checks = 0;
function expect(condition: boolean, message: string) {
  checks += 1;
  if (!condition) throw new Error(`FAIL ${checks}: ${message}`);
}

const source = fs.readFileSync("components/orders/OrderConversation.tsx", "utf8");
expect(source.includes('htmlFor="atm-transfer-receipt"'), "custom upload label exists");
expect(source.includes('style={{\n                    position: "absolute"'), "native file input is visually hidden");
expect(source.includes('選擇匯款明細圖片'), "friendly upload CTA exists");
expect(source.includes('JPEG / PNG / WebP · 5MB 以內'), "accepted formats and size are visible");
expect(source.includes('重新選擇'), "selected-file replace action exists");
expect(source.includes('移除已選圖片'), "selected-file remove action exists");
expect(source.includes('claimReceiptInput.current.value = ""'), "file input value resets after remove/submit");
expect(source.includes('accept="image/jpeg,image/png,image/webp"'), "image format restrictions preserved");
expect(source.includes('claimReceipt.size > 5 * 1024 * 1024'), "5MB client guard preserved");
expect(source.includes('transfer-claim'), "ATM transfer claim submission preserved");
console.log(`PASS: Phase 2D.3.1 ATM receipt upload UI — ${checks} checks`);
