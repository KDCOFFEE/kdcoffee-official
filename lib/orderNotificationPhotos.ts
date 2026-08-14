import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

import type { CustomerNotificationPhoto } from "@/lib/customerNotifications";
import { getOrderNotificationUploadsDir } from "@/lib/storagePaths";

export const MAX_ORDER_NOTIFICATION_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export class OrderNotificationPhotoError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "OrderNotificationPhotoError";
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
