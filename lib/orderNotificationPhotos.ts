import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

import type { CustomerNotificationPhoto } from "@/lib/customerNotifications";
import { getOrderNotificationUploadsDir } from "@/lib/storagePaths";

export const MAX_ORDER_NOTIFICATION_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_LINE_ORIGINAL_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_LINE_PREVIEW_IMAGE_BYTES = 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const STORED_PHOTO_PATTERN = /^[0-9a-f-]{36}\.(?:jpe?g|png|webp)$/i;

export type LineImageAttachment = {
  originalContentUrl: string;
  previewImageUrl: string;
  mimeType: "image/jpeg";
  originalBytes: number;
  previewBytes: number;
};

export class OrderNotificationPhotoError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "OrderNotificationPhotoError";
  }
}

export class LineImageAttachmentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LineImageAttachmentError";
    this.code = code;
  }
}

function configuredPublicOrigin(override?: string) {
  const configured = override?.trim()
    || process.env.MEMBER_SITE_URL?.trim()
    || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) throw new LineImageAttachmentError("public_url_missing", "尚未設定可公開存取的網站網址");
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    return url.origin;
  } catch {
    throw new LineImageAttachmentError("public_url_invalid", "公開網站網址必須使用 HTTPS");
  }
}

export function absoluteOrderNotificationUrl(relativeUrl: string, publicBaseUrl?: string) {
  const origin = configuredPublicOrigin(publicBaseUrl);
  const url = new URL(relativeUrl, `${origin}/`);
  if (url.origin !== origin || url.protocol !== "https:" || url.toString().length > 2000) {
    throw new LineImageAttachmentError("public_url_unsafe", "圖片公開網址不符合安全要求");
  }
  return url.toString();
}

function storedPhotoFileName(photo: CustomerNotificationPhoto) {
  let fileName = "";
  try {
    const url = new URL(photo.url, "https://kd-coffee.local");
    if (url.pathname.split("/").slice(0, -1).join("/") !== "/uploads/order-notifications") {
      throw new Error("Unexpected path");
    }
    fileName = path.basename(url.pathname);
  } catch {
    throw new LineImageAttachmentError("source_url_invalid", "歷史附件路徑不正確");
  }
  if (!STORED_PHOTO_PATTERN.test(fileName)) {
    throw new LineImageAttachmentError("source_url_invalid", "歷史附件格式不受支援");
  }
  return fileName;
}

async function jpegWithinLimit(input: Buffer, width: number, maxBytes: number) {
  for (const quality of [86, 78, 68, 58]) {
    const data = await sharp(input, { failOn: "error" })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (data.length <= maxBytes) return data;
  }
  throw new LineImageAttachmentError("line_size_limit", "圖片無法縮小至 LINE 可接受的大小");
}

async function writeDerivative(filePath: string, data: Buffer) {
  try {
    await fs.writeFile(filePath, data, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return fs.readFile(filePath);
}

export async function prepareLineImageAttachment(
  photo: CustomerNotificationPhoto,
  options: { publicBaseUrl?: string } = {},
): Promise<LineImageAttachment> {
  const origin = configuredPublicOrigin(options.publicBaseUrl);
  const sourceName = storedPhotoFileName(photo);
  const sourcePath = path.join(getOrderNotificationUploadsDir(), sourceName);
  let input: Buffer;
  try {
    input = await fs.readFile(sourcePath);
    const metadata = await sharp(input, { failOn: "error" }).metadata();
    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) throw new Error("Unsupported source");
  } catch {
    throw new LineImageAttachmentError("source_unreadable", "歷史附件無法安全讀取");
  }

  const stem = path.parse(sourceName).name;
  const originalName = `${stem}-line.jpg`;
  const previewName = `${stem}-line-preview.jpg`;
  const dir = getOrderNotificationUploadsDir();
  const original = await writeDerivative(
    path.join(dir, originalName),
    await jpegWithinLimit(input, 1600, MAX_LINE_ORIGINAL_IMAGE_BYTES),
  );
  const preview = await writeDerivative(
    path.join(dir, previewName),
    await jpegWithinLimit(input, 900, MAX_LINE_PREVIEW_IMAGE_BYTES),
  );

  for (const [data, limit] of [[original, MAX_LINE_ORIGINAL_IMAGE_BYTES], [preview, MAX_LINE_PREVIEW_IMAGE_BYTES]] as const) {
    const metadata = await sharp(data, { failOn: "error" }).metadata();
    if (metadata.format !== "jpeg" || data.length > limit) {
      throw new LineImageAttachmentError("derivative_invalid", "LINE 圖片轉檔結果不正確");
    }
  }

  const relativeRoot = "/uploads/order-notifications/";
  return {
    originalContentUrl: absoluteOrderNotificationUrl(`${relativeRoot}${originalName}`, origin),
    previewImageUrl: absoluteOrderNotificationUrl(`${relativeRoot}${previewName}`, origin),
    mimeType: "image/jpeg",
    originalBytes: original.length,
    previewBytes: preview.length,
  };
}

function isJpeg(data: Uint8Array) {
  return data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9;
}

export async function verifyPublicLineImageAttachment(
  attachment: LineImageAttachment,
  fetcher: typeof fetch = fetch,
) {
  const checks = [
    [attachment.originalContentUrl, MAX_LINE_ORIGINAL_IMAGE_BYTES],
    [attachment.previewImageUrl, MAX_LINE_PREVIEW_IMAGE_BYTES],
  ] as const;
  for (const [url, maxBytes] of checks) {
    let response: Response;
    try {
      response = await fetcher(url, { signal: AbortSignal.timeout(8_000), redirect: "follow" });
    } catch {
      throw new LineImageAttachmentError("public_fetch_failed", "LINE 無法讀取圖片公開網址");
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    const data = new Uint8Array(await response.arrayBuffer());
    if (!response.ok || response.redirected || contentType !== "image/jpeg" || !isJpeg(data) || data.length > maxBytes) {
      throw new LineImageAttachmentError("public_image_invalid", "圖片公開網址回應不符合 LINE 規格");
    }
  }
}

export async function validateAndStoreOrderNotificationPhoto(
  file: File,
  actionId: string,
): Promise<CustomerNotificationPhoto> {
  if (file.size < 1 || file.size > MAX_ORDER_NOTIFICATION_PHOTO_BYTES) {
    throw new OrderNotificationPhotoError("照片大小必須在 5MB 以內。");
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new OrderNotificationPhotoError("照片只接受 JPEG、PNG 或 WebP。");
  }
  const extension = path.extname(file.name).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
    throw new OrderNotificationPhotoError("照片副檔名不正確。");
  }

  const input = Buffer.from(await file.arrayBuffer());
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new OrderNotificationPhotoError("照片檔案無法安全讀取。");
  }
  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new OrderNotificationPhotoError("照片格式不正確。");
  }
  const expectedMimeType = metadata.format === "jpeg"
    ? "image/jpeg"
    : `image/${metadata.format}`;
  if (file.type !== expectedMimeType) {
    throw new OrderNotificationPhotoError("照片格式與檔案資訊不一致。");
  }

  const output = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer({ resolveWithObject: true });
  const fileName = `${actionId}.webp`;
  const dir = getOrderNotificationUploadsDir();
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  try {
    await fs.writeFile(filePath, output.data, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  return {
    url: `/uploads/order-notifications/${fileName}`,
    mimeType: "image/webp",
    bytes: output.data.length,
    width: output.info.width,
    height: output.info.height,
  };
}
