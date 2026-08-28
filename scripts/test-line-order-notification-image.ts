import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-line-order-image-"));
process.env.KD_DATA_DIR = testRoot;
process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.test";
process.env.LINE_CHANNEL_ACCESS_TOKEN = "isolated-test-token-never-sent";

const photos = await import("../lib/orderNotificationPhotos");
const delivery = await import("../lib/customerNotificationDelivery");
const notifications = await import("../lib/customerNotifications");
const storage = await import("../lib/storagePaths");
const imageRoute = await import("../app/uploads/order-notifications/[fileName]/route");

let assertions = 0;
function check(letter: string, message: string, condition: unknown) {
  assert.ok(condition, `${letter}. ${message}`);
  assertions += 1;
  console.log(`PASS ${letter.padEnd(2)} ${message}`);
}

async function source(format: "jpeg" | "png" | "webp") {
  const base = sharp({
    create: { width: 1200, height: 900, channels: 4, background: { r: 91, g: 57, b: 38, alpha: 0.82 } },
  });
  if (format === "jpeg") return base.flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  if (format === "png") return base.png().toBuffer();
  return base.webp({ quality: 88 }).toBuffer();
}

async function stored(format: "jpeg" | "png" | "webp") {
  const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  const extension = format === "jpeg" ? "jpg" : format;
  const data = await source(format);
  const bytes = new Uint8Array(data.length);
  bytes.set(data);
  return photos.validateAndStoreOrderNotificationPhoto(
    new File([bytes.buffer], `fixture.${extension}`, { type: mime }),
    randomUUID(),
  );
}

async function actualDerivative(url: string) {
  const fileName = path.basename(new URL(url).pathname);
  const data = await readFile(path.join(storage.getOrderNotificationUploadsDir(), fileName));
  const metadata = await sharp(data).metadata();
  return { fileName, data, metadata };
}

const template = { eventType: "order_shipped", subject: "測試", text: "KD Coffee 測試通知" };

try {
  const jpegPhoto = await stored("jpeg");
  const jpegLine = await photos.prepareLineImageAttachment(jpegPhoto);
  const jpegActual = await actualDerivative(jpegLine.originalContentUrl);
  check("A", "JPEG 上傳可產生實際 LINE JPEG", jpegActual.metadata.format === "jpeg" && jpegLine.mimeType === "image/jpeg");

  const pngPhoto = await stored("png");
  const pngLine = await photos.prepareLineImageAttachment(pngPhoto);
  const pngActual = await actualDerivative(pngLine.originalContentUrl);
  check("B", "PNG 上傳可產生實際 LINE JPEG", pngActual.metadata.format === "jpeg" && pngLine.originalBytes <= photos.MAX_LINE_ORIGINAL_IMAGE_BYTES);

  const webpPhoto = await stored("webp");
  const webpLine = await photos.prepareLineImageAttachment(webpPhoto);
  const webpOriginal = await actualDerivative(webpLine.originalContentUrl);
  const webpPreview = await actualDerivative(webpLine.previewImageUrl);
  check("C", "WebP 通知附件轉成真正 JPEG 而非改副檔名", webpOriginal.metadata.format === "jpeg" && webpOriginal.data[0] === 0xff && webpOriginal.data[1] === 0xd8);
  check("D", "originalContentUrl 使用公開 HTTPS", new URL(webpLine.originalContentUrl).protocol === "https:");
  check("E", "previewImageUrl 使用 HTTPS 且不超過 1MB", new URL(webpLine.previewImageUrl).protocol === "https:" && webpPreview.data.length <= photos.MAX_LINE_PREVIEW_IMAGE_BYTES);

  let partialPayload: { messages?: Array<{ type: string }> } = {};
  const missingPhoto = { ...webpPhoto, url: `/uploads/order-notifications/${randomUUID()}.webp` };
  const partial = await delivery.sendCustomerLineNotification({
    userId: `U${"a".repeat(32)}`,
    template,
    photo: missingPhoto,
    fetcher: async (_url, init) => {
      partialPayload = JSON.parse(String(init?.body));
      return new Response(null, { status: 200 });
    },
  });
  const partialHistory = notifications.customerNotificationDeliveryOutcome({ channels: ["line"], results: { line: partial } });
  check("F", "圖片轉檔失敗不會記成完整成功", partial.status === "partial" && partialHistory === "partial" && partialPayload.messages?.length === 1);

  let textPayload: { messages?: Array<{ type: string }> } = {};
  const textOnly = await delivery.sendCustomerLineNotification({
    userId: `U${"b".repeat(32)}`,
    template,
    fetcher: async (_url, init) => {
      textPayload = JSON.parse(String(init?.body));
      return new Response(null, { status: 200 });
    },
  });
  check("G", "純文字通知仍成功", textOnly.status === "sent" && textPayload.messages?.[0]?.type === "text" && textPayload.messages.length === 1);

  const publicFetcher: typeof fetch = async (input) => {
    const fileName = path.basename(new URL(String(input)).pathname);
    const data = await readFile(path.join(storage.getOrderNotificationUploadsDir(), fileName));
    return new Response(data, { status: 200, headers: { "Content-Type": "image/jpeg" } });
  };
  let imagePayload: { messages?: Array<{ type: string; originalContentUrl?: string; previewImageUrl?: string }> } = {};
  const imageSent = await delivery.sendCustomerLineNotification({
    userId: `U${"c".repeat(32)}`,
    template,
    photo: webpPhoto,
    publicImageFetcher: publicFetcher,
    fetcher: async (_url, init) => {
      imagePayload = JSON.parse(String(init?.body));
      return new Response(null, { status: 200 });
    },
  });
  check("H", "文字與圖片包含於同一 LINE payload", imageSent.status === "sent" && imagePayload.messages?.map((message) => message.type).join(",") === "text,image");

  let invalidPublicPayload: { messages?: Array<{ type: string }> } = {};
  const invalidPublic = await delivery.sendCustomerLineNotification({
    userId: `U${"d".repeat(32)}`,
    template,
    photo: webpPhoto,
    publicImageFetcher: async () => new Response("ngrok warning", { status: 200, headers: { "Content-Type": "text/html" } }),
    fetcher: async (_url, init) => {
      invalidPublicPayload = JSON.parse(String(init?.body));
      return new Response(null, { status: 200 });
    },
  });
  check("I", "公開圖片驗證失敗會記錄部分成功", invalidPublic.status === "partial" && invalidPublicPayload.messages?.length === 1);

  const historicalName = path.basename(webpPhoto.url);
  const historicalData = await readFile(path.join(storage.getOrderNotificationUploadsDir(), historicalName));
  const historicalMetadata = await sharp(historicalData).metadata();
  const historicalResponse = await imageRoute.GET(new Request(`https://public.example.test${webpPhoto.url}`), { params: Promise.resolve({ fileName: historicalName }) });
  check("J", "既有 Admin WebP 歷史仍可讀取", historicalMetadata.format === "webp" && historicalResponse.status === 200 && historicalResponse.headers.get("content-type") === "image/webp");

  const derivativeResponse = await imageRoute.GET(new Request(webpLine.previewImageUrl), { params: Promise.resolve({ fileName: webpPreview.fileName }) });
  const files = await readdir(storage.getOrderNotificationUploadsDir());
  const fileSetHash = createHash("sha256").update(files.sort().join("\n")).digest("hex");
  check("K", "LINE 衍生檔限於通知目錄且不改全域 WebP 策略", derivativeResponse.status === 200 && derivativeResponse.headers.get("content-type") === "image/jpeg" && files.every((file) => /^(?:[0-9a-f-]{36})(?:-line(?:-preview)?)?\.(?:webp|jpg)$/i.test(file)) && fileSetHash.length === 64);

  console.log(`\nLINE order notification image regression: ${assertions} assertions PASS`);
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
