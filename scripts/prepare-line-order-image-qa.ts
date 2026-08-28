import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const requestedRoot = process.env.QA_DATA_DIR;
if (!requestedRoot || !path.basename(requestedRoot).startsWith("kd-line-order-image-qa")) {
  throw new Error("QA_DATA_DIR 必須是專用的 kd-line-order-image-qa* 目錄");
}
const dataRoot = path.resolve(requestedRoot);
await rm(dataRoot, { recursive: true, force: true });
const ordersDir = path.join(dataRoot, "orders");
const uploadsDir = path.join(dataRoot, "uploads", "order-notifications");
await mkdir(ordersDir, { recursive: true });
await mkdir(uploadsDir, { recursive: true });

const sentPhotoName = "10000000-0000-4000-8000-000000000001.webp";
const partialPhotoName = "10000000-0000-4000-8000-000000000002.webp";
const photoData = await sharp({
  create: { width: 640, height: 480, channels: 3, background: { r: 91, g: 57, b: 38 } },
}).webp({ quality: 82 }).toBuffer();
await writeFile(path.join(uploadsDir, sentPhotoName), photoData);
await writeFile(path.join(uploadsDir, partialPhotoName), photoData);

const orderNumber = "KD20260828-9301";
const photo = (fileName: string) => ({
  url: `/uploads/order-notifications/${fileName}`,
  mimeType: "image/webp",
  bytes: photoData.length,
  width: 640,
  height: 480,
});
const order = {
  orderNumber,
  createdAt: "2026-08-28T04:00:00.000Z",
  status: "shipped",
  orderMode: "711_cod",
  customer: { name: "圖片通知隔離測試", phone: "0900000000", email: "line-image-qa@example.test" },
  member: { memberId: "line-image-qa-member", lineUserId: `U${"a".repeat(32)}`, lineDisplayName: "隔離測試會員" },
  store: { id: "QA001", name: "圖片測試門市", address: "台北市測試路 1 號" },
  items: [{ slug: "qa-coffee", name: "測試咖啡", optionLabel: "半磅咖啡豆", quantity: 1, lineTotal: 1000 }],
  subtotal: 1000,
  shipping: 60,
  total: 1060,
  trackingNumber: "QA-TRACKING-001",
  inventoryTransaction: { state: "inventory_committed" },
  lineNotification: { sent: true },
  customerNotifications: [
    {
      id: "notice-sent",
      actionId: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-28T04:10:00.000Z",
      eventType: "order_shipped",
      orderStatus: "shipped",
      channels: ["line"],
      photo: photo(sentPhotoName),
      results: { line: { status: "sent", diagnostics: { messageTypes: ["text", "image"], imageMimeType: "image/jpeg", imageHost: "public.example.test", lineHttpStatus: 200 } } },
    },
    {
      id: "notice-partial",
      actionId: "10000000-0000-4000-8000-000000000002",
      createdAt: "2026-08-28T04:20:00.000Z",
      eventType: "order_shipped",
      orderStatus: "shipped",
      channels: ["line"],
      photo: photo(partialPhotoName),
      results: { line: { status: "partial", error: "文字通知已送出，但圖片公開網址回應不符合 LINE 規格。", diagnostics: { messageTypes: ["text"], lineHttpStatus: 200 } } },
    },
  ],
};
await writeFile(path.join(ordersDir, `${orderNumber}.json`), `${JSON.stringify(order, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ dataRoot, orderNumber }));
